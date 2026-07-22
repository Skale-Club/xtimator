---
phase: quick-260722-9sb
plan: 01
subsystem: notifications
tags: [resend, email, customer-send-gate, customer-send-funnel, audit-log, consent]

# Dependency graph
requires:
  - phase: 176-end-customer-consent
    provides: assertSendAllowed() consent/suppression/quiet-hours gate
  - phase: 177-end-customer-send-path
    provides: sendCustomerMessage() / sendCustomerEmail() shared funnel, customer_messages audit log, send-sms route migration precedent (177-07)
provides:
  - Legacy send-by-email route (app/api/estimates/[id]/send/route.ts) gated by assertSendAllowed() before any dispatch
  - Destination-email-matches-on-file-client-email guard, closing an unvalidated-mismatch gap
  - Route now dispatches through sendCustomerMessage()/sendCustomerEmail() (honest friendly-from + customer_messages audit row) instead of a direct Resend call
  - Additive attachments? pass-through on the shared customer-send funnel (CustomerEmailAttachment type), so the route's attachPdf feature keeps working through the gated path
affects: [customer-send-funnel, notifications, estimate-send-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual send routes (email + SMS) both now: resolve linked client -> validate destination against on-file contact -> assertSendAllowed() -> sendCustomerMessage() -> preserve pre-existing estimate_deliveries bookkeeping"
    - "Additive optional field + conditional spread to extend a shared dispatch primitive without touching its existing call sites/tests (attachments?.length ? {attachments} : {})"

key-files:
  created:
    - tests/unit/api/send-email-gate-migration.test.ts
  modified:
    - lib/email/customer-emails.ts
    - lib/notifications/customer-send.ts
    - app/api/estimates/[id]/send/route.ts

key-decisions:
  - "Mirrored 177-07's send-sms route migration exactly (client resolution -> destination match -> gate -> funnel dispatch -> preserved estimate_deliveries shape), rather than inventing a new pattern for email."
  - "Extended CustomerEmailAttachment/attachments as a minimal additive optional field on both SendCustomerEmailParams and SendCustomerMessageParams['freeform'], conditionally spread, so all pre-existing funnel tests stayed green unchanged."

patterns-established:
  - "Any future manual/agentic send route that needs email attachments passes freeform.attachments through sendCustomerMessage -> sendCustomerEmail, never calls Resend directly."

requirements-completed: [CUST-01, CUST-02, CUST-05]

# Metrics
duration: 12min
completed: 2026-07-22
---

# Quick Task 260722-9sb: Migrate estimate send-by-email route onto customer-send gate Summary

**The manual estimate send-by-email route now runs through `assertSendAllowed()` + `sendCustomerMessage()` instead of a direct, ungated Resend call — closing the one substantive gap `177-VERIFICATION.md` recorded (email path bypassing consent gate and `customer_messages` audit).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-22T07:11:00Z
- **Completed:** 2026-07-22T07:14:55Z
- **Tasks:** 3
- **Files modified:** 3 (+1 created)

## Accomplishments
- The email send route can no longer message a client without first passing `assertSendAllowed()` — a suppressed client now gets a clear 403, never a sent email.
- The route can no longer be redirected to an arbitrary destination email that differs from the linked client's on-file email — an explicit mismatch guard returns 400 before the gate even runs.
- The route now sends through the honest friendly-from (`"{business} via Xtimator"`) via the shared `sendCustomerMessage`/`sendCustomerEmail` funnel, not the bare-branded `emailFrom()` it used before.
- Every send through this route now also produces a `customer_messages` audit row (transitively, via the funnel), in addition to the unchanged `estimate_deliveries` bookkeeping.
- The `attachPdf` feature keeps working end-to-end: the shared funnel gained a minimal, additive `attachments?: CustomerEmailAttachment[]` pass-through (conditional spread, zero impact on existing call shapes/tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the customer-send funnel with an optional email attachments pass-through** - `f8ebdc3e` (feat)
2. **Task 2: Migrate the send-by-email route onto the gate + funnel** - `8d87071c` (feat)
3. **Task 3: Migration-proof test + full regression sweep** - `b5b698c3` (test)

_No TDD tasks in this plan; each task is a single commit._

## Files Created/Modified
- `lib/email/customer-emails.ts` - Added and exported `CustomerEmailAttachment`; `SendCustomerEmailParams.attachments?`; conditional spread into the `resend.emails.send()` call
- `lib/notifications/customer-send.ts` - Imported `CustomerEmailAttachment`; widened `freeform` to accept `attachments?`; conditional spread into the email-branch `sendCustomerEmail()` call only (SMS branch untouched)
- `app/api/estimates/[id]/send/route.ts` - Rewritten: removed direct `resend`/`emailFrom`/`getBranding` usage; added linked-client resolution (`projects.client_id` -> `clients`), on-file-email destination match guard, `assertSendAllowed()` call, and `sendCustomerMessage()` dispatch (with `pdfAttachments` threaded through `freeform.attachments`); preserved auth/demo-guard/rate-limit/body-validation/404/503-front-check/estimate_deliveries/post-send `Promise.all`/`revalidatePath` byte-for-byte where not being replaced
- `tests/unit/api/send-email-gate-migration.test.ts` - New source-level regression proof (mirrors `send-sms-gate-migration.test.ts`): asserts `assertSendAllowed` + `sendCustomerMessage` present, on-file-email validation present, no `from 'resend'` or `from '@/lib/email/sender'` remain

## Decisions Made
None beyond what's in `key-decisions` above — plan executed exactly as written, including the exact target route source given in Task 2.

## Deviations from Plan

None - plan executed exactly as written. The target route source in Task 2 was implemented verbatim; Task 1's funnel extension and Task 3's test file matched the plan's specification exactly.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This is a pure code migration onto already-existing infrastructure (Phase 176 gate, Phase 177 funnel).

## Next Phase Readiness

- `177-VERIFICATION.md`'s recorded gap ("the email path still sends via bare-branded `emailFrom()`, bypassing the consent gate and `customer_messages` audit") is closed. The send-by-email route now has parity with its already-migrated SMS twin (177-07).
- Full regression sweep confirmed clean: `npx vitest run tests/unit/api tests/unit/notifications tests/unit/estimate/delivery-insert-format.test.ts tests/integration/missing-key-ux.test.ts` -> 49 test files / 445 tests passed (2 todo), and `npx tsc -p tsconfig.ci.json --noEmit` -> clean.
- No blockers for any dependent work. This was a self-contained quick task; no phase/plan chaining required.

---
*Quick task: 260722-9sb*
*Completed: 2026-07-22*

## Self-Check: PASSED

All created/modified files verified present on disk (`route.ts`, `customer-emails.ts`, `customer-send.ts`, `send-email-gate-migration.test.ts`, `260722-9sb-SUMMARY.md`); all 3 task commits (`f8ebdc3e`, `8d87071c`, `b5b698c3`) verified present in `git log`.
