# Approved imported catalog (staging)

This branch connects the existing composite ingest/review design to the normal catalog and `/plate/[sku]` pages. The public coming-soon deployment is separate and remains unchanged.

The import adapter preserves MMM stock IDs, verified source hashes, frame rate, timecode, source color limitations, preview coverage and tags. One existing matching stock clip retains its SKU/UUID. The eight replaced demonstration records become drafts; they and their media are retained. The limited RLS policy permits a retired plate to remain readable to existing full-access project members only. Public catalog queries explicitly require `live`.

Approved metadata snapshots are stored outside Git under the existing media mount:
`/srv/platelab-coolify/public-media/imported-catalog/approved-imports-20261008/<id>.json`.
Each catalog record contains a source-bound reference. The server checks ID, source fingerprint and approval timestamp before rendering. Approval covers all 16 imported clips and their 1,420 effective observations, including the source-bound scene/mood editorial layer. Warnings about physical synchronization, estimated telemetry, coverage and third-party rights remain facts; editorial approval does not erase them.

Media remains on the existing ingest volume. A narrow Next rewrite proxies `/composite-review/media/*` from the existing public review host, so video, evidence and WebGL previews remain same-origin inside the staging access gate. No original media is moved, copied into Git or deleted. HTTP Range behavior must be checked after deployment.

The imported detail page uses the existing CompositeDetail/CompositePlayer components, including Lab 360, panoramic and full-screen modes, synchronized timeline/GPS/IMU, evidence highlights and category/tag search. Catalog mode shows persisted approvals and a read-only selected poster; it does not write browser-only review choices or send feedback email. The original review app remains separate. Project Studio links select `/imported-stage` for an imported plate and carry its actual coverage limit. The existing `/stage` build is preserved for old project selections.

The checked-in imported-stage bundle comes from `viewer/`; regenerate with `npm run build:imported --prefix viewer` after installing viewer dependencies. Web uses Three.js for the vehicle-attitude component.

## Deployment and rollback

Deploy the new application before promoting catalog records. Install the approved snapshots first, preserving the existing media bind mount. Apply the catalog promotion in one transaction, with exact input identity guards, 16-live/8-retired counts and RLS checks; retain all six existing scene selections. The catalog migration is not run automatically by the app build.

Server-only before-state backup:
`/srv/platelab-coolify/catalog-backups/approved-imports-20261008`.
It contains prior catalog tables, the app image/mounts, approval receipts and the promotion SQL. For rollback, restore only affected old catalog row values/metadata and deactivate newly introduced rows; retain any new project references. Restore app branch `codex/staging-domain-migration`, commit `cb8db2befdc6dadc34f1af2820fc6049166988b1`. Do not restore a whole database, delete imported media, or change passwords/DNS/mail.

Validation: web tests, Next production build, rollback-only database trial and RLS checks, then live catalog counts/search/detail/media-range/360/evidence checks. Embedding jobs are queued; keyword and tag search do not require embeddings. Existing staging has no configured OpenAI embedding worker credentials in its web container.


## Browser preview derivatives

Footage is delivered to browsers as an adaptive bitrate ladder: the player picks
a rung from the connection it measures, starts on a small one so the first frame
arrives quickly, and steps up or down segment by segment. A single 3-4 Mbps file
cannot do that; on a 1.5 Mbps connection it stalls every few seconds.

For the hero and each provisioned catalog clip the builder writes, beside the
source and never replacing it:

| Derivative | What | Used by |
| --- | --- | --- |
| `stream-v1/` | H.264 ladder as two-second CMAF segments with HLS playlists. Hero: 360p, 540p, 720p, 1080p. Composite (full 2:1 frame): 384p, 512p, 640p, 768p, 1024p. | Homepage reel, detail player, Lab 360 (shared decoder) |
| `browser-preview-v1.mp4` | One progressive file capped at 4 Mbps (hero 1920×1080, composite 2048×1024). | Fallback when a ladder is missing or streaming is unsupported; standalone Lab |
| `card-preview-v1.mp4` | 768-pixel progressive file, about 0.2-0.45 Mbps. | Catalog-card hover |

Frame rate, duration, watermarks and GPS/IMU timing are retained. Approved
snapshots, originals and delivery metadata are unchanged.

`web/lib/browser-preview-clips.json` is the explicit provisioned set. Unknown
clips retain their original URL until derivatives are generated and verified.
`web/lib/browserPreview.ts` maps a clip to its derivatives; the smallest rung
names there (`360p`, `384p`) must match the builder's ladders. Do not map every
future clip blindly.

Before deploying a manifest update, run the non-destructive builder on the media
host (two encoder threads by default; use `nice` on a shared host):

