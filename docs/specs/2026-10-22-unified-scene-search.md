# Unified scene search

Source: the October 22, 2026 Google Meet discussion, especially 00:50-00:58
and the final workflow agreement at 01:08-01:12. The later agreement permits
public searching, superseding the earlier suggestion to require a scene first.

## Implemented decisions

- `/browse` is the single search experience for anonymous and signed-in visitors.
- Creating a scene and choosing Search opens `/browse` with the original footage
  description (or scene name when empty), not generated keywords or inferred
  production constraints. Existing scene bookmarks redirect there too.
- Search edits and filters are temporary catalog queries, not scene edits.
  Edit the saved scene name and brief explicitly from the project table.
- The selected project/scene is the default save destination. Changing it does
  not replace the search; Search this scene explicitly restores its brief.
- Remember the last accessible scene within the browser session. All scene data
  and saves still require Supabase authentication and project permissions.
- A Save to scene click prompts anonymous visitors to sign in, retaining the
  search and pending SKU through login/account creation and project creation.
- Saved clips are in a responsive side drawer. Add to quote uses the existing
  `selected` status; shortlisted and submitted legacy states remain readable.
  Dismiss and restore do not delete catalog media or saved in/out ranges.
- Public project forms no longer expose script/JSON import, page numbers, AI
  descriptor priorities, or inferred vehicle/stage metadata. Existing metadata,
  reviewed import parsing, and ingest tooling are preserved.
- The existing plate contact link is labeled Request a quote. This is an email
  contact action, not an implemented checkout or quote-submission service.

## Deferred

Resolution pricing, a quote questionnaire, company/delivery requirements and
automated quote submission still require the team's pricing and questionnaire
inputs. No price tiers, contracts, or payment behavior were invented here.

## Verification

- Unit tests cover scene-search URLs, unchanged descriptions, pending save
  context, membership-bound reads, anonymous saves, RPC permissions, unavailable
  clips and legacy counts.
- Desktop/mobile browser checks exercise search, filters, sign-in return URLs,
  destination switching, saved drawer, quote/dismiss/restore, and Studio frame
  context. Signed-in browser mutations use API fixtures, not real project data.
- No schema migration is required. The existing authenticated Supabase client,
  RLS policies, `add_clip_to_scene` RPC and versioned status API are reused.
