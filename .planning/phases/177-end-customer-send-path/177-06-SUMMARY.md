---
phase: 177-end-customer-send-path
plan: 06
subsystem: notifications
tags: [customer-messaging, sms, email, orchestrator, audit-log, tdd]

# Dependency graph
requires:
  - phase: 177-end-customer-send-path (plan 01)
    provides: "customer-send-gate.ts's SendPermit type + assertSendAllowed() — the ONLY producer of a permit, symbol-branded so it cannot be constructed elsewhere"
  - phase: 177-end-customer-send-path (plan 02)
    provides: "logCustomerMessage() — the customer_messages audit writer"
  - phase: 177-end-customer-send-path (plan 03)
    provides: "sendCustomerSms() — dedicated-Messaging-Service SMS send primitive"
  - phase: 177-end-customer-send-path (plan 04)
    provides: "sendCustomerEmail() — friendly-from email send primitive"
  - phase: 177-end-customer-send-path (plan 05)
    provides: "resolveCustomerCopy() — DB-first, buildCustomerCopy()-fallback content resolver"
provides:
  - "sendCustomerMessage(params): Promise<SendCustomerMessageResult> — the single neutral entry point 177-07 (legacy route migration) and Phase 178 (agentic WhatsApp/MCP) both call"
affects: [177-07, phase-178-agentic-sends]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-typed orchestrator: params.permit is typed SendPermit (not a bare clientId), so calling sendCustomerMessage() without first passing assertSendAllowed() is a TypeScript compile error, not a review convention"
    - "Unconditional-on-real-attempt audit logging: logCustomerMessage() is called for every step-6 dispatch attempt (success or failure); short-circuit rejections (permit mismatch, no content, no recipient) never log because they never reached a dispatch attempt"
    - "SMS freeform business-name prepend: freeform SMS bodies get `${businessName}: ${body}` prepended so CUST-02's 'business name leads the body' holds identically on templated and freeform paths; freeform email is left untouched since the friendly-from already carries that identity"

key-files:
  created:
    - lib/notifications/customer-send.ts
    - tests/unit/notifications/customer-send.test.ts
  modified: []

key-decisions:
  - "Adopted Wave-2 override of the plan's literal freeform text: SMS freeform bodies are prepended with the business name (`${businessName}: ${body}`); freeform email keeps the friendly-from as its sole branding signal, no body prepend"
  - "Tests obtain REAL SendPermits via the unmocked assertSendAllowed() (customer-send-gate.ts) rather than a type-cast fixture — SendPermit's brand is a module-private symbol so a real permit is the only production-faithful way to drive the orchestrator; a single merged clients-row mock serves both assertSendAllowed()'s consent/suppression columns and sendCustomerMessage()'s own email/phone/name columns since both query the same mocked requireServiceClient()"
  - "clientError from the send-time clients fetch is logged via console.warn and treated as 'no client row' (falls through to no_recipient_email/no_recipient_phone), matching the never-throw/fail-closed discipline already established in customer-send-gate.ts — not explicitly itemized in the plan's interfaces block but required for correctness (Rule 2)"

patterns-established:
  - "stripHtmlTags(html) module-private helper (`html.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim()`) guarantees sendCustomerEmail() always receives a non-empty plain-text alternative even when the resolved body is 177-05's HTML fallback copy"

requirements-completed: [CUST-01, CUST-02, CUST-05]

# Metrics
duration: 13min
completed: 2026-07-21
---

# Phase 177 Plan 06: sendCustomerMessage() Neutral Orchestrator Summary

**`sendCustomerMessage()` — the single gate-typed, audit-logging entry point wiring 177-01 through 177-05 together end-to-end, with SMS freeform bodies now prepending the business name so CUST-02 holds on every path.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-21T23:11:00-04:00 (approx.)
- **Completed:** 2026-07-21T23:23:57-04:00
- **Tasks:** 1 (TDD: implementation + tests authored together per the plan's fully-specified interfaces block)
- **Files modified:** 2 (both new)

## Accomplishments
- `sendCustomerMessage(params)` implemented exactly per the plan's 8-step LOAD-BEARING flow: permit/clientId mismatch check -> content-presence check -> tenant-scoped client contact fetch -> recipient-on-file check -> content resolution (template via `resolveCustomerCopy()` or freeform) -> channel-routed dispatch (`sendCustomerEmail()`/`sendCustomerSms()`) -> unconditional `logCustomerMessage()` on every real dispatch attempt -> typed result, wrapped end-to-end in try/catch so it never throws.
- Wave-2 adopted override implemented and proven: freeform SMS bodies get `${businessName}: ` prepended before dispatch and before logging, so CUST-02's "business name leads the body" is now true on both the templated path (already true via `buildCustomerCopy`'s SMS copy) and the freeform path. Freeform email is left as-is — the 177-04 friendly-from (`{{business}} via Xtimator`) already carries that identity in the From line.
- `stripHtmlTags()` module-private helper guarantees a non-empty, tag-free `text` field is always passed to `sendCustomerEmail()`, even when the resolved `body` is HTML.
- 10 unit tests, all green: permit mismatch, no-content, no-recipient (both channels), templated SMS dispatch + log shape, freeform SMS business-name-prepend proof, freeform email no-prepend proof, email dispatch failure -> logged as failed + returns the error, stripHtmlTags fallback proof, and the never-throw/unexpected-error contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: sendCustomerMessage() orchestrator (TDD)** - `0e1f66d2` (feat)

