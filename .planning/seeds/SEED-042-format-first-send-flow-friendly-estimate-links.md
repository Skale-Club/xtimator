---
id: SEED-042
status: dormant
planted: 2026-07-08
planted_during: v4.17 shipped / no active milestone
trigger_when: When redesigning Send Estimate, public estimate links, delivery channels, or client-facing estimate sharing.
scope: Medium-Large
---

# SEED-042: Format-First Send Flow and Friendly Estimate Links

Redesign the Send Estimate experience around the artifact the owner wants to give the client first, then the delivery channel second.

Today the Send modal is organized mostly by channel (`Email` vs `SMS`) with a separate `Share & Export` menu for link/PDF/plain text actions. That makes the most important system action feel secondary and fragmented. The owner mental model should be simpler:

1. Online estimate preview link
2. PDF
3. Plain text message

After choosing one of those, the owner chooses how to deliver or use it: copy, open, email, SMS, WhatsApp, download, or mark as sent where appropriate.

## Why This Matters

Sending the estimate is one of the highest-value moments in Xtimator. The product promise is not just generating an estimate; it is helping a business owner go from job-site capture to a professional estimate the client can actually review, approve, and act on.

The current modal buries that priority:

- The primary visual choice is currently `Email` vs `SMS`, even though the more important choice is what the client receives.
- Online preview, PDF download, and plain text are split across `SendForm`, `SendActionsMenu`, and `PlainTextSheet`.
- The online estimate link is the most important client experience, but it appears as text inside the email/SMS body or as a menu action.
- PDF is treated as an email attachment checkbox, not as a first-class output.
- Plain text is useful for quick/manual delivery, but it lives in a secondary sheet instead of being one of the three obvious send formats.

A format-first flow matches how owners think: "Do I want to send the live estimate, a PDF, or a message I can paste?" Then: "Do I send that by email, SMS, WhatsApp, or copy/download it?"

## Current State

The current implementation is useful but organized around implementation details:

- `SendDialog` renders a header-level `SendActionsMenu` beside the title, then renders `SendForm`, plus `PlainTextSheet`.
- `SendForm` defaults to channel tabs: `Email` and `SMS`.
- Email defaults include a link to the online estimate and `attachPdf: true`.
- SMS sends a text message with the share link.
- `SendActionsMenu` separately exposes `Copy Share Link`, `Download PDF`, `Copy Plain Text`, and `Edit message...`.
- Public share URLs currently use `/estimate/{share_token}` through `buildShareLink(shareToken)`.
- The public page is `app/estimate/[token]/page.tsx` and resolves via `getEstimateByShareToken(token)`.

This means the user sees channel-first tabs while the actual product formats are scattered across a dropdown, form checkbox, text area, and sheet.

## Proposed UX

Clicking the floating `Send` button should open a clear, compact send hub with three primary choices:

1. **Online Estimate**
   - Primary and recommended.
   - Shows the friendly client URL.
   - Actions: copy link, open preview, send email, send SMS, send WhatsApp if enabled.
   - This should be the default selected option.

2. **PDF**
   - Actions: download PDF, send email with PDF attachment.
   - SMS/WhatsApp need a product decision: either send a link to the PDF/online estimate, or do not offer those channels for PDF if true attachment delivery is not supported.

3. **Plain Text**
   - Generates a formatted message like:

```text
Hey Teste,

Thank you for reaching out to Skale Club! Here is your estimate:

[Service Call & Assessment]
On-site diagnostic visit to assess property and determine scope of requested work: $125.00
dasd: $0.00

Let me know if you have any questions or would like to schedule an appointment. I'd be happy to assist you!

Best regards,
Vanildo de Souza Junior
Skale Club
```

   - Actions: copy, edit, send email, send SMS, send WhatsApp if enabled.
   - The generated message should use sections/items/totals and company signature consistently with the estimate renderer.

Secondary actions:

- `Mark as Sent` remains available, but visually secondary.
- Language selection remains available, but should not dominate the format decision.
- `Share & Export` should probably disappear or become an internal overflow only for rare actions. The top-level send UI should not hide the three core outputs behind a generic menu.

## Friendly Estimate URLs

The desired client-facing URL shape is:

```text
xtimator.com/estimate/{companySlug}/{estimateSlug}
```

Example:

```text
xtimator.com/estimate/skale-club/untitled-scope-assessment
```

Important security note: the current `share_token` acts as a bearer credential. A human-readable slug based only on company and estimate name is guessable, so it cannot safely replace the token unless the system adds a non-guessable public slug/secret somewhere in the path or lookup model.

Recommended planning options:

1. **Friendly path with secret suffix**
   - Canonical URL: `/estimate/{companySlug}/{estimateSlug}-{shortPublicToken}`
   - Keeps URLs readable while preserving unguessability.

2. **Friendly path plus signed query**
   - Canonical URL: `/estimate/{companySlug}/{estimateSlug}?t={shareToken}`
   - Easy to implement, but less clean visually.

3. **Opaque public slug stored server-side**
   - `estimateSlug` is not just the title slug; it is a generated unguessable slug that can include title words plus entropy.
   - Allows the visible shape the user wants while keeping lookup safe.

Whichever option is chosen, keep backward compatibility:

- Existing `/estimate/{share_token}` links should keep working or redirect to the new canonical friendly URL.
- Expiration behavior from `share_expires_at` must still apply.
- Public payload must continue omitting bearer tokens and internal paths.
- Custom domains and white-label routing should still work with the new path.

## Delivery Model

Future delivery records and APIs should capture both dimensions:

