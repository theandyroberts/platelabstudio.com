# VPS deployment verification — 2026-09-29

Active release: `/home/ubuntu/platelab-composite-ingest/releases/ingest-20260929-final`.
Service: `platelab-composite-ingest` (active, enabled at boot).
Review UI release: `review-20260929-ingest`.

Verified:

- 27 local pipeline, tagging, queue, publication and feedback tests pass.
- Web TypeScript check and public review build pass.
- Actual Clip 020 package uploaded over SSH and automatically claimed from `ready/`.
- Original 4.4 GB source hashes and GPS/IMU frame mapping validated on the VPS.
- New `stitched_composite` manifest role independently validated against the real source: 4096×2048, 24 fps, 1,615 frames, 1,560 GPS and 1,560 IMU samples.
- Fresh Linux/libx264 playback rendition preserved dimensions, frame rate and frame count.
- Every source frame checked for lower blank-area coverage: 1,615 inspected, zero crop violations; black boundary estimate row 1296 versus crop bottom 1152.
- Generated 68 timeline images and 68 directional views; map contains 1,302 features.
- The original 75-label completed analysis was reused for the identical validated source. A separate fresh image request to the configured `gpt-6-astra` model at `max` effort completed successfully from the VPS using the existing project key.
- Real generated media and metadata passed first-publication assembly in an isolated private test directory; no synthetic clip was added to the public collection.
- Deliberately corrupt upload failed with `Checksum mismatch: stitched_composite` and was quarantined privately.
- Service restart and a second delivery reused completed work and published successfully; public catalog still contains exactly one Clip 020 entry.
- Public page, catalog, clip record, video and Lab assets return HTTP 200. Feedback rejects unknown clips. Feedback tests use a mock sender; no deployment-test email was sent.
- Existing Coolify nine-camera ingest remains running.

Server receipts:

- `data/status/server-validation-clip-020.json`
- `data/status/server-validation-bad-hash.json`
- `data/status/server-validation-retry.json`

The deployment publishes new composites to the public **review collection**, not the legacy production database. This test reuses completed Clip 020 analysis; it is not a fresh four-pass relabeling of that clip.
