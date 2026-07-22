---
phase: 177-end-customer-send-path
plan: 07
subsystem: notifications
tags: [sms, twilio, consent-gate, api-route, migration]

# Dependency graph
requires:
  - phase: 177-end-customer-send-path (plan 01)
    provides: "assertSendAllowed() + SendPermit/SendGateResult — the pre-send consent/suppression/quiet-hours gate"
  - phase: 177-end-customer-send-path (plan 03)
    provides: "getTwilioCustomerMessagingConfig() — dedicated end-customer Messaging Service config, separate from the shared owner-notification Twilio config"
  - phase: 177-end-customer-send-path (plan 06)
    provides: "sendCustomerMessage() — the single neutral gate-typed send orchestrator this route now calls exclusively"
  - phase: 176 (clients.phone_normalized migration)
    provides: "clients.phone_normalized generated column used to validate the request's destination against the linked client's on-file number"
provides:
  - "app/api/estimates/[id]/send-sms/route.ts migrated onto assertSendAllowed() + sendCustomerMessage() — the last remaining end-customer sendSms()/getTwilioConfig() call site in the codebase is now gone"
  - "Phone-match guard: the request's `to` must equal the linked client's phone_normalized (last-10-digit compare) before the gate even runs, closing the arbitrary-destination bypass"
affects: [phase-178-agentic-sends]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-gate phone-match guard: normalize both the linked client's phone_normalized and the request's `to` to last-10-digits before comparing, rejecting mismatches with 400 BEFORE assertSendAllowed() runs — a caller cannot use the gate's permit to authorize sending to a different number than the one the consent check was actually performed against"
    - "Front-check the send-time provider config before building any send content (shareUrl, template resolution) so an unconfigured dedicated Messaging Service always surfaces as a clean 503, never a late-stage 500"

key-files:
  created:
    - tests/unit/api/send-sms-gate-migration.test.ts
  modified:
    - app/api/estimates/[id]/send-sms/route.ts

key-decisions:
  - "Comment wording near getTwilioCustomerMessagingConfig() avoids the literal substring 'getTwilioConfig(' so the migration-proof test's negative regex (/getTwilioConfig\\b/) only matches real leftover calls to the old shared-config function, not prose referencing the new one"

requirements-completed: [CUST-02, CUST-05]

# Metrics
duration: 12min
completed: 2026-07-22
---

# Phase 177 Plan 07: Legacy send-sms Route Gate Migration Summary

**The legacy `POST /api/estimates/[id]/send-sms` route — the codebase's one remaining end-customer `sendSms()` call site — now resolves the estimate's linked client, rejects any destination number that doesn't match that client's on-file phone, calls `assertSendAllowed()`, and dispatches exclusively through `sendCustomerMessage()` on the dedicated Messaging Service.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-22T03:19:00Z (approx.)
- **Completed:** 2026-07-22T03:31:50Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Closed the exact gap 176-VERIFICATION.md recorded ("a suppressed recipient CAN still be messaged via the un-migrated legacy manual path") — the route can no longer message a client without first passing `assertSendAllowed()`; a suppressed/non-consented/quiet-hours client now gets a clear 4xx refusal (403, with a reason-specific message), never a sent SMS.
- Closed the arbitrary-`to` bypass: the request's destination is now required to match the linked client's `phone_normalized` (last-10-digit compare) BEFORE the gate runs — a caller can no longer use a permit granted for one client's consent state to send to a different number.
- Route now dispatches through `sendCustomerMessage()` on the dedicated end-customer Messaging Service (`getTwilioCustomerMessagingConfig()`), not the shared owner number (`getTwilioConfig()`/bare `sendSms()`) — both are fully removed from this file.
- Every send through this route now also produces a `customer_messages` audit row transitively, via `sendCustomerMessage()` -> `logCustomerMessage()` (177-02/06), in addition to the pre-existing `estimate_deliveries` row (estimate-specific bookkeeping, unchanged in shape, now sourced from `sendResult` instead of the old Twilio-primitive result).
- Unconfigured dedicated Messaging Service still yields the pre-existing clean 503 (`"SMS delivery isn't configured. Contact your platform administrator."`), now front-checked via `getTwilioCustomerMessagingConfig()` right after the gate clears, before any content/shareUrl work.
- Locked all of the above with a new source-level regression test (`send-sms-gate-migration.test.ts`), following the repo's existing static-source-assertion convention for this specific route file.

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate the legacy route + dispatch via the dedicated customer path** - `d3516733` (feat)
2. **Task 2: Source-level regression proof for the migration** - `4d2dcdfb` (test)

