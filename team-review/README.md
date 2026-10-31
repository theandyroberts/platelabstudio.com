# Public composite review

Public URL: https://platelabstudio.com/composite-review/

This is the public review copy of Clip 020. It imports the same detail component as the local pilot and serves the generated composite, evidence, map and Lab assets. The feedback form emails comments, reviewer identity, selected poster time and accepted/dismissed labels to **andy@note15.com**. An optional email sets Reply-To. Poster/label choices remain browser preferences until included in a submitted review; comments are no longer saved to localStorage. Old browser notes are offered as an unsent draft and removed from browser storage only after a successful send. No API keys, source packages, private receipts or local editorial notes are shipped in the website bundle.

## Build

From the repository root:

```sh
node team-review/build.mjs
```

Prerequisites: the completed local composite output, built viewer assets, installed root and viewer dependencies. The generated `team-review/dist/` directory is ignored. Vite compiles the shared React component and CSS; the script copies the public media and viewer, rewrites media URLs under `/composite-review`, and removes private editorial overrides and AI request identifiers.

## Hosting

TPL OVH host `tpl`, directory `/home/ubuntu/platelab-composite-review`:

- `compose.yaml` and `nginx.conf` are copied from this directory.
- `releases/review-20260924/` contains the initial built bundle.
- `releases/review-20260924-label-colors/` adds the visual category system.
- `releases/review-20260924-feedback/` adds working email feedback.
- `current` points to the latest release and is mounted read-only by `platelab-composite-review`.
- A dedicated Traefik HTTPS router matches only the `/composite-review` path on `platelabstudio.com`, `www.platelabstudio.com`, and the legacy `theplatelab.studio` domain. The existing production application, staging application, ingest worker, and catalog are unchanged.
- Nginx runs from a pinned official image, restarts automatically, and supports video range requests. The exact `/composite-review/api/feedback` route proxies to a separate Node email service; static content remains read-only. `noindex,nofollow` asks search engines not to index it; the link is public, not access-controlled.

To update, build locally and upload into a new named release directory. Switch `current` to that release, then recreate this review stack with `sudo docker compose -f compose.yaml up -d --build --force-recreate`. Docker resolves the bind-mounted symlink when creating the container. Preserve the previous release for rollback. To remove the public review, stop only this compose service.

## Verified September 24, 2026

- Standalone production build and shared web TypeScript checks pass.
- Public HTML returns HTTPS 200, MP4 range requests return 206 with the correct 192,969,544-byte asset length.
- Initial standalone browser check: detail page, 75 labels, and correctly prefixed Lab/media URLs. Browser-only comments were subsequently replaced by email feedback.
- Public browser verification: decoded 4096-pixel video plays from the 18-second poster, all detail images loaded, Lab 360 plays with live pitch/roll/yaw, and no browser console errors were reported.
- Production homepage retains its prior coming-soon response.

## Visual labeling update

Seven category colors and SVG icons are defined in `web/components/compositeCategories.tsx` and shared by the category selector, image cards, and evidence dialogs. The selector is a single non-wrapping row immediately above the results, with horizontal scrolling on narrower screens. Selected categories use a solid bright category color and matching border; inactive backgrounds and borders are neutral, with colored icons. Search and result counts sit above the selector. The results show every matching label directly, with no repeated category headings or extra “View all” step. Cards open their displayed evidence frame.

Verified the production bundle in the browser at desktop and 390px mobile widths: category counts, expansion and focus, cross-category search, matching evidence details, keyboard dismissal, no horizontal overflow, and no reported console errors. Shared TypeScript checks and the standalone build pass.

## Email feedback

`feedback/server.mjs` is a dependency-free Node service, built from a pinned official Node image. It uses the existing TPL Resend account and configured sender. Credentials live only in `/home/ubuntu/platelab-composite-review/.feedback.env` (mode 600), with `RESEND_API_KEY` and `FEEDBACK_FROM`. The recipient is fixed in server code; a request cannot choose a different recipient. The service has no published port and shares a separate Docker network with the review nginx container.

