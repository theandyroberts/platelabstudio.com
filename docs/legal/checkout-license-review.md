# Plate Lab Studio — license review brief

Prepared November 18, 2026. **Discussion draft; not approved legal terms.**

The application’s versioned draft is in `web/lib/checkout/license.ts`. Customers can read it at `/license` and download it at `/api/license`. The accompanying PDF reproduces that draft. Checkout acknowledges the review process; it does not execute the draft or collect payment.

## Proposed commercial structure

An order lists source plates and frame ranges, named productions, stage requirements, and an estimated footage subtotal. Plate Lab confirms availability, technical scope, price and timing. The parties then approve the final license and payment requirements before work or licensed use. Each order snapshots the submitted data; later scene edits do not change that record.

Proposed rights cover a named production and its versions/promotional material, worldwide and perpetually, including in-camera LED/projection use and VFX. These are **proposals**, not previously approved business terms. Vendors may handle the assets only to support that production; no general stage library, stock resale, or separate production reuse is included. Camera originals and additional stage deliverables need express scope.

## Decisions for Plate Lab and counsel

- Identify the seller legal entity, physical address, tax registrations and notice contacts.
- Confirm the license grant: per production or broader, territories, term, media, derivatives, promotions, sequels, studio affiliates and reuse pricing.
- Confirm footage ownership and contributor authority. Record actual model/property releases and exclusions per plate. Do not imply blanket brand, building, artwork or person clearance.
- Define payment, deposits, taxes, invoicing, cancellation and whether any booking reserves stock or capacity.
- Approve the technical schedule, stage geometry, HDR/SDR specifications, allowable revisions, acceptance period and defect remedies.
- Set warranties, indemnity and defense process, liability caps/exceptions, insurance, governing law and forum. These are deliberately unresolved in the draft.
- Approve AI tool/training rules, vendor security, retention and deletion. The proposed 30-day rendered-file availability is operational policy for discussion, not a binding cutoff.
- Determine treatment of delivered/completed productions on breach or termination, notice and cure rights, and statutory rights.
- Establish an approved-license publishing and acceptance workflow. The current checkout must remain a request-for-review flow until that exists.
- Decide whether confirmed prices exclude/include customization, taxes and currency conversion. The preliminary invoice is a **pro forma estimate**, not a payable tax invoice or receipt.

## Research sources and relevance

Reviewed November 18, 2026. These are market examples, not legal advice or a claim that their terms fit Plate Lab.

- [Pond5 Content License Agreement](https://www.pond5.com/legal/license): useful structure for defining licensed content, productions, permitted use, restrictions and rights retained. Plate Lab’s draft adds explicit stage/display capture and technical-delivery provisions. No provider wording is copied into the proposal.
- [Getty Images Content License Agreement](https://www.gettyimages.co.uk/eula): useful distinctions among license scopes, preview evaluation, underlying ownership and third-party permissions. Plate Lab should expressly record clearances and exclusions instead of treating footage purchase as universal clearance.
- Prior Plate Lab meeting notes identified purpose, stage output settings, resolution, color and format as order inputs, with a proposed rendered-file retention policy. Those notes are product context, not an approved agreement.

## Email and fulfillment behavior

The customer account receives order details and a PDF preliminary invoice. The billing email is retained as supplied, but confirmation goes to the authenticated account to avoid sending a customer's order to an unverified third party. SMTP failures do not roll back an order. A durable database email queue retries; the saved invoice remains downloadable. Fulfillment milestones are explanatory, not live production tracking: only “Order received” is complete at submission.
