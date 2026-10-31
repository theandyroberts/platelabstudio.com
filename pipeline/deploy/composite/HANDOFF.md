# MMM / Mistica → The Plate Lab composite ingest

Deployed 2026-09-29 on the OVH VPS `51.81.202.126` (`tpl` in Andy's SSH config).

## Destination and pickup

The existing administrative test connection uses `ubuntu` with an authorized SSH key. Do not distribute that administrative credential to MMM; a restricted producer account is a separate pending hardening item. No API key belongs in an upload.

Server data root: `/home/ubuntu/platelab-composite-ingest/data`

1. Create a unique, lowercase transfer folder under `uploading/`. Use letters, digits and single hyphens, e.g. `mmm-20260929-180000-a1b2c3d4`.
2. Upload **one complete take package** into that folder with rsync or SFTP. Resume interrupted transfers in this same staging folder.
3. After the upload succeeds, atomically rename the folder from `uploading/<transfer>` to `ready/<transfer>`, on this server filesystem. This rename is the completion signal. Never upload directly into `ready` or modify a submitted package.
4. The worker checks every five seconds and processes one clip at a time. It claims the folder in `processing/`, validates it, generates playback/poster/map/motion/evidence, runs four maximum-effort labeling passes, creates search tags, and automatically publishes the completed clip in the review collection.
5. Read `status/<transfer>.json`. States: `validating`, `processing`, `publishing`, `published`, `failed`. A published receipt includes the clip's public URL and warnings. Allow five seconds for the first receipt; `processing` can take substantially longer during analysis.

Use the provided uploader from the producer machine:

```bash
bash pipeline/deploy/composite/upload.sh /absolute/path/to/TAKE_PACKAGE ubuntu@51.81.202.126
```

Or use the same protocol directly (replace the transfer ID with a unique value):

```bash
ssh ubuntu@51.81.202.126 'mkdir -m 700 /home/ubuntu/platelab-composite-ingest/data/uploading/mmm-20260929-180000-a1b2c3d4'
rsync -a --partial --no-links /absolute/path/to/TAKE_PACKAGE/ ubuntu@51.81.202.126:/home/ubuntu/platelab-composite-ingest/data/uploading/mmm-20260929-180000-a1b2c3d4/
# Run only after rsync exits successfully:
ssh ubuntu@51.81.202.126 'mv -T /home/ubuntu/platelab-composite-ingest/data/uploading/mmm-20260929-180000-a1b2c3d4 /home/ubuntu/platelab-composite-ingest/data/ready/mmm-20260929-180000-a1b2c3d4'
ssh ubuntu@51.81.202.126 'cat /home/ubuntu/platelab-composite-ingest/data/status/mmm-20260929-180000-a1b2c3d4.json'
```

The trailing slash on the rsync source is intentional: the manifest must be directly at `<transfer>/07-Delivery/website_package.json`, without another nested take folder. Folder names identify transfers; `stock_clip_id` identifies clips. The same roll/clip number in different jobs is not a unique identity.

## Existing MMM package: five files consumed

```text
TAKE_PACKAGE/
  06-Rough-Stitch/
    finished-composite.mov
  03-GPS-IMU-Logs/
    gps_imu.json
    output-frame-map.json
    gps_imu_validation.json
  07-Delivery/
    website_package.json
```

Send the existing take package unchanged; MMM does not need to build a separate five-file package or rename asset roles. The tree above shows the five files TPL consumes, not a restriction on additional contents.

The media and two telemetry asset paths can differ if the manifest declares them. The manifest and validation-report paths above are fixed. All paths must resolve inside the package; no absolute paths or links escaping it. Nine camera feeds, Camera 4 previews, camera proxies, and full-resolution camera masters are not needed. Extra files, including nine-camera proxies, are ignored and are not published.

### Finished composite

- Exactly **4096 × 2048**, 2:1 equirectangular stitched composite, already assembled by MMM/Mistica.
- MOV or MP4 containing a video stream supported by the server's FFmpeg, e.g. ProRes or H.264. Send the best available finished render; the server makes the browser rendition.
- Constant, integer frame rate **1–60 fps**; Clip 020 is 24 fps. Fractional 23.976/29.97/59.94 are currently rejected, not silently retimed.
- At least two frames; maximum **180 seconds** per clip in this deployment. Split longer takes into separately mapped clip packages upstream.
- Preserve the complete image, original frame timing and source watermark. Do not pre-crop it to 32:9. The server encodes one full H.264 rendition for both panorama and Lab 360, with audio omitted.
- The preview/poster crop is the upper **4096 × 1152** (32:9), starting at x=0/y=0. The coverage check rejects clips whose lower blank region encroaches on this crop. Other capture geometries need a validated crop profile first.
- Missing or uncertain watermark creates a visible warning and receipt alert, but **does not block auto-publication**.

### Manifest

`07-Delivery/website_package.json` uses the existing envelope `spheris.stock.website_package.v1`, with MMM’s existing `rough_stitch` media role. `stitched_composite` is also supported, but no role migration is required. Minimum fields consumed by the service:

```json
{
  "schema": "spheris.stock.website_package.v1",
  "asset_path_base": "take_package",
  "stock_clip_id": "SPH-STK-JOB-UNIQUE-CLIP-0001",
  "source_take": {
    "frame_count": 1615,
    "timecode_in": "07:01:57:00"
  },
  "assets": [
    {
      "role": "rough_stitch",
      "path": "06-Rough-Stitch/finished-composite.mov",
      "checksum_sha256": "REPLACE_WITH_64_HEX_DIGIT_SHA256"
    },
    {
      "role": "gps_imu",
      "path": "03-GPS-IMU-Logs/gps_imu.json",
      "checksum_sha256": "REPLACE_WITH_64_HEX_DIGIT_SHA256"
    },
    {
      "role": "gps_imu_frame_map",
      "path": "03-GPS-IMU-Logs/output-frame-map.json",
      "checksum_sha256": "REPLACE_WITH_64_HEX_DIGIT_SHA256"
    }
  ]
}
```

Exactly one selected composite, one `gps_imu`, and one `gps_imu_frame_map` asset are required. If both composite role names appear, a unique `stitched_composite` takes precedence; otherwise a unique `rough_stitch` is used. Compute SHA-256 **after the files are final**; the server recomputes it and does not trust a `checksum_verified` flag. `stock_clip_id` must be stable and unique across jobs. Changed media/telemetry for an already published stock ID is rejected; assign an explicit new revision ID. `rough_stitch` is accepted for every stock clip ID, including the planned Roll 1 Clips 11 and 19 tests. Legacy nine-camera publishing-selector metadata is ignored by this composite ingest.

### GPS/IMU samples

Use MMM's current `gps_imu.json` shape, preserving native sample values and frame anchors:

```json
{
  "take": { "start_frame": 607608 },
  "samples": {
    "gps": [
      { "tc_frames": 607609, "latitude": 34.03641, "longitude": -118.22027,
        "altitude_meters": 62, "host_wall_clock": "2024-01-04T15:01:57.215Z" }
    ],
    "imu": [
      { "tc_frames": 607609,
        "raw_accel": { "x": 0, "y": 9.8, "z": 0 },
        "raw_gyro": { "x": 0, "y": 0, "z": 0 },
        "raw_mag": { "x": 0, "y": 0, "z": 0 } }
    ]
  }
}
```

This is a shape illustration, not a valid complete clip: both tracks require at least two samples, and every supplied sample must be mapped. GPS latitude/longitude/altitude and acceleration/gyro x/y/z must be finite numbers; latitude/longitude must be in range. GPS wall clock must be an ISO date/time. Magnetometer values are optional. Preserve the current MMM sensor conventions; do not invent a reference pose, rescale motion, or stretch tracks to match the movie. The viewer continues to label its IMU orientation as estimated.

### Frame map

`output-frame-map.json` must describe the **delivered composite**, including any upstream trimming:

```json
{
  "canonicalStartFrame": 607608,
  "fps": 24,
  "frameCount": 1615,
  "frameIndexBasis": "zero-based",
  "tracks": {
    "gps": [{ "outputFrame": 1, "sampleIndex": 0 }],
    "imu": [{ "outputFrame": 1, "sampleIndex": 0 }]
  }
}
```

Again, illustrative rows only. Each output frame is in `[0, frameCount - 1]`; rows are ordered by outputFrame, each sampleIndex is unique within its track, and every supplied sample appears exactly once. Multiple distinct samples can map to one frame. For every mapped sample:

```text
sample.tc_frames - canonicalStartFrame == outputFrame
```

`canonicalStartFrame` equals telemetry `take.start_frame`. Map fps and frameCount must match the actual decoded movie; manifest `source_take.frame_count` must match too. Frame mapping does not prove physical sensor/camera synchronization.

### Validation report

`03-GPS-IMU-Logs/gps_imu_validation.json` must include:

```json
{
  "state": "verified",
  "stockClipID": "SPH-STK-JOB-UNIQUE-CLIP-0001",
  "fileHashes": {
    "gps_imu.json": "REPLACE_WITH_TELEMETRY_SHA256",
    "output-frame-map.json": "REPLACE_WITH_FRAME_MAP_SHA256"
  },
  "physicalSynchronizationProven": false,
  "quarantinedRecords": 0
}
```

Keep MMM's additional validation/provenance fields where applicable. Do not label unreviewed telemetry as verified just to pass ingest. Bad hashes, invalid timing, missing tracks, incompatible media, and crop failures hold publication and produce a failed receipt. A missing watermark alone does not.

## Outputs and operations

- Public browse/search: https://theplatelab.studio/composite-review/review
- Each completed receipt supplies `/composite-review/review/<clip-id>`.
- Public derived files: `data/public/media/composite/<clip-id>/`; catalog: `data/public/catalog.json`.
- Raw completed packages: `data/archive/<transfer>/`; failed packages: `data/failed/<transfer>/`.
- Private work, AI receipts, overrides and processing logs: `data/work/<clip-id>/`.
- There is **no automatic deletion** of source packages or receipts. Monitor disk usage; processing refuses insufficient space. Schedule retention separately when desired.
- Completed analysis and pending background-response IDs are reused on retry. Do not delete them to retry a slow request; that can cause duplicate API billing.
- The review web server sees only generated public files. API credentials live in a private server environment file, outside releases and public media.
- Feedback for all published review clips emails Andy through the existing feedback service.

```bash
ssh ubuntu@51.81.202.126 'sudo systemctl status platelab-composite-ingest --no-pager'
ssh ubuntu@51.81.202.126 'sudo journalctl -u platelab-composite-ingest -n 50 --no-pager'
ssh ubuntu@51.81.202.126 'tail -50 /home/ubuntu/platelab-composite-ingest/data/work/CLIP_ID/pipeline.log'
```

To retry a transient failure after correcting its cause, atomically move that transfer from `failed/` back to `ready/`. It reuses work by clip ID. Do not reuse an archived transfer folder name for another upload. For a corrected package with changed source bytes, use a new revision stock ID and transfer ID. Source media is never changed in place by ingest.

Service code: `/home/ubuntu/platelab-composite-ingest/current` → `releases/ingest-20260929-mmm-compat`. Service definition: `/etc/systemd/system/platelab-composite-ingest.service`. It restarts on failure, resumes claimed transfers after restart, uses a process lock, and limits processing to two CPU cores and 3 GB memory.

### Relationship to the old ingest

This is the new **composite review-catalog ingest**. It does not use the old nine-camera `/api/ingest/handoffs` announce/uploaded handshake, does not put new composites into the legacy production database, and does not replace the existing Coolify nine-camera worker. The current public review collection is the publication destination. Keep upstream composite deliveries on the new filesystem handoff above.

To stop this new ingest without affecting the legacy service:

```bash
ssh ubuntu@51.81.202.126 'sudo systemctl stop platelab-composite-ingest'
```

Review UI rollback assets are retained under `/home/ubuntu/platelab-composite-review/releases/review-20260924-svg-play`; prior web/feedback configurations are backed up beside the active ones with `pre-ingest-20260929` in their names. Restore the old compose/nginx configuration and feedback source together when rolling back the public mount change.