Private submission receipts are stored in `feedback-data/` outside the web root (directory mode 700, file mode 600). Each receipt has the submitted comments, generated mail, status, provider email ID and timestamps. A successful response means the email provider accepted the message, not that the recipient has opened it. Failed or uncertain sends preserve the receipt and return an error; the form keeps the text for retry. There is no background resend worker. An unchanged retry retains its submission ID and Resend idempotency key. Confirmed sends are deduplicated from the durable receipt, including after restarts. Ambiguous submissions older than 23 hours require manual review rather than risking duplicate delivery beyond Resend's 24-hour idempotency window.

The endpoint validates origin, JSON, size, reviewer fields, clip, poster time and known label decisions. Nginx limits submissions per client IP (trusting only the actual Coolify proxy subnet, 172.18.0.0/16); the service also caps global hourly attempts. A hidden honeypot reduces simple bot submissions. Comments are plain-text email and are never public. No credentials or provider error details are sent to the browser. The local Next pilot forwards its form through `/api/composite-feedback` to the same live mail endpoint. The standalone Vite preview is visual-only unless served with the nginx/backend stack.

Validation: `node --test team-review/feedback/server.test.mjs`, shared web TypeScript check, and `node team-review/build.mjs`. Browser checks cover desktop/mobile layout, the header feedback link, error messages and preservation of unsent text. The prior compose and nginx configs are retained on the VPS as `*.before-feedback`; previous static releases remain available for rollback.