```sh
python3 scripts/build-browser-previews.py \
  --manifest web/lib/browser-preview-clips.json \
  --composite-root /home/ubuntu/platelab-composite-ingest/data/public/media/composite \
  --site-root /srv/platelab-coolify/public-media/site
```

`--only hero` or `--only <clip-id>` (repeatable) limits the run; `--threads` and
`--preset` trade encode time for load on the host. Existing outputs are skipped,
so the first run after this change only adds `stream-v1/` and
`card-preview-v1.mp4` beside the existing `browser-preview-v1.mp4` files. Expect
a few minutes per clip at the defaults.

The builder validates duration and publishes each output atomically. It never
replaces `composite.mp4` or the 4K hero. Wait for `COMPLETE`, verify a manifest
clip's `stream-v1/master.m3u8` returns 200 and its `browser-preview-v1.mp4`
returns 206 for byte ranges (including Safari's `bytes=0-1` probe and a
late-file range), then deploy the app. Media files remain runtime assets,
outside Git.

Order and safety:

- **Either order is safe.** If the app is deployed before a ladder exists, the
  player finds no playlist and plays `browser-preview-v1.mp4` as before; a card
  without its hover file falls back the same way. Nothing breaks; that clip just
  does not adapt yet.
- **The hero lives under the app's own `public/media/site/`.** `next start` only
  serves public files that existed when it started, so provision the hero ladder
  before the app starts, or restart the app afterwards. The same applies locally.
  Composite media are served by nginx and need no restart.
- **Versioned names are cached for a year** (`immutable`), by `web/next.config.mjs`
  for the app's public files and by `team-review/nginx.conf` for composite
  media. Never re-encode under an existing name: publish `stream-v2/` (and bump
  the names in `browserPreview.ts`) instead. Header rules in `next.config.mjs`
  do not reach media proxied through the `/composite-review/media/` rewrite, so
  staging depends on the nginx rule as well.
- `NEXT_PUBLIC_ADAPTIVE_STREAMING=0` at build time serves single files only.

Loading order on a detail page is deliberate: poster, then footage, then
everything else. The panoramic view plays as soon as the player is on screen.
Lab 360 (a 3D scene of roughly 2 MB) and the telemetry car model are not
requested until eight seconds of footage are buffered, or until Lab 360 is asked
for by name (its tab, Full Lab, or an "Open in Lab" link). The panorama keeps
playing until Lab 360 has rendered steadily. While Lab 360 downloads it shares
the link with the footage, so the player drops to a smaller rung; when Lab 360
reports ready the player discards the throughput it measured meanwhile and
re-measures on the next segment, instead of taking most of a minute to recover.

Field diagnostics: in the browser console run
`localStorage.setItem('tpl:video-debug', '1')` and reload. Every rung choice,
segment, cache hit and fallback is logged with a `[tpl]` prefix, and the
`<video>` element carries `data-playback`, `data-rung` and `data-throughput`.

Browser regression (requires a running app and Playwright; `ENGINE=chromium`
uses the installed Chrome, `ENGINE=webkit` needs Playwright's WebKit):

```sh
ENGINE=chromium TEST_BASE=http://127.0.0.1:3000 \
  PLAYWRIGHT_MODULE=/path/to/playwright node web/test-browser/streaming-preview.cjs
# A marginal connection. Pages whose ladder is provisioned must keep playing.
ENGINE=chromium RATE_MBPS=1.5 TEST_PATHS=/,/plate/PL-3561787 TEST_BASE=http://127.0.0.1:3000 \
  PLAYWRIGHT_MODULE=/path/to/playwright node web/test-browser/streaming-preview.cjs
```

This tests the hero and two detail plates, including the short clip looping,
through a streaming HTTP proxy capped at 6 Mbps by default. It checks sustained
playback and that decoded frames continue appearing in the panoramic player. At
`RATE_MBPS=1.5` a clip without a ladder is expected to stall: that is the
single-file behavior the ladder replaces. Lab startup keeps the live panorama
visible until three completed render acknowledgements arrive less than a second
apart during playback (one completed render is sufficient for a paused still).
Lab is reported as still loading after 20 seconds and has 60 seconds in all
before the player settles on the panorama; footage plays throughout. The
telemetry car model (the same file Lab needs) is not requested until Lab is up
or has stood down, or 30 seconds after Lab was requested. The 1.5-second
running-render watchdog still detects stalled Lab output, and ignores time in
which the footage itself was waiting on the network. Also run
`web/test-browser/composite-playback.cjs` for media failure and retry behavior.
The staging password gate remains in place.
