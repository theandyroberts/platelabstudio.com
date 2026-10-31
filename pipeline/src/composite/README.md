# Composite ingest: local and VPS

This path accepts MMM's finished composite and GPS/IMU package. It does not rebuild nine camera feeds, select Camera 4, upload assets, or write to the production catalog. The generated local catalog is reviewed at `/review` and `/review/roll-001-clip-020`.

## Run

From the repository root (existing project `.env` is reused), run the complete prepare → enrich → local auto-publish sequence:

```sh
npm run composite:run -- ../content/Roll_001_Clip_020
```

To run or resume individual phases:

```sh
npm run composite:prepare -- ../content/Roll_001_Clip_020
npm run composite:enrich -- ../content/Roll_001_Clip_020
npm run composite:publish -- ../content/Roll_001_Clip_020
npm run build --prefix viewer
npm run composite:dev
```

Open `http://127.0.0.1:3100/review/roll-001-clip-020`.

The existing MMM package is accepted unchanged. The pipeline automatically selects a unique `stitched_composite` when present, otherwise a unique `rough_stitch`, for any stock clip ID. Nine-camera proxy assets and the legacy publishing selector do not override that choice. An explicit `--composite-role=rough_stitch` remains available locally when needed. The current pilot supports integer frame rates and explicitly rejects fractional rates pending frame-exact sampling support. The selected asset must be unique, match its declared SHA-256, and match the crop profile's validated dimensions. Never trust a manifest's `checksum_verified` boolean alone.

Prerequisites: Node 22+, Python 3 standard library, FFmpeg/ffprobe, curl, the root workspace dependencies and `viewer` dependencies. The encoder defaults to VideoToolbox on macOS and libx264 on Linux. The VPS pickup service is deployed; see the server handoff guide below. No Python packages are needed. OpenAI API and map retrieval require network access for a first run.

## Outputs and repeatability

- `web/public/media/composite/<clip>/`: one full 4096×2048 H.264 composite, cropped evidence/poster images, rectilinear analytical views, motion track, SVG map and published `clip.json`.
- `sample-data/composite/<clip>/`: package validation, source fingerprints, map-source cache, preparation report, resumable AI request IDs/reports, usage receipts, editorial overrides and append-only publication audit.
- Both generated directories are ignored by Git. Source media is read only.
- Video timing is preserved and verified by frame count/fps. Hashes of the selected composite, telemetry and frame map are checked again on prepare.
- A completed media phase is reused for the same source/config fingerprint. Map data is cached for the same bounds. AI reports are reused for the same request hash; running background responses resume from their saved IDs. Do not remove pending receipts to “retry” a slow response: that creates another billable request.
- `overrides.json` is separate from machine output. Poster/hover selection, notes, title and accepted/dismissed labels survive publication reruns. Label IDs derive from their content/evidence instead of array order.

## Behavior

1. Validate contained real paths (including symlinks), selected asset hashes, telemetry review identity and every sample-to-frame mapping. Reject changed frame counts or corrupt vectors.
2. Encode the full composite once, keeping full 2:1 projection. Flat playback and hover use a stable 4096×1152 upper viewport. The Lab uses the full texture down to the measured common coverage boundary (row 1296 for this sample), independently of the tighter thumbnail crop; it does not stretch the cropped strip onto a sphere.
3. Inspect the lower blank boundary on all decoded frames at reduced resolution. This is a reproducible black-region heuristic, not full-resolution certification. Extract exact one-second timeline frames and four overlapping directional views every four seconds.
4. Read real OpenStreetMap road/building/water/rail geometry and render it to a self-contained SVG. Split route segments at GPS gaps/jumps. The cursor uses recorded time; current map data is not evidence of historical business occupancy.
5. Run three independent vision passes (timeline, early directional, late directional), then inspect requested detail views and reconcile. Defaults: `gpt-6-astra`, reasoning effort `max`, original image detail. Requests use the Responses background API; provider-side storage is enabled as required for resumable retrieval. Retain response IDs, model, effort and token usage. Dollar cost is not guessed.
6. Validate all returned evidence IDs, intervals and candidate poster times. Preserve creative location doubles as interpretation. Brand flags are clearance-review candidates, not legal determinations. Physical motion/grade claims remain qualified.
7. Before publishing the local record, append watermark/QC warnings to the audit. **Absent or uncertain incoming watermark never blocks auto-publication.** No TPL-generated overlay counts as evidence of an incoming watermark.

## IMU implementation

`viewer/src/imu-motion.js` generalizes the algorithm inspected on the Mac mini in Spheris LAB's Clip 11 experiment. It uses the explicit output-frame map, upright/screen-rear axis conversion, averaged duplicate frames, gyro integration, a gravity reference/correction, symmetric smoothing, roll leveling, recentering yaw and video-time lookup. Position stays fixed; the vehicle rotates. Defaults are exposed in the viewer.

This is a port from inspected source behavior, not a byte-for-byte copy or a demonstrated same-Clip-11 visual parity result. Clip 020's mounting is assumed from that profile. The same-take comparison and physical synchronization/mounting confirmation remain review work. Do not use shaped display angles as raw motion labels.

## Local review and tests

The review UI supports panorama and Lab 360 playback, synchronized map/elevation display, searchable seven-layer observations, evidence images and timestamps, clearance flags, poster selection, persistent notes and label decisions. Catalog hover uses the same composite and crop. The local mode does not require Supabase; its middleware exception is limited to explicit review paths on loopback. Editorial writes require a matching Origin and the local-review flag.

```sh
npm run composite:test
npm test
npx tsc --noEmit -p web/tsconfig.json
npx tsc --noEmit -p pipeline/tsconfig.json
```

This is an end-to-end single-take local pilot, not permission to deploy. Before broader ingest, validate other lighting/coverage conditions, capture mounting profiles and flight telemetry, adjust the crop/profile contract, and review source color handling. The sample's source transfer tag is missing; the browser rendition assumes BT.709 and applies no creative grade. Watermarks remain visible.

## Search tags

Enrichment and publication derive a separate `tags: string[]` from supported observation headings. `tagEvidence` retains each tag’s label IDs and frame IDs, and `tagVersion` identifies the vocabulary. `shared/composite/tags.mjs` owns the initial controlled vocabulary and search aliases; extend it with tests as new scene concepts are needed. This preserves concise reusable catalog terms alongside the full time-segmented labels. The string array matches the existing catalog’s tag shape; this pilot does not insert composite records into the legacy production database.

Only visual/combined observations in scene, geography, entities, brands and motion with confidence >= 0.85 and supporting frames qualify. Hypothetical doubles, production suggestions, dismissed observations, uncertain/negated headings and incidental prose mentions do not create factual tags. An unidentified billboard advertiser still permits the observed object tag `billboard`. Viaduct observations also generate the broader `bridge` tag.

`npm run composite:retag -- /path/to/clip-package` backfills an existing local published clip without repeating AI analysis or media rendering. Search tests: `node --test pipeline/test/composite-tags.test.mjs`. Existing local clip records should be retagged once when adding or revising the vocabulary.

## Server handoff

See [the deployed handoff specification](../../deploy/composite/HANDOFF.md) for the exact package format, SSH upload command, atomic pickup protocol, public review destination, status receipts and retry commands. The legacy nine-camera daemon remains separate.
