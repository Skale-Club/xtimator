---
phase: 180-isolated-demo-session-read-only-foundation
plan: 04
subsystem: security
tags: [demo, read-only, server-actions, supabase, vitest]
requires:
  - phase: 180-02
    provides: shared demo Auth read-only authority and canonical guard
provides:
  - Tenant-management Server Actions deny writes for demo identities and the deterministic demo company.
  - Static export and guard-order coverage for chat, company, invite, active-company, and price-book mutations.
affects: [180-05, 180-06, 180-07, 180-08, 181-real-product-cutover-and-verification]
tech-stack:
  added: []
  patterns: [canonical assertWritable guard after trusted action context and before side effects]
key-files:
  created: [tests/unit/demo/tenant-action-boundaries.test.ts]
  modified: [lib/actions/chat.ts, lib/actions/company.ts, lib/actions/invite-accept.ts, lib/actions/active-company.ts, lib/actions/price-book.ts]
key-decisions:
  - "Keep the existing shared assertWritable guard as the only demo mutation authority."
  - "Return each action's existing safe result shape when a demo mutation is denied."
patterns-established:
  - "Tenant action mutators resolve trusted auth/company context, then call assertWritable before persistence, storage, cookies, or external dispatch."
requirements-completed: [SAFE-01, SAFE-02]
duration: 6min
completed: 2026-07-26
---

# Phase 180 Plan 04: Tenant-management read-only boundaries Summary

**Canonical demo-write denial now covers chat persistence and multimodal processing, company onboarding, invite acceptance, active-company switching, and every price-book mutation path.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-26T17:27:00Z
- **Completed:** 2026-07-26T17:33:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added a complete static inventory of tenant-management action exports, separating read-only helpers from mutations.
- Enforced `assertWritable` before chat normalization/persistence, storage uploads, invitation membership work, active-company cookies, price-book writes, and outbound company side effects.
- Confirmed the dedicated demo principal cannot switch out of the deterministic demo company through the tenant switch action.

## Task Commits

1. **Task 1: RED — collect tenant-management action contracts** - `08e72d57` (test)
2. **Task 2: GREEN — enforce tenant-management denial** - `c0c84ac9` (feat)

## Files Created/Modified

- `tests/unit/demo/tenant-action-boundaries.test.ts` - Export inventory and guard-before-effect regression contract.
- `lib/actions/chat.ts` - Denies demo multimodal work and all chat persistence mutations.
- `lib/actions/company.ts` - Denies demo logo storage, company writes, cookies, emails, and sync dispatches.
- `lib/actions/invite-accept.ts` - Denies invite acceptance before service-role membership writes and seat reconciliation.
- `lib/actions/active-company.ts` - Prevents demo sessions from changing the active tenant cookie/cache.
- `lib/actions/price-book.ts` - Guards folders, items, options, imports, bulk adjustments, chunk commits, and undo writes.

## Decisions Made

- Reused the existing `assertWritable` contract rather than adding a parallel authorization path.
- Kept action-specific denial response shapes where callers already rely on booleans or discriminated results; company, invite, and price-book actions return the canonical message.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test parser] Made the static function-body parser handle multiline return types.**
- **Found during:** Task 2 (GREEN — enforce tenant-management denial)
- **Issue:** The initial static contract parser stopped at a return-type object before reaching `importPriceBookItems`' function body.
- **Fix:** Reused the balanced parameter scan and identified the body brace by its newline-delimited function-body form.
- **Files modified:** `tests/unit/demo/tenant-action-boundaries.test.ts`
- **Verification:** Focused suite passes all 32 contracts.
- **Committed in:** `c0c84ac9`

**Total deviations:** 1 auto-fixed (1 test bug)

## Issues Encountered

- Repository-wide `npx tsc --noEmit` remains blocked by the pre-existing `tests/unit/demo/core-action-boundaries.test.ts:157` mock type error (`error` is not accepted on its current mock return type). This plan did not modify that file; the focused suite and scoped ESLint pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The shared tenant-management action boundary is ready for the remaining route, background-job, and UI enforcement plans.
- The unrelated Phase 180-03 test type error should be corrected before relying on a clean repository-wide typecheck.

## Self-Check: PASSED

- Created test file and all five guarded action modules exist.
- Task commits `08e72d57` and `c0c84ac9` exist in git history.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
