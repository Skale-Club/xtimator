---
phase: 177-end-customer-send-path
verified: 2026-07-21T00:00:00Z
status: passed
score: 6/6 must-haves verified
human_verification:
  - test: "End-to-end templated SMS through the migrated send-sms route to a consented client on the DEDICATED Messaging Service (not the shared owner number)"
    expected: "Recipient receives the SMS; body leads with the tenant's business name; a customer_messages row (status:sent, provider:twilio) AND an estimate_deliveries row are written; message arrives from the dedicated Messaging Service SID, never the shared from_phone"
    why_human: "Requires a live Twilio dedicated Messaging Service provisioned in the console + real send; the operational gate (provision + admin-panel config) is a non-code task outside this verification's reach"
  - test: "CUST-01 friendly-from on a real end-customer EMAIL"
    expected: "An end-customer email actually dispatched through sendCustomerMessage(channel='email') arrives with From = '{business} via Xtimator <notifications@xtimator.com>'"
    why_human: "The email capability/primitive is built, single-sited and test-locked, but NO production trigger invokes channel='email' yet (see Gaps/Observations). Confirming honest-branding on a real inbox requires wiring a live email trigger, which is out of 177's plan scope."
---

# Phase 177: End-Customer Email/SMS Send Path & Audit Log — Verification Report

**Phase Goal:** The system can actually send a templated email or SMS to an end customer — honestly branded as the tenant's business, on a dedicated sending number, with every send audited and gated by the Phase 176 consent/quiet-hours checks.
**Verified:** 2026-07-21
**Status:** passed
**Re-verification:** No — initial verification

## Automated Gate Results

| Gate | Command | Result |
| ---- | ------- | ------ |
| Unit tests | `npx vitest run tests/unit/notifications/ tests/unit/sms/ tests/unit/api/ tests/unit/webhooks/` | **51 files, 435 passed / 2 todo, 0 failed** |
| Typecheck | `npx tsc --noEmit -p tsconfig.ci.json` | **EXIT 0 (clean)** |

## Goal Achievement — Observable Truths

Truths derived from ROADMAP Success Criteria (the contract) + the two mandatory 176 carry-forwards.

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | CUST-01 capability: system CAN send a templated end-customer email with honest `{business} via Xtimator` friendly-from, via a dedicated primitive | ✓ VERIFIED | `customerEmailFrom()` (sender.ts:32-34) is the single construction site; `sendCustomerEmail()` (customer-emails.ts:61) always calls it; wired into `sendCustomerMessage(channel='email')`. See observation below re: no live trigger yet. |
| 2 | CUST-02: system sends end-customer SMS via a DEDICATED Twilio Messaging Service, business name leads the body | ✓ VERIFIED | `sendCustomerSms()` sets `MessagingServiceSid`, never `From` (client.ts:106); unconfigured → `messaging_service_unconfigured` refusal WITHOUT fetch; business name leads body on template (buildCustomerCopy) AND freeform (prepend) paths |
| 3 | CUST-05: every end-customer send is logged to `customer_messages` (success + failure) | ✓ VERIFIED | `logCustomerMessage()` called unconditionally after every dispatch in customer-send.ts:181; migration ships the table; never-throw writer, null-defaulted; short-circuits correctly do NOT log |
| 4 | Every send passes the Phase 176 consent/suppression + quiet-hours gate before dispatch | ✓ VERIFIED | `sendCustomerMessage` type-requires an unforgeable `SendPermit`; legacy route calls `assertSendAllowed()` before any dispatch; suppressed/no-consent/quiet-hours → typed 403 refusal |
| 5 | Carry-forward: SendPermit is symbol-hardened (unforgeable) | ✓ VERIFIED | Private `unique symbol` brand `SEND_PERMIT_TAG` + non-exported `makePermit` — both present at HEAD, both test-locked (source assertions) |
| 6 | Carry-forward: legacy send-sms route migrated onto the gate + dedicated path | ✓ VERIFIED | Route: gate + on-file phone-match + permit passthrough + dedicated Messaging Service + transitive audit; NO `@/lib/sms/client` import; migration-proof test green |