Provider references: [send email API](https://resend.com/docs/api-reference/emails/send-email), [idempotency behavior](https://resend.com/blog/engineering-idempotency-keys).

Live verification on September 24, 2026: the production form returned a success confirmation for a clearly labeled test addressed to andy@note15.com. The private receipt is `sent`, with provider email ID `01a0d451-469d-76ed-82dd-45c8a03ff021`. Delivery-event lookup was unavailable with the existing key (HTTP 401), so inbox placement was not independently verified. The public endpoint and local Next forwarding route both reject invalid submissions with HTTP 400. All eight backend tests, shared TypeScript checks, production build and nginx config validation pass.

The `review-20260924-selector-row` release updates the selector and results layout. Verified one desktop row without scrolling, mobile horizontal scrolling without page overflow, selected state, category counts, cross-category search, and evidence opening; TypeScript and standalone production build pass.

The `review-20260924-content-label-search` release names the section “Content labeling” and fixes literal-only search. Intersection/junction/crossroads, crosswalk/pedestrian crossing, and traffic light/signal head aliases are normalized in both queries and existing label text. Multiword queries require every term and ignore case, punctuation, accents and excess whitespace. These aliases do not add observations or turn bridge crossings into road intersections. The real clip now returns six observations for “intersection,” including the Mateo Street junction at 56–67 seconds. Five search regression tests, TypeScript and the standalone build pass. Empty search results are described as no matching labels, not as evidence that the feature is absent.

## Persistent Pano / Lab playback

The `review-20260924-playback` release uses one persistent parent video and a preloaded same-origin Lab iframe. Lab borrows the parent video for its Three.js video texture, sharing the decoder and playhead. Models, textures and IMU are loaded before Lab signals readiness; the frame stays panoramic until then. Switching only changes visibility, and hidden Lab rendering pauses after its initial warm-up.

Mouse entry starts muted playback. The central Play button explicitly starts playback, with a guarded retry for an interrupted media play request. The shared transport pauses, seeks and enters fullscreen in either view. Automatic rotation alternates views every five seconds while playing and once Lab is ready. Choosing a view or interacting with Lab turns rotation off; the Auto-switch button restores it. Playback pauses when the player leaves the viewport or the page is hidden. On touch screens, use Play.

Validation: shared TypeScript check, viewer regression suite, viewer and standalone production builds; browser checks for center Play, continuous playhead across manual switches, automatic rotation both ways, and mobile sizing. View controls use larger buttons and a bright selected state.

The `review-20260924-full-lab` release changes automatic rotation to ten seconds and adds Full Lab beside the toggle. Full Lab selects Lab, disables auto-switch, and expands the existing player to fullscreen (a full-window overlay is the fallback). Exit Full Lab or Escape returns to the embedded player with its playhead and camera intact. Verified fullscreen entry, button/Escape exit, continuing playback, mobile controls, TypeScript and production build.

## Content tags and clip search

The `review-20260924-content-tags` release preserves detailed labeling and adds Find similar clips, with clickable tags leading to `/composite-review/review?tag=bridge` (and equivalent tags). Clip 020 has 37 generated tags with supporting label/frame IDs. Search normalizes aliases and plurals; counts represent distinct clips, not observations. The result view includes a search form, tag browser, selected-tag state, clear action, empty state and clip cards that return to detail. Local `/review?tag=...` uses the same component.

`team-review/clips.json` is the explicit public-review allowlist. The build copies only those clip packages and produces a lightweight `catalog.json` for cross-clip tag search. Currently only Clip 020 is public in this review collection; other ingested packages are not automatically exposed. Add reviewed clip IDs to the allowlist when publishing more clips. This does not modify the legacy live catalog database.

The `review-20260924-visible-tags` release moves Content tags directly below the player, adds its tag count and a header Tags shortcut, and explains that clicking a tag opens matching clips. Catalog/clip JSON is fetched without browser caching so refreshed review pages receive current metadata.

The `review-20260924-all-tags` release shows every available tag immediately on detail and search-results pages, without collapsed tag lists, while the catalog is being built.

The `review-20260924-svg-play` release uses SVG play/pause shapes for the hero and transport controls. This prevents iOS emoji substitution while preserving accessible button labels and existing playback behavior.

## Evidence rectangles — October 6, 2026

The live `review-20261006-regions` release adds category-colored rectangles to label thumbnails and enlarged evidence images, with a Hide/Show highlights control. Geometry follows the active image and stays aligned through responsive sizing and letterboxing. Other evidence frames never inherit a box accidentally.

The original Clip 020 has 14 visually checked rectangles across 11 labels. Automatic generation is integrated into `ingest-20261006-regions` but its live API backfill is pending restoration of OpenAI credits. Existing public clip records remain authoritative on the ingest data mount; all three published clips are preserved. See `pipeline/deploy/composite/EVIDENCE-REGIONS.md` for source-bound overrides, retries and validation.

## October 7: vehicle attitude on the map

Lab no longer imports or instantiates the IMU controls, fetches the motion track, or applies sensor rotation to the vehicle. Manual vehicle rotation and camera orbit remain available. Old direct Lab URLs with a motion parameter also ignore it. The shared player no longer passes motion to the iframe.

`VehicleAttitude` adds a rear three-quarter vehicle inside a fixed SVG sphere at the map's lower left. It reads the clip's motion.json and samples the same video playhead, including pause, seek and loop; it has no independent playback clock. The indicator uses the existing assumed upright/screen-rear axis mapping and gravity-corrected quaternion estimate, with 75 ms smoothing. Unlike the retired Lab application, it does not apply creative yaw limits/return, roll leveling, strength scaling or timing offsets. Readouts are relative to the initial pose, not absolute compass heading or a calibrated camera attitude. Missing/invalid motion and uncovered sample times display an unavailable state rather than invented movement.

Validated: 47 viewer tests (including independent IMU axes, uncapped instrument yaw, seek determinism and missing coverage), web TypeScript, viewer and review production builds. Local desktop/mobile checks verified readable vehicle, sphere and axis values, shared time during playback, scrub behavior and Lab readiness without IMU. Release: review-20261007-map-imu; previous review-20261006-regions. Catalog and ingest data remain mounted from their existing authoritative location.

### Compact Ferrari refinement

The map panel is now 112 × 142 CSS pixels on desktop and approximately 84 × 111 on mobile, about one-third of its previous area. The illustrated box vehicle has been removed. A deferred renderer uses the exact `stage/models/ferrari.glb` asset and -90° Y model orientation used by Lab. Fine geometry edges over a subdued depth surface retain its body, glass and wheel shapes without showing far-side wire clutter. It consumes the same IMU quaternion; Lab remains unaffected. No model load or WebGL failure blocks the sensor axes/readouts. The renderer has no animation clock of its own and releases graphics resources on unmount. Verified production build, TypeScript, loaded model and responsive layouts. Release `review-20261007-compact-ferrari`, rollback `review-20261007-map-imu`.
