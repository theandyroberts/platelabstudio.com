# Order submission and fulfillment

Routes: `/order` → `/order/checkout` → `/order/[orderId]`.

This flow submits a request for confirmation. It does not charge a card, execute the discussion-draft license, or start rendering. The approved licensing, invoicing and fulfillment steps remain staff-operated. Only the first fulfillment milestone is shown as completed.

## Deploy

1. Apply `supabase/migrations/20261118010000_order_checkout.sql` to the target Supabase database.
2. Configure server-only `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_SMTP_HOST`, `ORDER_SMTP_PORT`, `ORDER_SMTP_USER`, `ORDER_SMTP_PASS`, `ORDER_EMAIL_FROM`, `ORDER_EMAIL_JOB_SECRET`. Use the existing verified mail provider. Set `NEXT_PUBLIC_SITE_URL` to the site's public HTTPS origin.
3. Build/deploy the website. The PDF font under `web/lib/checkout/fonts` must be included in the runtime.
4. Schedule an authenticated POST to `/api/internal/order-email` every five minutes. Keep the bearer secret in protected server configuration, never source control. The handler works through up to 50 pending records per call; each is capped at 10 attempts with a five-minute lease/cooldown. Investigate exhausted rows rather than silently discarding them.

## Data and access

`plate_orders` holds an immutable submitted snapshot, including contact, clip-to-stage assignments, delivery intent, plate source ranges, estimated pricing, and the reviewed license version. Customers can read only their own submissions. The server-only submission function verifies scene edit access, locks scenes and clips, rechecks versions/ranges/pricing and clears only submitted order memberships. Scene associations and chosen status remain intact. Repeated requests with the same user/submission key return the same order.

Confirmation goes to the authenticated account email. The supplied billing email is saved separately. No new mailing list or marketing subscription is created. Failed email never invalidates the order. Invoice download requires the owning user's session; client responses are not publicly cached.

The database queue claims one sender at a time. SMTP acceptance is recorded as sent; it is not proof of inbox delivery. As with SMTP generally, a connection failure after provider acceptance can leave uncertain delivery and a retry may duplicate the confirmation. Messages use a deterministic Message-ID for correlation.

## Operations

Use restricted server-side database access to review `plate_orders` where status is `submitted`. These records contain billing PII and must not be exported to public logs or shared broadly. Email status, attempt counts and timestamps are available on each record. No public admin order endpoint is provided by this change.

Confirm the stage, source ranges, pricing, delivery format and date with the customer; prepare the legally approved license and final payable invoice; start customization only after the agreed approvals/payment. `/license` is explicitly a discussion draft. Counsel decisions and research are in `docs/legal/checkout-license-review.md`.

## Verification

Web tests cover required fields, stage alternatives, duplicate clip assignment rejection, draft acknowledgment, range/estimate formatting, escaping of email content, multipart PDF attachments and multi-page PDF output. Database checks verify stale versions, price changes, idempotency, order membership clearing without deleting scene clips, single email claims, server-only writes and cross-account RLS. Use isolated QA projects and do not send customer emails during tests.

## Separate contact and stage steps (November 18 update)

Checkout now progresses through Contact & billing → Stage identification → Review & submit. Back navigation between those steps preserves entered values during the visit. Stages are assigned to scene-clip IDs, not projects: clips in the same project may use different stages, and several clips can share a stage. Every order item must be assigned exactly once. Historical orders with project-level stage briefs remain readable.

“Stage information later” is a valid assignment. Its saved mode is `later`, and the delivery warning appears in checkout, the confirmation, email and preliminary invoice. Do not prepare footage for those items until the customer supplies a confirmed target stage and output specification. The existing contact route on the order confirmation is available for supplying updates to the team.

### Certified stage catalog

Apply `20261118020000_certified_stages.sql`. The existing staff-only stage-profile editing policy governs certification. No simulation presets are automatically promoted. A catalog entry must be active and have:

- `certified_at`: the date its delivery specifications were confirmed.
- `certification_reference`: a non-sensitive reference identifying the confirmation evidence. Stage profiles are publicly readable; do not store private correspondence or credentials here.
- `checkout_spec`: an object with `company`, `shape` (`flat` or `curved`), `units` (`ft` or `m`), positive `width` and `height`, `arc` (1–360 for curved; null for flat), `upper` (`led-ceiling`, `front-projection`, `rear-projection`, or `none`), and optional `upperNotes` and `notes`. Width means diameter for a curved wall.

The dropdown includes only profiles passing those completeness checks. `name` and location come from the stage profile. At submission, the server reloads the active certified record and copies its confirmed specification into the order; browser-supplied dimensions cannot override it. Deactivated or no-longer-certified choices require reselection. Without certified records, checkout explains the empty catalog and keeps manual/deferred options available.
