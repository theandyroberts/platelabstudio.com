# Evidence rectangles — October 6, 2026

Each label may contain `regions: [{evidenceId,x,y,width,height,confidence}]`, normalized to the entire referenced JPEG, plus `regionScope` (`localized`, `whole_frame`, `unresolved`) and `regionNote`. The browser displays only rectangles matching the active evidence image. It prefers a marked evidence image and offers a hide/show control. The source images and movies are unchanged.

The runner now performs prepare → enrich → localize → publish. Localization uses the existing project model and reasoning effort, with ten observations per batch and at most two simultaneous requests. Responses and validated results are cached privately by request hash. Terminal failures retain private audit receipts and clear pending response IDs so a later retry can make progress. Transient failures retain pending IDs. Localization failure is nonblocking for publication and sets localization status to pending; ordinary enrichment failures retain their existing behavior.

Validation rejects out-of-bounds coordinates, invalid confidence, unknown/duplicate labels, incorrect frame references, and inconsistent scopes. Mood, lighting, contextual and temporal observations can remain unboxed. Boxes are approximate image annotations, not temporal object tracking or identification guarantees.

## Current coverage

The initial Clip 020 has 14 visually checked rectangles across 11 observations. Their private source-bound annotations are stored in `data/work/roll-001-clip-020/region-overrides.json`; automatic analysis preserves these. Public localization status is partial. Automated backfill across the three published clips was attempted but the existing OpenAI account returned `credit_balance_exhausted`. No full automatic localization pass has been validated live yet.

## Retry after billing is restored

Use the server's existing private environment file. Run `cli.mjs localize-published` with the clip's exact `COMPOSITE_CLIP_ID`, `COMPOSITE_OUTPUT_ROOT` set to the private `data/region-review` staging root, and `COMPOSITE_WORK_ROOT` set to `data/work`. Stage from the current public clip first; write using atomic replacement (staged media can be hardlinked, but never mutate hardlinked JSON in place).

Inspect a sample of resulting boxes for subject alignment. Only then merge the region fields and localization metadata into the authoritative public record, checking matching source fingerprint and label IDs. Preserve all current labels, tags, media, editorial metadata and catalog entries. Back up the prior record privately before atomic replacement. Apply the same fields to the private enrichment/build records. `publishReview` intentionally retains an existing record for identical source bytes; it does not perform this backfill merge automatically.

Releases: ingest-20261006-regions and review-20261006-regions. Previous releases: ingest-20260929-mmm-compat and review-20260929-ingest. The review container must be recreated after switching its bind-mounted current symlink. Stop the ingest service only when no job is processing, then switch its release and restart.

Validation: 27 composite pipeline tests, shared TypeScript checks, production review build, and browser checks of mobile/desktop alignment, hide/show, and frame-specific annotation removal.

## October 7 recovery and visible controls

Live inspection found only 11 manually reviewed observations on the initial sample; all 13 newly recovered clips had pending localization. Provider retrieval confirmed `incomplete_details.reason=max_output_tokens` at 12,000 output tokens (one response used 11,636 reasoning tokens). This was separate from the resolved billing issue.

The region pass now uses the shared resumable analysis runner with an 80,000-token ceiling, preserving maximum effort. Original logical hashes still identify previously validated 12k receipts so completed work is reused. Every successful pair is saved to private `localization-progress.json`; a failed partner no longer discards successful boxes. Optional publication failures preserve validated partial regions.

`backfill-regions.mjs` checks matching source fingerprint, label identity, description, evidence IDs and region geometry before atomically merging only annotation fields and localization status. It preserves titles, tags, editorial choices and all media. Original public/build/enrichment JSON records have private per-clip backups. Cached results restored 23 additional marked observations (34 across seven clips). Spot checks verified the Mateo building sign, masonry building and tunnel entrance against their actual evidence images. Remaining work is running in the one-off server service `platelab-region-backfill-20261007`; progress is in `data/region-backfill-status.json`. Use the real release path when invoking the script, because its direct-execution guard compares resolved module paths.

The UI has a section-level Show/Hide highlights control and coverage count. Every modal states whether the active frame is marked, scene-wide, unresolved, or pending. An unmarked frame with boxes elsewhere offers View marked frame. No artificial rectangle is drawn for missing annotation data.

Validation: 42 composite tests pass, including paid-request cache reuse, preserved successful parallel batches, source-safe backfill and field preservation. Web TypeScript and review build pass; browser checks covered section/modal hide/show and switching between marked/unmarked evidence. Releases: ingest-20261007-regions-recovery and review-20261007-highlight-controls. Backfill completion is not implied by deploying the UI; check the private status file and public region counts.
