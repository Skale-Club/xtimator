---
phase: 180-isolated-demo-session-read-only-foundation
plan: 05
subsystem: security
tags: [demo, read-only, stripe, server-actions, supabase, vitest]
requires:
  - phase: 180-02
    provides: shared demo write guards with ambient-session and explicit-company modes
provides:
  - Demo-denied invoice, public-estimate, and client-logo mutation boundaries
  - Focused effect-order coverage for the remaining D-09 bypasses
affects: [180-06, 180-07, 180-08, 181-real-product-cutover]
tech-stack:
  added: []
  patterns:
    - Combine the ambient session guard with an explicit trusted target-company guard before side effects.
    - Client mutations must use guarded Server Actions rather than direct browser Supabase writes.
key-files:
  created:
    - tests/unit/demo/invoice-client-boundaries.test.ts
  modified:
    - lib/actions/invoice.ts
    - lib/actions/client.ts
    - app/estimate/[token]/actions.ts
    - components/clients/client-sheet.tsx
key-decisions:
  - "Public estimate actions stay anonymous, then apply ambient-session and trusted target-company guards once the token resolves."
  - "Client-logo removal uses a guarded Server Action so browser Supabase cannot bypass the demo boundary."
patterns-established:
  - "External effects: guard both current session and trusted target company before writes, provider calls, notifications, or email."
requirements-completed: [SAFE-01, SAFE-02]
duration: 4min
completed: 2026-07-26
---

# Phase 180 Plan 05: Invoice, Client, and Public Mutation Boundaries Summary

**Demo sessions and demo-target companies now stop Stripe invoices, public estimate activity and email, and client-logo removal before any mutable effect.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T17:38:11Z
- **Completed:** 2026-07-26T17:42:19Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- Added RED/GREEN effect-order coverage for invoice, public estimate, and client-logo mutation paths.
- Added ambient-session and explicit estimate-company denial before Stripe and public estimate effects.
- Replaced the client sheet's direct browser Supabase logo removal with a guarded Server Action.

## Task Commits

1. **Task 1: RED — specify invoice/client/public mutation denial** — `f03bf566` (`test`)
2. **Task 2: GREEN — route all invoice/client/public writes through the guard** — `5e824369` (`feat`)

## Files Created/Modified

- `tests/unit/demo/invoice-client-boundaries.test.ts` — pins trusted-company guard ordering and client-side no-direct-write contract.
- `lib/actions/invoice.ts` — denies ambient demo sessions and demo estimate companies before Stripe invoice work.
- `app/estimate/[token]/actions.ts` — blocks demo session or target-company effects before public view/response persistence, notifications, or email.
- `lib/actions/client.ts` — exposes guarded `removeClientLogo` action.
- `components/clients/client-sheet.tsx` — uses the guarded logo-removal action instead of browser Supabase.
- `tests/unit/actions/invoice.test.ts` — aligns existing invoice fixtures with the shared demo guard boundary.

## Decisions Made

- Public estimate links retain anonymous customer behavior: guards run only after the share token resolves a trusted target company.
- Every affected write evaluates both ambient demo authority and the explicit target company, so either signal denies the effect.

## TDD Gate Compliance

- RED commit `f03bf566` precedes GREEN commit `5e824369`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test reliability] Corrected test parsing and updated the existing invoice action mock**
- **Found during:** Task 2
- **Issue:** The new source-contract helper initially parsed a return-type brace as a function body, and the existing invoice unit suite mocked the replaced `isDemoCompany` dependency.
- **Fix:** Used signature-aware function-body extraction and mocked the canonical ambient and target-company guards.
- **Files modified:** `tests/unit/demo/invoice-client-boundaries.test.ts`, `tests/unit/actions/invoice.test.ts`
- **Verification:** `npx vitest run tests/unit/demo/invoice-client-boundaries.test.ts tests/unit/actions/invoice.test.ts`
- **Committed in:** `5e824369`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Test-only correctness work; no feature scope changed.

## Verification

- `npx vitest run tests/unit/demo tests/unit/middleware.test.ts` — 159 passed.
- `npx vitest run tests/unit/demo/invoice-client-boundaries.test.ts tests/unit/actions/invoice.test.ts` — 11 passed.
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- `npx tsc --noEmit` — passed.

## Issues Encountered

None remaining. The documented full-suite missing-key UX mock failure was not exercised or changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The shared demo guard now covers the invoice, client, and public estimate boundaries planned here.
- Follow-on Phase 180 mutation sweeps can rely on the established ambient-plus-target guard pattern.

## Self-Check: PASSED

- Required task files exist and both task commits are present in Git history.
- No plan-blocking stubs were found; the client form's placeholder attributes are intentional input affordances.
- No new unplanned threat surface was introduced.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
