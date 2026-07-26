---
phase: 180-isolated-demo-session-read-only-foundation
plan: 07
subsystem: api-security
tags: [nextjs, demo, read-only, notifications, communications, vitest]
requires:
  - phase: 180-02
    provides: "Shared demo principal/company write classifier and standard 403 response"
provides:
  - "Guard-before-effect proof for estimate email, SMS, and WhatsApp routes"
  - "Demo denial before notification preference, read-state, and push-subscription writes"
affects: [180-08, 180-14, 181-real-product-cutover-and-verification]
tech-stack:
  added: []
  patterns:
    - "Apply ambient demo denial after normal authentication, then repeat it with a server-resolved target company before side effects."
    - "Notification mutations use the standard demo 403 before service-role persistence."
key-files:
  created:
    - tests/unit/demo/send-notification-route-boundaries.test.ts
  modified:
    - app/api/estimates/[id]/send/route.ts
    - app/api/estimates/[id]/send-sms/route.ts
    - app/api/estimates/[id]/send-whatsapp/route.ts
    - app/api/notifications/preferences/route.ts
    - app/api/notifications/[id]/read/route.ts
    - app/api/notifications/mark-all-read/route.ts
    - app/api/notifications/push/subscribe/route.ts
key-decisions:
  - "Estimate send routes resolve the trusted estimate company server-side and deny it before provider configuration, service-role access, or dispatch."
  - "Notification reads remain available; only routes that mutate preferences, read state, or subscriptions receive the demo guard."
patterns-established:
  - "For target-scoped mutation routes, ambient and trusted-target demo guards both run before external effects or persistence."
requirements-completed: [SAFE-01, SAFE-02]
duration: 4min
completed: 2026-07-26
---

# Phase 180 Plan 07: Send and Notification Route Boundaries Summary

**Demo sessions and demo-target estimates now receive the standard 403 before email, SMS, WhatsApp, or notification-state side effects can occur.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T17:55:00Z
- **Completed:** 2026-07-26T17:59:00Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments

- Added focused RED/GREEN coverage for all seven planned route handlers, including normal 401 and normal-tenant controls.
- Added trusted estimate-company denial before any send-provider configuration, service-role client creation, or dispatch.
- Guarded notification preference, read-state, and push-subscription mutations before persistence.

## Task Commits

1. **Task 1: RED — test send and notification denial** — `37de5970` (`test`)
2. **Task 2: GREEN — guard communication and notification routes** — `e1746603` (`feat`)

## Files Created/Modified

- `tests/unit/demo/send-notification-route-boundaries.test.ts` — source-order and mocked normal-control contracts for every planned route family.
- `app/api/estimates/[id]/send/route.ts` — denies a trusted demo estimate before email integration and send work.
- `app/api/estimates/[id]/send-sms/route.ts` — denies a trusted demo estimate before service, Twilio configuration, or dispatch work.
- `app/api/estimates/[id]/send-whatsapp/route.ts` — denies a trusted demo estimate before entitlement, account, service, or dispatch work.
- `app/api/notifications/preferences/route.ts` — denies demo preference writes before persistence.
- `app/api/notifications/[id]/read/route.ts` and `app/api/notifications/mark-all-read/route.ts` — deny both demo actors and trusted demo companies before service-role updates.
- `app/api/notifications/push/subscribe/route.ts` — denies demo subscription create/delete before persistence.

## Decisions Made

- Kept normal unauthenticated responses ahead of demo checks; existing non-demo behavior remains intact.
- Used `demoGuardResponse` as the sole route-level contract, including a second explicit company check only after a trusted target is resolved.

## TDD Gate Compliance

- **RED:** `37de5970` added the focused suite, which failed for missing target-company and notification guards.
- **GREEN:** `e1746603` added the guards and made all 9 focused tests pass.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/send-notification-route-boundaries.test.ts` — passed (9 tests).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None remaining. The known unrelated missing-key UX baseline was not run or changed.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. The phrase “not available” occurs only in existing customer-facing WhatsApp plan eligibility copy, not a placeholder or unwired UI state.

## Next Phase Readiness

The remaining mutation-boundary and cross-host verification plans can rely on one shared guard-first communication and notification pattern.

## Self-Check: PASSED

- Required route and test artifacts exist.
- Both RED/GREEN commits are reachable in Git history and preserve TDD order.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
