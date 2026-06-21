# Phase 98 — WhatsApp Template Notifications (CONTEXT)

> **Milestone:** v4.4 WhatsApp Notifications · **Phase:** 98 · **Status:** Not started
> **Created:** 2026-06-20 (manually — GSD tooling backend absent on this machine; see STATE.md setup note)
> **Source:** approved plan-mode plan `C:\Users\Leila\.claude\plans\analyze-deeply-the-part-sunny-pearl.md`

## Problem / Why

The profile-settings phone field (`components/settings/profile-section.tsx:116-132`) tells the owner
the number is *"Used for account recovery and WhatsApp notifications."* That promise is **unbacked** —
nothing in the codebase ever sends a WhatsApp message *to* the owner.

It's "difficult" because of a hard Meta rule, not an oversight:

- All Xtimator outbound WhatsApp goes through `sendWhatsAppMessage()` (`lib/whatsapp/client.ts:14`)
  as `type: 'text'` / `type: 'document'`.
- Free-form messages only deliver **inside the 24-hour customer-service window** (after the recipient
  messages the business number first). That's why the welcome message only fires on first **inbound**
  contact (`lib/whatsapp/send-welcome.ts:4-6`).
- A true business-initiated **notification** (sent whenever we choose, outside 24h) is only allowed via
  a **pre-approved message template (HSM)**, sent as `type: 'template'`. Xtimator has **zero** template
  usage today.

## xphere relationship

`xphere` (`C:\Dev\xphere`) is a sibling product that already runs a complete Meta Cloud template
system (create/submit → Meta approval via webhook → send via 4 paths). Per the decision to **reuse
Xtimator's own WABA**, xphere is the **read-only reference implementation we port the send shape
from** — NOT a runtime dependency. The "free app for creating templates" is **Meta's WhatsApp
Manager** (in Business Manager) — the official, free console for authoring + submitting templates.

Reference files (read-only):
- `C:\Dev\xphere\src\lib\whatsapp\cloud\send-template.ts` (send shape)
- `C:\Dev\xphere\src\lib\whatsapp\cloud\types.ts` (`MetaTemplateComponent`, variable arrays, `{{n}}` model)
- `C:\Dev\xphere\src\lib\whatsapp\cloud\templates.ts` (deferred — in-app builder)
- `C:\Dev\xphere\src\components\integrations\whatsapp\template-composer-dialog.tsx` (deferred — builder UI)

## Approach (MVP first, builder later)

Reuse the existing single-fan-out notifications pipeline (`notify()` in `lib/notifications/dispatch.ts`)
rather than a parallel path. Templates authored manually in Meta WhatsApp Manager for the MVP.

1. **Template send primitive** — add `sendWhatsAppTemplate()` to `lib/whatsapp/client.ts`; POST a
   `type: 'template'` body to `/{phoneNumberId}/messages` using existing `getWhatsAppPlatformConfig()`
   (token + phoneNumberId already loaded). Build `components` from variable arrays as xphere does;
   keep it a thin sibling of `sendWhatsAppMessage()`.
2. **WhatsApp as a notification channel** — add `whatsapp?: boolean` to `NotifyParams.channels`;
   resolve owner E.164 phone (`company_whatsapp.owner_phone` → `auth.users.user_metadata.phone`);
   map `EventType → { templateName, languageCode, variables(payload) }` via a small explicit registry
   (NOT every event). Respect preferences (opt-in); inherit best-effort + dedupe from `notify()`;
   dispatch async via Inngest like the email branch.
3. **Make the label honest + give control** — fix help text in `profile-section.tsx`; add a WhatsApp
   toggle to notification preferences; confirm `lib/whatsapp/sync-owner-phone.ts` covers the delivery phone.
4. **(Deferred) In-app template builder** — port xphere `templates.ts` + composer dialog; handle
   `message_template_status_update` in `app/api/webhooks/whatsapp/route.ts`. This is where the
   currently-unused `wabaId` from `getWhatsAppPlatformConfig()` finally gets consumed.

## Files to modify (Xtimator)

- `lib/whatsapp/client.ts` — add `sendWhatsAppTemplate()`
- `lib/notifications/dispatch.ts` — add `whatsapp` channel + owner-phone resolution + event→template registry
- `lib/notifications/preferences.ts` + notification preferences UI — WhatsApp opt-in
- `components/settings/profile-section.tsx` — correct the help text
- (Deferred) `app/admin/integrations/whatsapp-config-form.tsx`, `app/api/webhooks/whatsapp/route.ts`, new `lib/whatsapp/templates.ts`

## Prerequisite (manual, outside code)

In **Meta WhatsApp Manager**, under Xtimator's existing WABA: author the MVP notification template(s)
(category **UTILITY** for fastest approval) with `{{n}}` body variables; submit for approval; record
approved `name` + `language` for the event→template registry. Nothing sends until Meta marks it APPROVED.

## Requirements (proposed — confirm during plan-phase)

- **WANOTIF-01** — `sendWhatsAppTemplate()` primitive (type:'template' payload, components from variables)
- **WANOTIF-02** — `whatsapp` channel in `notify()` + explicit event→template registry
- **WANOTIF-03** — owner-phone resolution + async (Inngest) best-effort send
- **WANOTIF-04** — opt-in preference toggle + honest settings label
- **WANOTIF-05** — unit coverage (send payload + dispatch channel; preference-off / no-phone no-ops); suite green

## Verification

- **Unit:** `tests/unit/whatsapp/` coverage for `sendWhatsAppTemplate()` payload (mirror
  `tests/unit/whatsapp/client.test.ts`); dispatch test for the `whatsapp` channel (resolves owner phone,
  calls template sender; preference-off / missing-phone are no-ops).
- **Suite:** `npx vitest run` stays green.
- **Manual UAT (real WABA + approved template):** trigger a mapped event (e.g. approve a test estimate)
  and confirm the owner's phone receives the template *outside* any 24h window. Per the project's
  deferred-UAT convention (`.planning/known-issues.md`), validate against the deployed environment.
