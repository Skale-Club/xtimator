---
phase: 180-isolated-demo-session-read-only-foundation
plan: 11
subsystem: webhook-service-security
tags: [stripe, webhooks, notifications, chat, xphere, read-only, vitest, tdd]

# Dependency graph
requires:
  - phase: 180-02
    provides: "Canonical explicit-company demo write classifier"
  - phase: 180-09
    provides: "Browserless trusted-company authority without cookie dependence"
provides:
  - "Signature-first Stripe platform and Connect company resolution before idempotency or effects"
  - "Shared chat, customer-send, notification, and Xphere demo-company denial"
  - "Direct Connect caller defense in depth with trusted or independently resolved company context"
affects: [180-12, 180-14, 180-15, phase-181, stripe, notifications, chat, xphere]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Signed machine events resolve tenant identity only after signature verification and before idempotency"
    - "Explicit company guards run at the highest shared service funnel before service-role or provider effects"

key-files:
  created:
    - tests/unit/demo/service-funnel-boundaries.test.ts
  modified:
    - app/api/webhooks/stripe/route.ts
    - lib/billing/connect-webhook.ts
    - lib/queries/chat.ts
    - lib/chat/tools.ts
    - lib/notifications/customer-send.ts
    - lib/notifications/dispatch.ts
    - lib/integrations/xphere/dispatch.ts
    - tests/unit/billing/stripe-webhook.test.ts
    - tests/unit/notifications/event-sources.test.ts

key-decisions:
  - "Stripe signature verification remains the first authorization operation; browser cookies never classify webhook authority."
  - "Verified demo-company deliveries return 200 before idempotency or effects so Stripe does not retry intentionally ignored work."
  - "Connect receives the route-resolved company and independently repeats resolution/denial for direct or future callers."
  - "Read-only chat queries and tools remain available; only mutation and dispatch funnels are guarded."

patterns-established:
  - "Resolve signed metadata, subscription/customer/account mappings, or referenced rows before calling assertCompanyWritable."
  - "Shared browserless services pass their trusted company ID directly to assertCompanyWritable before persistence, providers, or queues."

requirements-completed: [SAFE-01, SAFE-02]

# Metrics
duration: 16 min
completed: 2026-07-26
---

# Phase 180 Plan 11: Signed Webhook and Shared Service Funnels Summary

**Stripe platform/Connect events and shared chat, customer-send, notification, and Xphere funnels now deny trusted demo-company effects before idempotency, service-role writes, credits, providers, notifications, or queues.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-26T18:30:47Z
- **Completed:** 2026-07-26T18:47:39Z
- **Tasks:** 3 completed
- **Files modified:** 10

## Accomplishments

- Preserved invalid-signature behavior while inserting trusted company resolution and demo denial before Stripe idempotency, credits, subscription/customer calls, notifications, Xphere dispatch, and Connect handler invocation.
- Added platform resolution through signed metadata plus subscription/customer mappings, and Connect resolution through signed metadata, referenced estimate/invoice rows, payment-intent mappings, or connected-account mappings.
- Guarded chat persistence/write tools, neutral customer sends, notification fan-out, and Xphere enqueueing without disabling read-only chat operations or normal tenant behavior.
- Added 22 focused service/webhook boundary cases, including no-effect call ordering for checkout, top-up, auto-top-up, subscription, estimate-payment, and invoice-payment funnels.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: RED — specify shared service and signed webhook funnels** — `23a63973` (`test`)
2. **Task 2: GREEN — enforce trusted company denial in shared funnels** — `3370bc59` (`feat`)
3. **Task 3: GREEN — wire the exact Stripe post-signature company funnel** — `b9b8002f` (`feat`)

## Files Created/Modified

- `tests/unit/demo/service-funnel-boundaries.test.ts` — focused mock/source-order contract for shared services and signed Stripe/Connect handling.
- `app/api/webhooks/stripe/route.ts` — signature-first platform/Connect company resolution and pre-idempotency demo denial.
- `lib/billing/connect-webhook.ts` — trusted metadata/reference/account resolution plus direct-caller guard and fail-closed unresolved handling.
- `lib/queries/chat.ts` — explicit company denial before every service-role chat mutation while leaving reads unchanged.
- `lib/chat/tools.ts` — trusted-company checks for every chat write tool.
- `lib/notifications/customer-send.ts` — customer-send denial before contact lookup, provider calls, or message audit writes.
- `lib/notifications/dispatch.ts` — notification denial before preferences, persistence, or channel queues.
- `lib/integrations/xphere/dispatch.ts` — Xphere denial before Inngest enqueue.
- `tests/unit/billing/stripe-webhook.test.ts` — normal-company mapping fixture for the new pre-idempotency read.
- `tests/unit/notifications/event-sources.test.ts` — direct Connect callers now pass their already trusted normal company.

