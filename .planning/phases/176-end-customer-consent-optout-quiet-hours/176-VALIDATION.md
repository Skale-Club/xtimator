---
phase: 176
slug: end-customer-consent-optout-quiet-hours
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
---

# Phase 176 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `176-RESEARCH.md` ("Validation Architecture" section) and consolidated into the standard artifact per plan-checker feedback (artifact hygiene — content already existed in research, this is the canonical location execute-phase/verify-work expect).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` — `include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/eval/**/*.test.ts', ...]` |
| **Quick run command** | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/sms tests/unit/notifications tests/unit/webhooks/twilio-inbound.test.ts` (phase-scoped) |
| **Estimated runtime** | ~5-10s quick; ~20-30s phase-scoped full sweep |

No new test dependencies — the phase is entirely unit-level (pure functions + mocked service client + mocked `NextRequest`), consistent with research's explicit scope: this phase ships fully unit-tested against mocked/forged Twilio payloads; no live Twilio number exists yet (Phase 177 provisions it).

---

## Sampling Rate

- **Per task commit:** targeted `npx vitest run <specific test file>` (each TDD task names its own file in `<verify><automated>`)
- **Per wave merge:**
  - Wave 1: `npx vitest run tests/unit/sms tests/unit/notifications/timezone-derive.test.ts tests/unit/notifications/quiet-hours.test.ts`
  - Wave 2: `npx vitest run tests/unit/notifications/customer-send-gate.test.ts tests/unit/webhooks/twilio-inbound.test.ts`
- **Phase gate:** full `npx vitest run tests/unit tests/integration` green + `npx tsc --noEmit -p tsconfig.ci.json` exits 0, before `/gsd:verify-work`
- **Max feedback latency:** <10s per task, <30s per wave.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| CUST-03 | `clients` consent/suppression columns + `phone_normalized` generated column + `client_message_events` audit table exist, idempotent, RLS-correct | structural (grep-based content check) | `node -e "...readFileSync(migration)..."` (176-01 Task 1 `<verify>`) | ❌ W0 |
| CUST-03 | `types/database.types.ts` compiles with the new `clients` fields + `client_message_events` table | type-check | `npx tsc --noEmit -p tsconfig.ci.json` (176-01 Task 2) | ❌ W0 |
| CUST-03 | Twilio `X-Twilio-Signature` verified correctly (HMAC-SHA1 over URL + sorted params) against a self-derived, independently-computed test vector; tampered/missing signature rejected | unit | `npx vitest run tests/unit/sms/verify-webhook.test.ts` | ❌ W0 |
| CUST-03 | Inbound keyword classified into exactly one of stop/start/help/other using Twilio's own default keyword set, exact-match only (no NLP/sentence matching) | unit | `npx vitest run tests/unit/sms/inbound-keywords.test.ts` | ❌ W0 |
| CUST-04 | Recipient timezone resolves via `clients.state` → area code → `companies.state` → fail-closed (`null`), including split-timezone states | unit | `npx vitest run tests/unit/notifications/timezone-derive.test.ts` | ❌ W0 |
| CUST-04 | 8am-8pm recipient-local window enforced, DST-aware, split-zone intersection (most-restrictive-wins) | unit (fake timers) | `npx vitest run tests/unit/notifications/quiet-hours.test.ts -t "quiet"` | ❌ W0 |
| CUST-03 + CUST-04 | `assertSendAllowed()` composes suppression → consent → quiet-hours in order; `isConsentSendable()`'s `UNKNOWN_CONSENT_IS_SENDABLE` flag is provably wired (flips real behavior); success returns an opaque `SendPermit` | unit (mocked service client) | `npx vitest run tests/unit/notifications/customer-send-gate.test.ts` | ❌ W0 |
| CUST-03 | Inbound Twilio webhook: signature-verified + logged rejection, idempotent by `MessageSid`, sender-agnostic cross-company STOP fan-out via `phone_normalized`, START never manufactures consent (only restores from `'revoked'`), unresolved events never dropped, Coolify-proxy-safe URL construction | unit + integration (mocked Twilio payload + signature) | `npx vitest run tests/unit/webhooks/twilio-inbound.test.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 test files are net-new (no prior test infrastructure exists for Twilio inbound webhooks or quiet-hours in this codebase) and are created inline as the first artifact of their owning plan's TDD task — there is no separate scaffold-only wave in this phase's design, each `tdd="true"` task creates its RED test before its GREEN implementation within the same task:

- [ ] `tests/unit/sms/verify-webhook.test.ts` — covers CUST-03 (176-02 Task 1; new file, new module; includes a self-derived HMAC-SHA1 test vector computed via `node -e` against `crypto`, not copied from an external source)
- [ ] `tests/unit/sms/inbound-keywords.test.ts` — covers CUST-03 (176-02 Task 2; new file, new module)
- [ ] `tests/unit/notifications/timezone-derive.test.ts` — covers CUST-04 (176-03 Task 1; new file, new module)
- [ ] `tests/unit/notifications/quiet-hours.test.ts` — covers CUST-04 (176-03 Task 2; new file, new module)
- [ ] `tests/unit/notifications/customer-send-gate.test.ts` — covers CUST-03 + CUST-04 (176-04 Task 1; new file, new module; depends on 176-01's schema and 176-03's exports)
- [ ] `tests/unit/webhooks/twilio-inbound.test.ts` — covers CUST-03 (176-05 Task 1; new file; no Twilio inbound webhook or test precedent existed in the repo before this phase)

*Framework already installed — no `npm install` needed.*

---

## Hidden Regressions the Plan MUST Guard Against

- **`lib/whatsapp/verify.ts` must stay untouched.** The new `lib/sms/verify-webhook.ts` is a SEPARATE module (HMAC-SHA1 over URL+sorted-params) — it must never be merged with or replace the WhatsApp webhook's HMAC-SHA256-over-raw-body verifier (Pitfall B). `tests/unit/whatsapp/verify.test.ts` MUST stay green, untouched.
- **`app/api/webhooks/whatsapp/route.ts` must stay untouched.** The new `app/api/webhooks/twilio/route.ts` is an independent route; nothing in this phase modifies the existing WhatsApp webhook route or its tests.
- **The legacy `app/api/estimates/[id]/send-sms/route.ts` is explicitly NOT migrated onto the gate by this phase** — it has zero consent/suppression check today and stays that way until Phase 177 migrates it onto `assertSendAllowed()`/`SendPermit`. This phase must not silently leave the impression that path is already gated — the 176-04 SUMMARY records this as an explicit Phase 177 prerequisite (see 176-04-PLAN.md `<output>`).
- **`sendSms()` (`lib/sms/client.ts`) is untouched.** This phase builds the gate and the inbound webhook; it does NOT wire any existing send path through `assertSendAllowed()` yet (that's Phase 177/178's job) — `tests/unit/sms/client.test.ts` MUST stay green, unmodified.
- **Migration idempotency.** `supabase/migrations/20260721000003_phase176_customer_consent_suppression.sql` must use `IF NOT EXISTS` throughout (columns, table, indexes) — safe to re-run, consistent with every other migration in this repo.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to prod | CUST-03 | Deploy is CI→GHCR→Coolify; migrations are applied manually per project convention (no CI step runs `supabase db push`) | After merge, manually apply `20260721000003_phase176_customer_consent_suppression.sql` to the prod Supabase project; verify via `select column_name from information_schema.columns where table_name='clients' and column_name like 'sms_%'` (expect 6 rows) and `select phone_normalized from clients limit 1`. |
| Real Twilio STOP reply end-to-end | CUST-03 | No live dedicated Messaging Service exists yet (Phase 177's operational gate) — this phase ships unit-tested against mocked/forged payloads only | Deferred to Phase 177 provisioning: once a real Twilio number/Messaging Service is configured with this webhook URL, send a real STOP from a test phone and confirm `clients.sms_opted_out_at` sets and `client_message_events` logs it. |
| Twilio Console webhook URL matches production `resolveBaseUrl()` output | CUST-03 | Depends on live `APP_ORIGIN`/`NEXT_PUBLIC_SITE_URL` env state at deploy time, not testable in CI | Confirm the Twilio Console "A Message Comes In" URL byte-matches the prod app's `resolveBaseUrl(request) + '/api/webhooks/twilio'` output before enabling real traffic (176-05 SUMMARY carries this as an explicit runbook note). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task in every plan has one)
- [x] Wave 0 covers all MISSING references (6 new test files, all owned by their respective plan's Task 1)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency <10s per task, <30s per wave
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plans revised per Opus plan-checker pass (176-01 BLOCK, 176-04/176-05 FLAG resolved; this VALIDATION.md closes the phase-level BLOCK for the missing artifact). Ready for `/gsd:execute-phase 176`.