**Score:** 6/6 truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/notifications/customer-send-gate.ts` | Symbol-branded SendPermit + email-aware gate | ✓ VERIFIED | `SEND_PERMIT_TAG: unique symbol` (non-exported), `makePermit` (non-exported); email branch skips consent/quiet-hours after suppression; fail-closed try/catch |
| `lib/notifications/customer-send.ts` | Neutral orchestrator requiring SendPermit | ✓ VERIFIED | Type-requires `SendPermit`; permit/clientId mismatch guard; freeform SMS business-name prepend; unconditional audit; never-throws |
| `lib/notifications/customer-message-log.ts` | Best-effort CUST-05 writer | ✓ VERIFIED | snake_case mapping, null-defaults, sent_at logic, try/catch never-throw |
| `lib/notifications/customer-copy.ts` | Customer fallback copy (`estimate.sent`) | ✓ VERIFIED | `default: never` exhaustiveness; SMS body leads with business name; email defensive defaults |
| `lib/notifications/customer-template-resolver.ts` | DB-first resolver, never-blank fallback | ✓ VERIFIED | `scope='customer'` query; every miss/corruption degrades to `buildCustomerCopy`; text-mode subject |
| `lib/sms/client.ts` `sendCustomerSms()` | Dedicated Messaging Service primitive | ✓ VERIFIED | MessagingServiceSid never From; unconfigured refusal without fetch; never-throw |
| `lib/email/sender.ts` `customerEmailFrom()` | Honest friendly-from, single site | ✓ VERIFIED | `${businessName} via Xtimator <notifications@xtimator.com>` — exact, never bare, one construction site |
| `lib/email/customer-emails.ts` `sendCustomerEmail()` | Resend primitive, always friendly-from | ✓ VERIFIED | Always calls `customerEmailFrom()`; no-recipient / unconfigured / throw all fail-soft |
| `app/api/estimates/[id]/send-sms/route.ts` | Migrated legacy route | ✓ VERIFIED | assertSendAllowed + phone_normalized match + sendCustomerMessage; no sms/client import |
| `supabase/migrations/20260721000004_phase177_customer_messages.sql` | Audit table + SELECT-only RLS | ✓ VERIFIED | company/client nullable ON DELETE SET NULL; channel↔recipient CHECK; company-scoped SELECT policy only (writes via service role) |

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| customer-send-gate.ts | send primitives | SendPermit (unconstructable outside module) | ✓ WIRED | `SEND_PERMIT_TAG`/`makePermit` appear ONLY in the gate module (+ tests) repo-wide |
| customer-send.ts | sendCustomerSms / sendCustomerEmail | single funnel | ✓ WIRED | Both primitives are called ONLY from customer-send.ts in production |
| send-sms route | assertSendAllowed | called before dispatch | ✓ WIRED | Gate keyed to `project.client_id`; 403 on any refusal reason |
| send-sms route | sendCustomerMessage | permit passthrough | ✓ WIRED | Only send call in the file; `sendCustomerMessage` has exactly one production caller |
| sendCustomerMessage | logCustomerMessage | after every dispatch | ✓ WIRED | Unconditional (success + failure); short-circuits above dispatch don't log |
| sendCustomerSms | getTwilioCustomerMessagingConfig | dedicated SID, null-safe | ✓ WIRED | Returns null (not fromPhone) when SID unset → caller refuses, no shared-number fallback |

## Symbol-Forgeability Analysis (SendPermit)

- `SEND_PERMIT_TAG` is a module-private `unique symbol`, **never exported** (test `customer-send-gate.test.ts` locks `not.toMatch(/export ... SEND_PERMIT_TAG/)`).
- `makePermit` is **never exported** (test locks against `export function/const ... makePermit` and `export { makePermit }`).
- Repo-wide grep: `SEND_PERMIT_TAG`/`makePermit` appear only in `customer-send-gate.ts` and its test. **No other module can construct a permit.**
- `sendCustomerMessage(params.permit: SendPermit)` type-requires the brand → bypassing the gate is a compile error, confirmed by `tsc` EXIT 0.

## CUST-02 Safety Chain

- Unconfigured Messaging Service → `getTwilioCustomerMessagingConfig()` returns `null` → `sendCustomerSms` returns `messaging_service_unconfigured` **without calling fetch** (test-proven, `expect(fetchMock).not.toHaveBeenCalled()`).
- `MessagingServiceSid` is set; `From` is **never** set on the customer send (test asserts `not.toContain('From=')`).
- No shared-number (`fromPhone`) fallback anywhere: the dedicated config reads a DIFFERENT metadata field and returns null (never fromPhone) when unset.
- Freeform SMS business-name prepend proven: `sendCustomerMessage` freeform SMS → `"Joe's Plumbing: ..."` (test `customer-send.test.ts:274`). Freeform EMAIL correctly NOT prepended (friendly-from carries branding).

## Legacy Route Migration & Un-Permitted Path Audit

- send-sms route: gate + `phone_normalized` on-file match (closes arbitrary-`to` bypass) + permit + dedicated Messaging Service 503-if-unconfigured + transitive `customer_messages` audit + preserved `estimate_deliveries` bookkeeping. **No `@/lib/sms/client` import.** Migration-proof test green.
- Repo-wide audit of end-customer send primitives found exactly the two documented exemptions, both confirmed narrow:
  - **Owner-notification channel send** — `lib/inngest/functions/notification-channel-send.ts:60` `sendSms()` dispatches tenant/owner notifications, not end customers.
  - **Admin test-send** — `lib/actions/admin-notification-templates.ts:206/223` sends `[TEST]` messages to `admin.email` / a super-admin-supplied phone.
- (Observation, out-of-scope) `app/api/estimates/[id]/send/route.ts` sends estimate EMAILs to the end customer via `emailFrom()` (bare app name), not through the permit/gate/audit path — see Gaps/Observations. `app/estimate/[token]/actions.ts` Resend calls target `company.email` (owner "estimate viewed/responded" notifications), not end customers.

## CUST-05 Audit Discipline

- Every dispatch attempt logs — success (`status:'sent'`, `sent_at` ISO) and failure (`status:'failed'`, `error_message`) both test-proven.
- Gate/short-circuit refusals do NOT log: `permit_client_mismatch`, `no_content`, `no_recipient_email/phone` all return before the audit line (tests assert `mockLogCustomerMessage` not called).
- Writer never-throws: sync `requireServiceClient()` throw and Supabase insert error both resolve with `console.warn`, never propagate.
- RLS: `customer_messages` has ONLY a company-scoped SELECT policy for `authenticated`; no INSERT/UPDATE/DELETE policy (writes via service role, which bypasses RLS).

## Cross-Commit Content Integrity (HEAD)

- Working tree **clean** (`git status --porcelain` empty); no unstaged diffs on any 177 production file.
- All 7 plans have landed commits: 177-01 (cef9ced8 symbol-harden), 177-02 (f77f2132 migration + e6742846 writer), 177-03 (9295a1f1/e5d1ddc3 dedicated messaging), 177-04 (0d8ef5c4 friendly-from), 177-05 (425101a6/470a477a copy+resolver), 177-06 (0e1f66d2 orchestrator), 177-07 (d3516733 route migration).
- The 177-01 symbol-hardening is present at HEAD (file read confirms the `unique symbol` brand, not the old forgeable `__brand` literal) — the "soft-reset incident" did not leave the hardening reverted.
- Production files match their SUMMARY claims across all 7 plans.

## Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
| ----------- | -------------- | ------ | -------- |
| CUST-01 | 177-01, 177-04, 177-05, 177-06 | ✓ SATISFIED (capability) | Honest friendly-from primitive built, single-sited, test-locked, wired to orchestrator. See observation: no live email trigger yet — roadmap scopes CUST-01 to the primitive. |
| CUST-02 | 177-01, 177-03, 177-05, 177-06, 177-07 | ✓ SATISFIED | Dedicated Messaging Service; never From; no shared fallback; business name leads body (both paths); live via migrated SMS route |
| CUST-05 | 177-02, 177-06, 177-07 | ✓ SATISFIED | customer_messages table + never-throw writer + unconditional per-dispatch logging + SELECT-only RLS |

## Anti-Patterns Found

None material. No TODO/FIXME/placeholder/stub patterns in the 177 production files. Empty-return patterns present are legitimate fail-closed/fail-soft branches (typed refusals), each backed by a test.

## Human Verification Required

See frontmatter `human_verification`. Two items (both operational, not code gaps): live dedicated-Messaging-Service SMS send, and honest friendly-from on a real end-customer email (blocked on wiring a live email trigger — see below).

## Gaps Summary / Observations

**No blocking gaps against the phase's defined scope (7 plans + ROADMAP Success Criteria).** All automated gates green.

One substantive observation for roadmap awareness (NOT a gap against 177's contract):

- **CUST-01's honest friendly-from is not yet reaching real recipients.** The email capability (`sendCustomerEmail` → `customerEmailFrom`) is built, single-sited and test-locked, and wired into `sendCustomerMessage(channel='email')` — but the ONLY production caller of `sendCustomerMessage` (the migrated send-sms route) uses `channel='sms'`. The app's one existing end-customer EMAIL path, `app/api/estimates/[id]/send/route.ts`, still sends via `emailFrom()` (bare `AppName <notifications@xtimator.com>`) and does not pass the permit/gate/audit. This is consistent with 177's scope — none of the 7 plans committed to migrating the estimate-email route (only the SMS route was the mandatory carry-forward), and Success Criterion #1 scopes CUST-01 to "a new generic sendEmail() primitive." A follow-up phase should migrate the estimate-email route onto `sendCustomerMessage(channel='email')` the same way 177-07 migrated SMS, otherwise end-customer emails keep going out bare-branded and un-audited.

---

_Verified: 2026-07-21_
_Verifier: Claude (gsd-verifier)_