**Plan metadata:** (this commit, to follow)

## Files Created/Modified
- `app/api/estimates/[id]/send-sms/route.ts` - Added the linked-client resolution + phone-match guard, swapped `getTwilioConfig`/`sendSms` for `getTwilioCustomerMessagingConfig`/`assertSendAllowed`/`sendCustomerMessage`, updated both `estimate_deliveries` inserts and the final response to read from `sendResult` (`ok`/`error`/`providerMessageId`) instead of the old Twilio-primitive result shape. `getBranding` import and `shareUrl` construction untouched (still needed for both the templated SMS copy and the response).
- `tests/unit/api/send-sms-gate-migration.test.ts` - 4 static source-assertion tests: `assertSendAllowed` present, `sendCustomerMessage` present + no `@/lib/sms/client` import, `phone_normalized` present, `getTwilioCustomerMessagingConfig` present + no bare `getTwilioConfig` call (word-boundary regex, verified not to false-match `getTwilioCustomerMessagingConfig`).

## Decisions Made
- Kept the plan's literal implementation for the phone-match guard, gate call, and dispatch call verbatim — the plan's `<action>` block was fully specified code, not prose to interpret, so no deviation was needed there.
- Adjusted one in-route comment's wording (referencing "the shared owner-notification Twilio config used elsewhere" instead of literally naming `getTwilioConfig()`) after the Task 2 regression test's negative-match assertion initially failed against that comment text — the assertion is correctly strict (it must not match ANY occurrence of the string, including prose), so the fix was to the comment, not the test.

## Deviations from Plan

None (Rules 1-3) - plan executed exactly as written. One minor self-correction (comment wording, not a deviation rule) was caught by the plan's own Task 2 verification step and fixed before committing Task 1 — see Decisions Made above.

---

**Total deviations:** 0
**Impact on plan:** None - executed as specified.

## Issues Encountered
- The Task 2 regression test's `expect(source).not.toMatch(/getTwilioConfig\b/)` assertion initially failed because an explanatory code comment near the new `getTwilioCustomerMessagingConfig()` call happened to spell out the literal string `getTwilioConfig()` in prose (referring to the old function by name for context). Reworded the comment to describe the old config without using its literal identifier; re-ran both test files, both green. No production-code behavior was affected.

## User Setup Required
None - no external service configuration required by this plan itself. However, per this plan's `<output>` instruction:

**Manual DB migration apply required before this gate has real data to read in prod.** This route's `assertSendAllowed()` call depends on Phase 176's three migrations (client consent/suppression/timezone columns) and this milestone's Phase 177-02 migration (`customer_messages` table, written to transitively via `sendCustomerMessage()` -> `logCustomerMessage()`) all being applied to the production database. Per the project's manual-apply convention (migrations ship in code but are never auto-run on deploy), verify actual prod schema state for these migrations before/immediately after this plan's code reaches prod, or the gate and audit-log write will fail against missing columns/tables.

## Next Phase Readiness
This closes the single explicitly-recorded Phase-177 prerequisite from 176-VERIFICATION.md ("phase_177_prerequisites_confirmed" — no legacy bypass may remain). A repo-wide grep confirms `app/api/estimates/[id]/send-sms/route.ts` was the only end-customer-facing `sendSms()` call site; the remaining `sendSms(` callers (tenant-scoped notification dispatcher, super-admin template test-send) do not target an end customer and are out of this milestone's scope. CUST-03's "a suppressed recipient can never be messaged by any path — manual or agentic" is now true for the manual path (the only path that existed before Phase 177). Phase 178's agentic WhatsApp/MCP paths can reuse `sendCustomerMessage()` directly with no interface changes needed.

---
*Phase: 177-end-customer-send-path*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: app/api/estimates/[id]/send-sms/route.ts
- FOUND: tests/unit/api/send-sms-gate-migration.test.ts
- FOUND commit: d3516733
- FOUND commit: 4d2dcdfb
