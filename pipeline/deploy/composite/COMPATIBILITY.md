# Existing MMM package compatibility

Active release: `ingest-20260929-mmm-compat`.

- Removed the Clip 020 stock-ID exception. Existing `rough_stitch` assets are accepted for every stock ID.
- Both the server worker and local CLI select a unique `stitched_composite` when present, otherwise a unique `rough_stitch`.
- No new package, asset-role rename, or removal of camera proxies is required from MMM. Existing nine-camera publishing-selector metadata is ignored by composite selection.
- Duplicate/missing composite candidates still fail. Checksum, path containment, telemetry validation and frame mapping checks remain enabled.
- All 22 composite tests passed locally and on the VPS, including queue/publication regression fixtures for arbitrary Clips 11 and 19 and rejection of a bad rough-stitch checksum.
- Actual Clip 020 media/telemetry validated on the VPS in a private fixture with a non-Clip-020 stock ID. Its existing rough_stitch role and nine-camera metadata were retained. This fixture was not published.
- Actual Roll 1 Clips 11 and 19 have not been validated or processed by this compatibility check; their submitted packages will undergo the normal validation.

The restricted producer account and other security hardening discussed separately are still pending. This deployment changes package compatibility only.