**Plan metadata:** (this commit)

_Note: implementation and tests were authored together in a single commit, per the plan's TDD guidance that both were fully specified by the interfaces block; both were verified green (`npx vitest run tests/unit/notifications/customer-send.test.ts` — 10/10 passed) before committing._

## Files Created/Modified
- `lib/notifications/customer-send.ts` - `sendCustomerMessage()`, `SendCustomerMessageParams`/`SendCustomerMessageResult`/`TriggerSource` types, module-private `stripHtmlTags()`. Imports `SendChannel`/`SendPermit` as types only from `customer-send-gate.ts` — no runtime dependency on that module.
- `tests/unit/notifications/customer-send.test.ts` - 10 cases covering the full flow, all four dependency modules mocked at their boundaries, real (unmocked) `assertSendAllowed()` used to mint production-faithful `SendPermit`s.

## Decisions Made
- **SMS freeform business-name prepend (Wave-2 override):** the plan's literal interfaces-block text used `params.freeform.body` verbatim for SMS dispatch; the adopted decision instead prepends `${businessName}: ` for SMS freeform sends only, so CUST-02 holds identically whether the tenant used a template or typed a custom message. Proven by a dedicated test asserting `sendCustomerSms` receives `"Joe's Plumbing: Your appointment is confirmed for 3pm tomorrow."` and that the logged `body` matches the prepended string.
- **Real-permit test strategy:** chose the plan's "prefer the real-gate approach" option over the `as unknown as SendPermit` test-only cast — a single merged `clients` row (consent/suppression/state/phone columns from 177-01 plus email/phone/name columns from this plan) correctly serves both `assertSendAllowed()`'s query and `sendCustomerMessage()`'s own query, since both go through the same mocked `requireServiceClient()` and the mock returns the row regardless of which columns `.select()` named.
- **clientError handling (Rule 2 — missing critical robustness):** the plan's interfaces block didn't explicitly call out what happens when the send-time `clients` fetch itself returns a Supabase error object (distinct from a thrown exception, which is covered by the try/catch). Added a `console.warn` + fall-through to the existing no-recipient checks, mirroring `customer-send-gate.ts`'s established fail-closed discipline. Not a behavior change to any tested case — a DB error and a null row both correctly resolve to `no_recipient_email`/`no_recipient_phone`.

## Deviations from Plan

**1. [Instructed override, not a deviation-rule fix] SMS freeform body business-name prepend**
- **Directed by:** execution instructions (adopted Wave-2 decision), explicitly overriding the plan's `<interfaces>` block step 6 literal text (`sendCustomerSms(client.phone, body)` where `body` for freeform was `params.freeform.body` verbatim).
- **Change:** for `channel === 'sms'` freeform sends only, `body = \`${params.businessName}: ${params.freeform.body}\`` before dispatch and before the audit log write. Templated SMS and both email paths (templated and freeform) are unaffected.
- **Files modified:** `lib/notifications/customer-send.ts` (implementation), `tests/unit/notifications/customer-send.test.ts` (the plan's original "freeform + sms -> exact freeform body" test case was rewritten to assert the prepended body instead, per the instruction to "add a test proving it").
- **Verification:** dedicated test `freeform mode + sms -> ... businessName PREPENDED ...` passes; full `tests/unit/notifications/` + `tests/unit/sms/` sweep (338 tests) stays green.
- **Committed in:** `0e1f66d2` (Task 1 commit — the override was applied during initial implementation, not as a follow-up fix).

**2. [Rule 2 - Missing critical robustness] clientError console.warn + fail-closed fall-through**
- **Found during:** Task 1 implementation (writing the client-fetch step).
- **Issue:** the plan's interfaces block specified the fetch and the recipient-presence checks but didn't itemize behavior when the fetch itself errors (vs. throws).
- **Fix:** added `console.warn` logging and treat an errored/null row identically — it flows into the existing `no_recipient_email`/`no_recipient_phone` short-circuits, never a silent `undefined` crash.
- **Files modified:** `lib/notifications/customer-send.ts`.
- **Verification:** covered indirectly by the no-recipient tests (client row absent -> correct short-circuit); no dedicated error-object test was added since the plan's explicit test list didn't call for one and the thrown-error path is already covered separately.
- **Committed in:** `0e1f66d2` (part of Task 1 commit).

---

**Total deviations:** 1 instructed override (SMS freeform prepend) + 1 auto-fixed (Rule 2 robustness).
**Impact on plan:** Both changes are additive correctness/consistency improvements within this plan's own file; no scope creep into 177-07 or other plans.

## Issues Encountered
None. The plan's interfaces block and the execution instructions' override were both explicit enough that no ambiguity required a stop-and-ask.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
`sendCustomerMessage()` is ready for 177-07's legacy `send-sms` route migration to call directly with a real `SendPermit` from `assertSendAllowed()`, and for Phase 178's agentic WhatsApp/MCP paths to reuse without any interface changes. The `TriggerSource` union (`'manual' | 'agentic-whatsapp' | 'agentic-mcp'`) is already wired through to the audit log, so Phase 178 needs no `customer-send.ts` changes — only new callers.

---
*Phase: 177-end-customer-send-path*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/notifications/customer-send.ts
- FOUND: tests/unit/notifications/customer-send.test.ts
- FOUND commit: 0e1f66d2
