# October 6 ingest recovery

Fourteen of sixteen MMM uploads had failed; two were already published (plus the original review clip). Diagnosis retrieved the actual provider response errors:

- Four transfers: directional labeling ended with `incomplete_details.reason=max_output_tokens` at the original 40,000-token response budget. Completed timeline/opposite-direction passes remain usable.
- Nine transfers: `credit_balance_exhausted`. One had finished all three initial analysis passes and failed during reconciliation; eight had no completed labeling passes.
- Roll 001 / source Clip 026 (stock clip ID ending 0027): two of 977 frames triggered the near-black coverage heuristic, at frame indices 309 and 310. Visual inspection confirmed captured shaded roadway under an overpass, not missing coverage at the crop boundary. A private `coverage-review.json` allows only these exact frames for the matching source fingerprint. Unreviewed violations still block preparation.

A fresh provider request on October 6 confirmed HTTP 429 `credit_balance_exhausted`.

## Deployed behavior

`ingest-20261006-recovery` preserves the maximum-effort model and original source packages. `analysis-response.mjs` reuses completed receipts, resumes active requests, archives terminal failures, and retries a truncated report once with 80,000 output tokens (including reasoning). Retried completed receipts retain both the original logical request hash and actual request hash. Another truncation fails explicitly; partial JSON is never published as finished labels.

Billing errors produce an actionable private receipt, return the transfer to `ready`, and set status `waiting_for_billing`. A private `queue-hold.json` stops the worker from failing every subsequent upload. The worker uses a minimal low-effort 16-token request to the same configured model every 15 minutes; after a successful API acceptance it archives the hold and resumes the ordinary queue. This is only an account-availability check; labeling retains maximum effort. Other manual holds are never released by that check. A network or provider error keeps the hold and cooldown.

All fourteen original transfer directories were moved from `failed` back into `ready`. Previous statuses are backed up privately in each work directory and `data/recovery-20261006.json` records the moves. The intentional server bad-checksum test remains failed. Public catalog contents were unchanged by queue recovery. Uploaders do not need to resend files.

Source and work paths are refreshed by the normal preparation phase after each transfer moves into processing. Completed media and matching AI receipts are reused. Source files, watermarks, validation and publication requirements are unchanged. A clip is published only after successful core labeling and validation; optional region annotation failure retains its existing nonblocking behavior.

## Operations

Current ingest release: `/home/ubuntu/platelab-composite-ingest/releases/ingest-20261006-recovery`.
Rollback release: `ingest-20261006-regions`. Do not roll back to a worker without billing-hold support while this queue is held.

To check status, inspect `data/queue-hold.json`, `data/status/<transfer>.json` and the private work pipeline logs. After credits are restored, the worker resumes within 15 minutes. To request an immediate check, atomically set `nextCheckAt` in the existing billing hold to a past timestamp; do not remove the hold without confirming that API billing works.

Validation: 37 composite tests passed, covering legacy receipt reuse, active response resumption, terminal failure recovery, bounded truncation retry, quota classification, queue hold/release, cooldown, and source-bound coverage exceptions.

## Funded account connected

With the user's authorization, a dedicated `The Plate Lab OVH ingest` key was created in the funded Personal organization / Default project and installed only in the VPS private environment. It has restricted model-list read and Responses write/read permissions. A real request and response retrieval both returned HTTP 200; the first resumed directional labeling request was confirmed `in_progress` on `gpt-6-astra` at `max` effort. The previous key belonged to another organization. No billing or auto-reload settings were changed. The local development environment still has its previous credential.

Private pending receipts from the previous account were archived (54); completed validated analysis receipts remain reusable. Four known truncated passes retain their 80,000-token retry budget. The billing hold was archived, and the service restarted.

The first transfer then hit an overly conservative disk reservation: it requested two more full source copies despite already having generated media. The worker now verifies the source-matched media receipt and every referenced generated asset before allowing a smaller reservation: 2 GiB plus twice the prepared media size, covering publication and further evidence. Missing or mismatched assets retain the full original reservation. No source files were deleted. Eleven worker tests passed, including missing/mismatched cache recovery. The affected transfer was requeued; 14 transfers are processing or queued, and will publish individually after successful validation.