## Decisions Made

- Used Stripe-signed metadata when present because Xtimator writes those fields server-side; otherwise resolved only through service-role reads keyed by Stripe subscription, customer, account, estimate, invoice, or payment-intent identifiers.
- A valid demo-company event is acknowledged with HTTP 200 but receives no idempotency row, mutation, provider call, notification, or dispatch. This avoids an infinite Stripe retry loop without weakening the demo boundary.
- Handled event types that cannot resolve a company fail closed before idempotency/effects. Unknown event types retain the existing acknowledge/idempotency behavior.
- Kept Connect defense in depth: the route guards before deduplication, and `handleConnectEvent` repeats the guard using the passed trusted company or an independent read-only resolution.

## TDD Gate Compliance

- **RED:** `23a63973` added 13 focused cases; seven failed exactly at missing chat/customer-send/notification/Xphere guards while signature-first and read controls passed.
- **GREEN 1:** `3370bc59` made the shared service contract pass 13/13 and adjacent chat/notification regressions pass 87/87.
- **GREEN 2:** `b9b8002f` extended the suite to 22 cases and implemented the exact Stripe/Connect post-signature funnel; all focused and adjacent suites pass.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo` — passed (226 tests across 16 files).
- `npx vitest run tests/unit/demo tests/unit/chat/chat-queries.test.ts tests/unit/chat/tools.test.ts tests/unit/notifications/customer-send.test.ts tests/unit/notifications/customer-send-gate.test.ts tests/unit/notifications/dispatch.test.ts tests/unit/billing/stripe-webhook.test.ts tests/unit/webhooks/connect-events.test.ts` — passed (323 tests across 23 files).
- `npx vitest run tests/unit/demo/service-funnel-boundaries.test.ts tests/unit/billing/stripe-webhook.test.ts tests/unit/webhooks/connect-events.test.ts` — passed (45 tests).
- `npx vitest run tests/unit/notifications/event-sources.test.ts -t "payment.received instrumentation"` — passed (2 relevant Connect tests; 9 skipped).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- Git history confirms RED `23a63973` precedes GREEN commits `3370bc59` and `b9b8002f`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated adjacent Stripe/Connect regression harnesses for the new trusted-company seam**
- **Found during:** Task 3 (exact Stripe post-signature company funnel)
- **Issue:** Existing Stripe tests returned no company for the new read-only subscription mapping, and direct Connect instrumentation called the handler without the now-supported trusted company argument.
- **Fix:** Added a normal-company resolver fixture to the Stripe webhook suite and passed the already trusted normal company to two direct Connect instrumentation calls.
- **Files modified:** `tests/unit/billing/stripe-webhook.test.ts`, `tests/unit/notifications/event-sources.test.ts`
- **Verification:** Stripe/Connect regression set passed 45/45; the two relevant notification event-source cases passed.
- **Committed in:** `b9b8002f`

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking test-harness adjustment).
**Impact on plan:** The change only aligned pre-existing mocks/direct callers with the planned trusted-company API; production scope did not expand.

## Issues Encountered

- A whole-file run of `tests/unit/notifications/event-sources.test.ts` exposes three pre-existing anonymous public-estimate test setup failures that call ambient guards without a Next request cookie scope. Their stacks stop before notification dispatch and are unrelated to Plan 180-11; the item is recorded in `.planning/deferred-items.md`. The two Connect cases owned by this plan pass.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration, webhook/provider call, remote database change, DNS change, deployment, or push was performed.

## Known Stubs

None. The modified files contain no TODO/FIXME/placeholder flow and no goal-blocking empty data source.

## Next Phase Readiness

Signed Stripe/Connect and shared cross-channel service effects now honor the deterministic demo company without cookies. Plans 180-12/14/15 can rely on the same explicit-company pattern for remaining jobs and end-to-end isolation verification.

## Self-Check: PASSED

Verified all ten implementation/test artifacts exist, task commits `23a63973`, `3370bc59`, and `b9b8002f` are reachable in history, all plan-owned acceptance and verification checks pass, no unplanned threat surface or goal-blocking stub was introduced, and `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
