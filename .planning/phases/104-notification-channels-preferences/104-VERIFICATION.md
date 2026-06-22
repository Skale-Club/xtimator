---
phase: 104-notification-channels-preferences
verified: 2026-06-21T22:50:00Z
status: passed
score: 7/7 must-haves verified
human_verification:
  - test: "Submit a template from the super-admin panel, then approve/reject it in Meta WhatsApp Manager and confirm the message_template_status_update webhook flips the stored status"
    expected: "Template row status transitions draft→pending→approved (or rejected + rejection_reason) without admin intervention"
    why_human: "Requires live Meta WABA credentials + the management-scope token; cannot exercise the real webhook without an approved Meta app"
  - test: "Apply the 3 written migrations to the remote Supabase DB, then opt-in WhatsApp + SMS for an owner with a phone on file and trigger a billing/estimate event"
    expected: "Owner receives a proactive WhatsApp template message and a paid SMS; in-app + email still deliver"
    why_human: "Migrations are written but not applied to remote (operational/deferred); live Twilio + Meta delivery needs real creds and a real phone"
---

# Phase 104: Notification Channels & Preferences Verification Report

**Phase Goal:** Owner notification preferences become a 3-category (Estimates, Billing, System) × 4-channel (In-App, Email, WhatsApp, SMS) matrix with functional WhatsApp + SMS senders and a super-admin WhatsApp-template panel, replacing the old 8-category × 2-channel model.
**Verified:** 2026-06-21T22:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 (NOTIF-01) | Preferences page shows exactly 3 categories — Estimates, Billing, System | ✓ VERIFIED | `event-types.ts` `EventCategory = estimate\|billing\|system\|_dropped`; `notifications-form.tsx:52-54` renders exactly the 3 category rows |
| 2 (NOTIF-01) | Event map collapses payment/trial/quota/admin→billing; whatsapp.inbound + ai_job.*→_dropped | ✓ VERIFIED | `event-types.ts:48-68` EVENT_CATEGORIES — all 17 events mapped; `_dropped` for whatsapp.inbound, ai_job.failed/completed |
| 3 (NOTIF-02/05) | 4 channels per category; whatsapp/sms default OFF; gated by phone + per-channel opt-in (no OTP flag) | ✓ VERIFIED | `DEFAULT_PREFERENCES` whatsapp/sms false everywhere; `resolveChannels` forces whatsapp/sms false unless opt_in_at present; `owner-phone.ts` reads `owner_phone` on `active` row (no verified/OTP flag) |
| 4 (NOTIF-06) | Pure migrateCategories (OR-merge→billing, drop whatsapp/ai_job, idempotent) + mirrored SQL | ✓ VERIFIED | `category-migration.ts` pure fn (BILLING_SOURCES includes `billing` → idempotent; whatsapp/ai_job dropped); `20260621000001_*.sql` mirrors with `WHERE categories ?\| array[...]` guard |
| 5 (NOTIF-03/04) | sendSms (Twilio REST, no SDK, never-throw) + WhatsApp via sendWhatsAppTemplate, both wired into notify() as gated best-effort branches | ✓ VERIFIED | `lib/sms/client.ts` REST/Basic-auth, returns `{ok,...}` never throws; `dispatch.ts:177-230` whatsapp+sms branches each own try/catch, phone-gated, async via Inngest |
| 6 (NOTIF-07) | Dispatch routes event→category→enabled channels; throwing WhatsApp/SMS does NOT block in-app insert; SMS gated by sms_opt_in_at (not toggle alone — TCPA) | ✓ VERIFIED | in-app insert runs before channel branches; each branch swallows throws; `resolveChannels:89` forces sms false unless `sms_opt_in_at`; test "throwing send does NOT block in-app insert" green |
| 7 (104.3) | whatsapp_notification_templates table service-role-only RLS; admin route+nav+CRUD; message_template_status_update webhook branch off the HMAC/inbound path; whatsapp-registry DB-backed with static fallback | ✓ VERIFIED | `20260621000003_*.sql` RLS enabled, 0 CREATE POLICY; admin route+panel+nav exist; webhook `findTemplateStatusChange` runs in `after()` after `statuses` early-exit, inbound path untouched; `getApprovedTemplateForEvent` DB-backed w/ static fallback |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/notifications/event-types.ts` | 3 cats + _dropped, 4-channel DEFAULT_PREFERENCES | ✓ VERIFIED | EventCategory reduced; ChannelPrefs 4-channel; all 17 EventTypes retained |
| `lib/notifications/category-migration.ts` | Pure migrateCategories the SQL mirrors | ✓ VERIFIED | Exports migrateCategories; OR-merge incl. existing billing (idempotent); `{}`→`{}` |
| `lib/notifications/preferences.ts` | 4-channel resolveChannels + opt-in gate | ✓ VERIFIED | ResolvedChannels 4 keys; opt-in timestamps threaded through UserPrefs + upsert |
| `lib/notifications/dispatch.ts` | whatsapp+sms gated best-effort branches | ✓ VERIFIED | Both branches phone-gated, registry-gated (WA), async via Inngest, own try/catch |
| `lib/sms/client.ts` | sendSms Twilio REST never-throw | ✓ VERIFIED | `server-only`, Messages.json, Basic auth, returns structured result, never throws |
| `lib/notifications/owner-phone.ts` | resolveOwnerPhone service-role reader | ✓ VERIFIED | service client, `active` row, non-null owner_phone, never throws |
| `lib/notifications/whatsapp-registry.ts` | getTemplateForEvent + DB-backed variant | ✓ VERIFIED | Static REGISTRY (5 events) + async getApprovedTemplateForEvent with static fallback |
| `lib/inngest/functions/notification-channel-send.ts` | async WA/SMS send worker | ✓ VERIFIED | Triggers on both events; branches by channel; best-effort; registered in index + serve route |
| `lib/actions/admin-whatsapp-templates.ts` | CRUD + submit + status-update actions | ✓ VERIFIED | All 4 exports; requireAdmin on CRUD; applyTemplateStatusUpdate un-gated for webhook |
| `app/admin/whatsapp-templates/page.tsx` | super-admin route | ✓ VERIFIED | requireAdmin first, listTemplates(), renders panel |
| `components/admin/whatsapp-templates-panel.tsx` | CRUD UI | ✓ VERIFIED | Present |
| `components/admin/admin-nav.tsx` | WA Templates nav entry | ✓ VERIFIED | `{ href:'/admin/whatsapp-templates', label:'WA Templates' }` |
| `components/settings/notifications-form.tsx` | 3×4 matrix + paid-SMS consent | ✓ VERIFIED | 3 rows, 5-col grid, pref-whatsapp/sms testids, paid consent copy + sms_opt_in_at write |
| `supabase/migrations/20260621000001_*.sql` | idempotent JSONB remap | ✓ VERIFIED (written) | WHERE-guard idempotent; mirrors pure fn |
| `supabase/migrations/20260621000002_*.sql` | sms_opt_in_at + consent columns | ✓ VERIFIED (written) | IF NOT EXISTS idempotent |
| `supabase/migrations/20260621000003_*.sql` | templates table service-role RLS | ✓ VERIFIED (written) | RLS enabled, 0 policies |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| dispatch.ts | notification-channel-send.ts | inngest.send('notification/whatsapp.send' \| 'notification/sms.send') | ✓ WIRED |
| notification-channel-send.ts | sms/client.ts + whatsapp/client.ts | sendSms / sendWhatsAppTemplate | ✓ WIRED |
| dispatch.ts | owner-phone.ts | resolveOwnerPhone gate before WA/SMS | ✓ WIRED |
| webhooks/whatsapp/route.ts | admin-whatsapp-templates.ts | message_template_status_update → applyTemplateStatusUpdate (in after(), after statuses early-exit) | ✓ WIRED |
| category-migration.ts | 20260621000001_*.sql | SQL mirrors OR-merge | ✓ WIRED |
| notifications-form.tsx | /api/notifications/preferences | PATCH with 4-channel categories + opt-in timestamps | ✓ WIRED |
| index.ts + app/api/inngest/route.ts | notificationChannelSend | barrel export + serve registration | ✓ WIRED |

Note: dispatch dispatches on `notification/whatsapp.send` + `notification/sms.send` (the channel-send worker triggers on both) rather than the single `notification/channel.send` name sketched in the plan. Functionally equivalent and fully wired — not a gap.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-104 test suites pass | `vitest run tests/unit/notifications tests/unit/sms tests/unit/admin/whatsapp-templates` | 15 files / 118 tests passed | ✓ PASS |
| No full-suite regression | `npx vitest run` | 256 files passed, 1773 tests passed (3 skipped files, 2 skipped + 33 todo tests) | ✓ PASS |
| No secrets in new source | grep secret patterns across 6 new files | NO_SECRETS_FOUND | ✓ PASS |
| Templates table service-role-only | `grep -c CREATE POLICY` in migration 03 | 0 policies | ✓ PASS |

Full-suite numbers match the executor's reported 256 files / 1773 tests exactly — no regression.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
| ----------- | -------------- | ------ | -------- |
| NOTIF-01 | 104-00, 104-01 | ✓ SATISFIED | 3-category union + event map + 3-row form |
| NOTIF-02 | 104-00, 104-01 | ✓ SATISFIED | 4-channel matrix, whatsapp/sms default off |
| NOTIF-03 | 104-00, 104-02, 104-03 | ✓ SATISFIED | sendWhatsAppTemplate branch + registry + admin panel |
| NOTIF-04 | 104-00, 104-02 | ✓ SATISFIED | sendSms Twilio REST primitive + Inngest worker |
| NOTIF-05 | 104-00, 104-02 | ✓ SATISFIED | owner-phone resolver + opt-in consent columns + UI consent |
| NOTIF-06 | 104-00, 104-01 | ✓ SATISFIED | pure migrateCategories + mirrored idempotent SQL |
| NOTIF-07 | 104-00, 104-02 | ✓ SATISFIED | best-effort gated dispatch; TCPA sms_opt_in_at gate; never-block test green |

All 7 marked `[x]` in REQUIREMENTS.md and traced to verified artifacts. No orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| — | None blocking | — | No TODO/FIXME/placeholder stubs in phase-104 source; `submitTemplateToMeta` returns `{ok:false,reason:'scope'}` as a documented de-risked-MVP path (intentional, not a stub) |

### Human Verification Required

1. **Meta template status webhook round-trip** — submit a template from the panel, approve/reject in Meta, confirm webhook flips status. Requires live WABA + management-scope token.
2. **Live WhatsApp + SMS delivery after migrations applied** — apply the 3 migrations to remote, opt-in an owner with a phone, trigger an event, confirm proactive WhatsApp template + paid SMS arrive. Requires live Twilio/Meta creds.

### Migrations Pending Application (operational/deferred)

These are WRITTEN and unit-verified; applying to the remote Supabase DB is operational and out of scope for this verification:

- `supabase/migrations/20260621000001_notification_categories_remap.sql`
- `supabase/migrations/20260621000002_notification_opt_in_consent.sql`
- `supabase/migrations/20260621000003_whatsapp_notification_templates.sql`

### Gaps Summary

No gaps. All 7 observable truths verified against real source. Every artifact exists, is substantive, is wired, and (for data-flow paths) routes real data: dispatch resolves channels → gates on phone + opt-in → dispatches async via Inngest → worker calls the real Twilio/WhatsApp primitives. The full test suite (256 files / 1773 tests) is green with no regressions, no secrets leaked, and the templates table is correctly service-role-only. The only open items are operational (migration application) and live-credential-dependent (Meta/Twilio delivery), routed to human verification.

---

_Verified: 2026-06-21T22:50:00Z_
_Verifier: Claude (gsd-verifier)_
