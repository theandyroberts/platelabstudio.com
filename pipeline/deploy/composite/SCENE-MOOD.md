# Scene and Mood labels

Deployed 2026-10-07 across the sixteen public review clips.

- Scene: concise, recognizable settings an art director can picture using (warehouse district, homeless encampment, gleaming business center).
- Mood: evocative subjective readings of specific sections, with evidence frames and timestamps. Mood uses `category: mood`, `evidence: inference`, and whole-frame localization.
- Factual lighting and weather notes belong to Production value.

The ingest enrichment schema and prompt now use eight categories. The localizer completes moods as whole-frame observations without requesting object rectangles.

## Existing clips

Reviewed corrections live in `editorial/scene-mood-v2/<clip-id>/label-editorial.json`. The public copy is beside each clip.json and linked from its catalog entry via `labelEditorialURL`. The public browser loader and local Next loader apply the same `shared/composite/label-editorial.mjs` function.

Each file is bound to its source fingerprint and exact original label headings/categories. Existing scene corrections retain IDs and the latest highlight rectangles. Additional moods have their own IDs, source-label references and valid timed evidence. Original AI records and receipts remain intact; the active region worker can continue publishing rectangles without overwriting this editorial layer. Consumers needing the reviewed labels should load clip.json and its label-editorial.json together. Mood headings never generate factual search tags.

This is deliberate separation of human editorial corrections from machine localization, not another AI pass. No source footage was changed or relabeled through the paid API for this update.

Backups of the original public catalog and previous ingest source are private under `data/editorial-backups/20261007-scene-mood` on tpl. Review release: `review-20261007-scene-mood`; prior release: `review-20261007-highlight-controls`.
