---
phase: 177
slug: end-customer-send-path
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
---

# Phase 177 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Covers both mandatory hardening carry-forwards from `176-VERIFICATION.md` (SendPermit symbol-hardening, legacy route migration) and this phase's own requirements (CUST-01, CUST-02, CUST-05).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` — `include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/eval/**/*.test.ts', ...]` |
| **Quick run command** | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/notifications tests/unit/sms tests/unit/api/send-sms-format-fallback.test.ts tests/unit/api/send-sms-gate-migration.test.ts` (phase-scoped) |
| **Estimated runtime** | ~5-10s quick; ~30-40s phase-scoped full sweep |

No new test dependencies — entirely unit-level (pure functions + mocked service client + mocked Resend/Twilio fetch calls), consistent with 176's precedent. No live Twilio Messaging Service or Resend sending-domain exists yet — those are the phase's operational gates (see Manual-Only below), not blockers for shipping fully-tested code.

---

## Sampling Rate

- **Per task commit:** targeted `npx vitest run <specific test file>` (every TDD task names its own file in `<verify><automated>`)
- **Per wave merge:**
  - Wave 1: `npx vitest run tests/unit/notifications/customer-send-gate.test.ts tests/unit/notifications/customer-message-log.test.ts tests/unit/sms/client.test.ts tests/unit/notifications/customer-emails.test.ts tests/unit/notifications/customer-copy.test.ts tests/unit/notifications/customer-template-resolver.test.ts`
  - Wave 2: `npx vitest run tests/unit/notifications/customer-send.test.ts`
  - Wave 3: `npx vitest run tests/unit/api/send-sms-format-fallback.test.ts tests/unit/api/send-sms-gate-migration.test.ts`
- **Phase gate:** full `npx vitest run tests/unit tests/integration` green + `tsc -p tsconfig.ci.json --noEmit` exits 0, before `/gsd:verify-work`
- **Max feedback latency:** <10s per task, <40s per wave.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| CUST-01/CUST-02 (mandatory a) | `SendPermit`'s brand is a private `unique symbol`, never exported — genuinely unconstructable outside `customer-send-gate.ts`, not a forgeable string literal | unit + source-text hardening proof | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts` (177-01 Task 1) | ❌ W0 |
| CUST-01/CUST-02 | `assertSendAllowed()` accepts `channel: 'email'`, applies suppression only (skips SMS-specific consent + quiet-hours) | unit | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts` (177-01 Task 1) | ❌ W0 |
| CUST-05 | `customer_messages` migration + hand-maintained types exist, idempotent, RLS-correct | structural (tsc compile) | `tsc -p tsconfig.ci.json --noEmit` (177-02 Task 1) | ❌ W0 |
| CUST-05 | `logCustomerMessage()` maps every field correctly, never throws on DB failure | unit | `npx vitest run tests/unit/notifications/customer-message-log.test.ts` (177-02 Task 2) | ❌ W0 |
| CUST-02 | `sendCustomerSms()` dispatches via `MessagingServiceSid` (never `From`), refuses (no fetch) when the dedicated service is unconfigured | unit | `npx vitest run tests/unit/sms/client.test.ts` (177-03 Task 1) | ❌ W0 |
| CUST-01 | `customerEmailFrom()` always produces the honest `"{{business}} via Xtimator <notifications@xtimator.com>"` shape; `sendCustomerEmail()` never throws | unit | `npx vitest run tests/unit/notifications/customer-emails.test.ts` (177-04 Task 1) | ❌ W0 |
| CUST-01/CUST-02 | `buildCustomerCopy()`/`resolveCustomerCopy()` never blocks a send on a missing/corrupt DB template; DB template wins when present and valid; reuses Phase 172's escaping (no drift) | unit | `npx vitest run tests/unit/notifications/customer-copy.test.ts tests/unit/notifications/customer-template-resolver.test.ts` (177-05 Tasks 1-2) | ❌ W0 |
| CUST-01/CUST-02/CUST-05 | `sendCustomerMessage()` requires a real `SendPermit`, routes by `permit.channel`, logs exactly once per real dispatch attempt (never on permit-mismatch/no-content/no-recipient short-circuits) | unit | `npx vitest run tests/unit/notifications/customer-send.test.ts` (177-06 Task 1) | ❌ W0 |
| CUST-02/CUST-05 (mandatory b) | Legacy `send-sms` route calls `assertSendAllowed()` before any dispatch, validates the destination against `clients.phone_normalized`, dispatches via `sendCustomerMessage()` on the dedicated Messaging Service — no remaining bare `sendSms()`/`getTwilioConfig()` call | source-text anchor | `npx vitest run tests/unit/api/send-sms-gate-migration.test.ts` (177-07 Task 2) | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every Wave 0 test file below is created inline as the first artifact of its owning plan's TDD task — no separate scaffold-only wave in this phase's design:

- [ ] `tests/unit/notifications/customer-send-gate.test.ts` — EXTENDED (not new — Phase 176 already owns this file); covers the mandatory symbol-hardening + email-channel widening (177-01 Task 1)
- [ ] `tests/unit/notifications/customer-message-log.test.ts` — covers CUST-05 (177-02 Task 2; new file, new module)
- [ ] `tests/unit/sms/client.test.ts` — EXTENDED (Phase 104 already owns this file); covers CUST-02's `sendCustomerSms()` (177-03 Task 1)
- [ ] `tests/unit/notifications/customer-emails.test.ts` — covers CUST-01 (177-04 Task 1; new file, new module — note: lives under `tests/unit/notifications/` even though the source is `lib/email/`, matching this repo's existing convention for `account-emails.ts`/`payment-emails.ts`)
- [ ] `tests/unit/notifications/customer-copy.test.ts` — covers CUST-01/CUST-02 fallback copy (177-05 Task 1; new file, new module)
- [ ] `tests/unit/notifications/customer-template-resolver.test.ts` — covers CUST-01/CUST-02 DB-first resolution (177-05 Task 2; new file, new module)
- [ ] `tests/unit/notifications/customer-send.test.ts` — covers CUST-01/CUST-02/CUST-05 orchestration (177-06 Task 1; new file, new module; depends on 177-01/02/03/04/05's exports)
- [ ] `tests/unit/api/send-sms-gate-migration.test.ts` — covers the mandatory legacy-route migration (177-07 Task 2; new file; sibling to the existing `send-sms-format-fallback.test.ts`, same source-text-assertion convention)

*Framework already installed — no `npm install` needed.*

---

## Hidden Regressions the Plan MUST Guard Against

- **`tests/unit/notifications/customer-send-gate.test.ts`'s existing SMS-path assertions must ALL still pass unmodified in behavior** after 177-01's symbol-hardening — only the `__brand`-specific assertion in the "fully clear" test changes; every other existing case (client_not_found, suppressed, no_consent, unresolvable_timezone, quiet_hours, ordering proof, tenant-scope proof) must stay green with zero logic change to the SMS branch.
- **`sendSms()` (`lib/sms/client.ts`) stays untouched and its own test suite (`tests/unit/sms/client.test.ts`'s existing `describe` block) stays green** — `sendCustomerSms()` is purely additive in the same file; the tenant-scoped dispatcher (`lib/inngest/functions/notification-channel-send.ts`) and the admin test-send action (`lib/actions/admin-notification-templates.ts`) both keep calling `sendSms()` unchanged (confirmed via repo-wide grep during planning — they are NOT end-customer sends and are explicitly out of this phase's migration scope).
- **`resolveNotificationCopy()`/`buildNotificationCopy()`/`EventType` (Phase 172/174, tenant-scoped) are never touched.** `resolveCustomerCopy()`/`buildCustomerCopy()`/`CustomerEventType` are a deliberate, isolated, parallel module — not a widened version of the tenant path. `tests/unit/notifications/template-resolver.test.ts`, `tests/unit/notifications/template-engine.test.ts`, `tests/unit/notifications/copy-tenant-neutrality.test.ts` must all stay green, unmodified.
- **`estimate_deliveries` logging in the legacy route is preserved, not replaced.** 177-07 sources its `estimate_deliveries` insert from the new `sendCustomerMessage()` result shape but keeps every existing column/behavior (format tracking, `sent_at`/`share_expires_at` refresh, `estimate_activity` insert) — this is estimate-specific bookkeeping, a separate concern from the new `customer_messages` compliance audit trail, and both now happen on every send.
- **Migration idempotency.** `supabase/migrations/20260721000004_phase177_customer_messages.sql` must use `IF NOT EXISTS` throughout (table, indexes) — safe to re-run, consistent with every other migration in this repo. Prefix `20260721000004` — 001 (Phase 172), 002 (Phase 175), 003 (Phase 176) are taken.
- **WhatsApp must never become a reachable channel** in `SendPermit`, `SendCustomerMessageParams`, or any dispatch branch this phase adds — `SendChannel` stays `'sms' | 'email'` only, by construction (not by convention).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Migration applies cleanly to prod | CUST-05 | Deploy is CI→GHCR→Coolify; migrations are applied manually per project convention | After merge, manually apply `20260721000004_phase177_customer_messages.sql` to the prod Supabase project (after Phase 176's three migrations, if not already applied); verify via `select column_name from information_schema.columns where table_name='customer_messages'` (expect all 16 columns). |
| Dedicated Twilio Messaging Service provisioned + Advanced Opt-Out ON | CUST-02 | Twilio Console task, no CLI/API automatable path Claude can complete on the user's behalf (requires the owner's Twilio account access and a business decision on Toll-Free vs 10DLC registration per 176-RESEARCH.md's ISV registration-model finding) | In Twilio Console: provision a Messaging Service dedicated to end-customer SMS (separate from the shared owner number), enable Advanced Opt-Out, then enter the resulting `MG...` SID at `/admin/integrations` → SMS → Customer Messaging Service. Until this is done, `sendCustomerSms()` correctly and safely no-ops (`messaging_service_unconfigured`) rather than failing open onto the shared number. |
| Resend sending-domain / friendly-from deliverability | CUST-01 | Requires live DNS/Resend dashboard configuration and real-world inbox-placement testing, not testable in CI | Confirm `notifications@xtimator.com` is a verified Resend sending domain with SPF/DKIM configured; send a real test end-customer email (e.g. via the migrated legacy route in a staging company) and confirm the From header renders as `"{{business}} via Xtimator"` in a real inbox (Gmail/Outlook), not flagged as spam. |
| Real end-to-end send through the migrated legacy route | CUST-02/CUST-05 | Requires the two operational gates above (Messaging Service + Resend domain) plus a real consented test client in a non-demo company | Once both gates are configured: create a test client with `sms_consent_status='granted'`, send an estimate SMS via the UI, confirm (a) the SMS arrives from the dedicated Messaging Service number, not the shared owner number, (b) a `customer_messages` row and an `estimate_deliveries` row both appear, (c) repeating the send for a suppressed test client (`sms_opted_out_at` set) is refused with a 403 before any Twilio call. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task in every plan has one)
- [x] Wave 0 covers all MISSING references (8 test files/extensions, all owned by their respective plan's task)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency <10s per task, <40s per wave
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Initial plan-phase pass. Both mandatory 176-VERIFICATION carry-forwards (SendPermit symbol-hardening, legacy route migration) are explicitly planned as 177-01 (Wave 1, first task executed) and 177-07 (Wave 3, final task) respectively. Ready for `/gsd:execute-phase 177`.
