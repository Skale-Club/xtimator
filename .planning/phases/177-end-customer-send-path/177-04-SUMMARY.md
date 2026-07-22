---
phase: 177-end-customer-send-path
plan: 04
subsystem: notifications
tags: [resend, email, friendly-from, deliverability, vitest, tdd]

# Dependency graph
requires:
  - phase: 176-end-customer-consent-optout-quiet-hours
    provides: consent/suppression/quiet-hours schema this send path will eventually be gated by (via 177-01's SendPermit)
provides:
  - "customerEmailFrom(businessName): string in lib/email/sender.ts — the ONE place the honest '{{business_name}} via Xtimator <notifications@xtimator.com>' friendly-from string is constructed"
  - "sendCustomerEmail(params): Promise<SendCustomerEmailResult> in lib/email/customer-emails.ts — never-throw Resend dispatch primitive for end-customer email"
affects: [177-06 (sendCustomerMessage orchestrator dispatches to sendCustomerEmail on channel==='email'), 177-07 (legacy send-sms route migration, email-adjacent conventions)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Never-throw {ok, id?, error?} result primitive for third-party dispatch calls (mirrors lib/sms/client.ts's sendSms() shape)"
    - "@internal doc-comment convention marking low-level primitives that must be called only through their orchestrator, never directly"

key-files:
  created:
    - lib/email/customer-emails.ts
    - tests/unit/notifications/customer-emails.test.ts
  modified:
    - lib/email/sender.ts

key-decisions:
  - "customerEmailFrom lives in lib/email/sender.ts alongside emailFrom (not in customer-emails.ts) — keeps ALL From-header construction in one file, consistent with sender.ts's existing single-source-of-truth role"
  - "sendCustomerEmail is a bare dispatch primitive with zero template/audit/gating logic — that responsibility is explicitly deferred to 177-06's sendCustomerMessage() orchestrator, marked via an @internal doc-comment"

patterns-established:
  - "@internal — call X(), never directly: doc-comment pattern for primitives that must be routed through a higher-level gated entry point"

requirements-completed: [CUST-01]

# Metrics
duration: 15min
completed: 2026-07-21
---

# Phase 177 Plan 04: customerEmailFrom + sendCustomerEmail Summary

**Never-throwing Resend dispatch primitive (`sendCustomerEmail`) whose sender identity is always the honest `{{business_name}} via Xtimator <notifications@xtimator.com>` friendly-from, unit-tested against a mocked Resend client.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-21T22:52:00-04:00 (approx)
- **Completed:** 2026-07-21T23:07:35-04:00
- **Tasks:** 1
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments
- `customerEmailFrom(businessName)` added to `lib/email/sender.ts`, immediately below `emailFrom` — the single place the `"{{business_name}} via Xtimator <notifications@xtimator.com>"` string is built, provably (repo-wide grep for `via Xtimator` confirms no other source file constructs it).
- `sendCustomerEmail()` created in new `lib/email/customer-emails.ts` — a generic, never-throwing Resend dispatch primitive (no hardcoded templates; subject/html/text come from the caller). Mirrors `lib/sms/client.ts`'s `sendSms()` contract shape and `lib/email/account-emails.ts`'s `getIntegrationKey('resend')` + dynamic `import('resend')` pattern.
- Added an `@internal` doc-comment on `sendCustomerEmail()` directing future callers to `sendCustomerMessage()` (177-06's orchestrator) instead of calling this primitive directly — it performs no consent/suppression/quiet-hours gating or compliance logging itself.
- 7 unit tests in `tests/unit/notifications/customer-emails.test.ts`, all green: pure `customerEmailFrom` shape/never-bare assertions, `no_recipient`, `resend_unconfigured` (with `console.warn`), success (verbatim `from`/`to`/`subject`/`html`/`text` pass-through), Resend-returned error, and Resend-thrown rejection (`send_failed` + `console.warn`).

## Task Commits

Each task was committed atomically:

1. **Task 1: customerEmailFrom() + sendCustomerEmail() (TDD)** - `0d8ef5c4` (feat) — single commit covering RED (test file, confirmed failing on missing module) and GREEN (implementation, all 7 tests passing); no REFACTOR needed.

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/email/sender.ts` - Added `customerEmailFrom(businessName): string`, doc-commented with the CUST-01 honesty contract, directly below the existing `emailFrom`.
- `lib/email/customer-emails.ts` - New file. `SendCustomerEmailParams`/`SendCustomerEmailResult` interfaces + `sendCustomerEmail()`: empty `toEmail` → `no_recipient`; missing Resend key → `resend_unconfigured` + warn (no fetch/import in either case); success → `{ ok: true, id: data?.id }`; Resend `error` → `{ ok: false, error: error.message }`; thrown/rejected → caught, warn, `send_failed`.
- `tests/unit/notifications/customer-emails.test.ts` - New file. Mocks `server-only`, `@/lib/platform-config` (`getIntegrationKey`), and `resend` (hoisted `sendMock`) exactly as `account-emails.test.ts` does; 7 cases covering both functions per the plan's `<behavior>` spec.

## Decisions Made
- Followed the plan's exact interface spec verbatim (`SendCustomerEmailParams`/`SendCustomerEmailResult`, error string literals `no_recipient`/`resend_unconfigured`/`send_failed`) — no deviation from the contract.
- Test mocking convention matches `account-emails.test.ts` precisely (hoisted `sendMock`, `vi.mock('resend', ...)`, `vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn() }))`), per the plan's explicit instruction, so the two files stay maintainable side-by-side.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `tsc -p tsconfig.ci.json --noEmit` exits clean; only files touched by this task were staged/committed (sibling in-flight plans 177-01/02/03/05 were mid-edit in the shared working tree at commit time — confirmed via `git diff lib/email/sender.ts` that the staged diff contained only this task's addition, per the pathspec-scoped commit house rule).

## User Setup Required

None for this task in isolation — `sendCustomerEmail()` correctly and safely refuses to send (`resend_unconfigured`) until a Resend key is configured via `/admin/integrations`. The broader operational gate (verified Resend sending-domain + SPF/DKIM + real-inbox friendly-from confirmation) is tracked at the phase level in `177-VALIDATION.md`'s Manual-Only Verifications table, not this plan.

## Next Phase Readiness
- `sendCustomerEmail()` and `customerEmailFrom()` are ready for 177-06's `sendCustomerMessage()` orchestrator to call on `permit.channel === 'email'`.
- No blockers. `lib/email/account-emails.ts`, `lib/sms/client.ts`, and all other existing email/SMS send paths are untouched (confirmed via scoped `git add`).

---
*Phase: 177-end-customer-send-path*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/email/customer-emails.ts
- FOUND: tests/unit/notifications/customer-emails.test.ts
- FOUND: lib/email/sender.ts
- FOUND: commit 0d8ef5c4