```text
format: online_link | pdf | plain_text
channel: copy | open | download | email | sms | whatsapp | manual
```

This makes analytics, audit logs, and future retries clearer than channel-only delivery.

The client should not be responsible for assembling critical delivery bodies forever. Prefer server-side templates per `format + channel`, with the UI passing editable overrides where needed.

## Scope Estimate

**Medium-Large.** This is bigger than a modal restyle because it touches public URL architecture, delivery APIs, templates, logging, and backward compatibility.

Likely phases:

1. **URL Contract + Data Model**
   - Decide the friendly URL security shape.
   - Add slugs/token aliases/migration as needed.
   - Add route support for the new path.
   - Keep `/estimate/{share_token}` backward-compatible.

2. **Send Hub UI**
   - Replace channel-first tabs with three format choices.
   - Build nested channel/actions per format.
   - Keep mobile layout compact and operational.

3. **Delivery APIs + Templates**
   - Normalize API payloads around `format + channel`.
   - Generate online link, PDF, and plain text messages consistently.
   - Clarify PDF behavior for SMS/WhatsApp.

4. **Logging + Tests**
   - Record format/channel in `estimate_deliveries` or a compatible metadata field.
   - Add tests for URL generation, old-link compatibility, Send UI flow, and generated plain text.

## Breadcrumbs

- [`components/workspace/send/send-dialog.tsx`](components/workspace/send/send-dialog.tsx) - current modal composition: title, `SendActionsMenu`, `SendForm`, and `PlainTextSheet`.
- [`components/workspace/send/send-form.tsx`](components/workspace/send/send-form.tsx) - channel-first Email/SMS tabs, email body/link/PDF checkbox, SMS body, mark-as-sent action.
- [`components/workspace/send/send-actions-menu.tsx`](components/workspace/send/send-actions-menu.tsx) - current `Share & Export` menu with copy link, download PDF, copy plain text, and edit message.
- [`components/workspace/send/plain-text-sheet.tsx`](components/workspace/send/plain-text-sheet.tsx) - editable plain text message surface.
- [`components/workspace/send/send-tab.tsx`](components/workspace/send/send-tab.tsx) - non-modal send tab uses the same `SendForm`/`SendActionsMenu` pattern.
- [`components/workspace/estimate/estimate-floating-actions.tsx`](components/workspace/estimate/estimate-floating-actions.tsx) - floating `Photos`/`Send` pill that opens this flow.
- [`components/workspace/estimate/estimate-tab.tsx`](components/workspace/estimate/estimate-tab.tsx) - opens `SendDialog`.
- [`lib/utils/share-link.ts`](lib/utils/share-link.ts) - currently builds `/estimate/{shareToken}`.
- [`app/estimate/[token]/page.tsx`](app/estimate/[token]/page.tsx) - public estimate route using token-only params.
- [`app/estimate/[token]/actions.ts`](app/estimate/[token]/actions.ts) - public accept/decline actions using token lookup.
- [`lib/queries/share.ts`](lib/queries/share.ts) - `getEstimateByShareToken()` and public payload safety.
- [`app/api/estimates/[id]/send/route.ts`](app/api/estimates/[id]/send/route.ts) - email send route with optional PDF attachment.
- [`app/api/estimates/[id]/send-sms/route.ts`](app/api/estimates/[id]/send-sms/route.ts) - SMS route that builds `/estimate/{share_token}`.
- [`app/api/estimates/[id]/send-whatsapp/route.ts`](app/api/estimates/[id]/send-whatsapp/route.ts) - WhatsApp route and delivery format behavior.
- [`app/api/estimates/[id]/pdf/route.ts`](app/api/estimates/[id]/pdf/route.ts) - PDF generation/download endpoint.
- [`lib/utils/estimate-template.ts`](lib/utils/estimate-template.ts) - likely shared source for plain text and message templates.
- [`lib/whatsapp/send-estimate.ts`](lib/whatsapp/send-estimate.ts) - WhatsApp estimate send helper using share URLs.
- [`lib/whatsapp/confirm-actions.ts`](lib/whatsapp/confirm-actions.ts) - confirmation flows that build share link messages.
- [`supabase/migrations/20260409000001_initial_schema.sql`](supabase/migrations/20260409000001_initial_schema.sql) - initial `share_token` column.
- [`supabase/migrations/20260706000007_rls_hardening_indexes_grants.sql`](supabase/migrations/20260706000007_rls_hardening_indexes_grants.sql) - unique index on `estimates(share_token)`.

## Decisions to Lock Before Planning

1. Should the final friendly URL be exactly `/estimate/{companySlug}/{estimateSlug}`, or can it include a short unguessable suffix for safety?
2. Which delivery channels are first-class on day one for each format?
3. Does "PDF via SMS/WhatsApp" mean a PDF file/link, or should those channels fall back to the online estimate link?
4. Should plain text be generated server-side from canonical estimate data, client-side from current props, or both with server validation before sending?
5. Should email/SMS/WhatsApp copy be company-template configurable, estimate-template configurable, or fixed for the first version?
6. Should the Send hub always default to Online Estimate, or remember the user's last used format/channel?
7. Should `estimate_deliveries` gain explicit `format` and `delivery_action` fields, or should this begin as metadata for compatibility?

## Notes

The visual priority should make `Send` feel like the finishing action of the whole product, not a utility drawer. Keep the UI compact, decisive, and mobile-safe.

This seed pairs naturally with `SEED-041` because the owner may configure estimate presentation, then immediately choose how to send the exact artifact the client will see.
