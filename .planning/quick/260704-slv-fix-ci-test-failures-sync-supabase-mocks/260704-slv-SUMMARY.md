---
phase: quick-260704-slv
plan: 01
subsystem: testing
tags: [vitest, supabase-mocks, ci]

requires:
  - phase: quick-260704-pt2
    provides: version-carry-forward query in generate-estimate.ts and estimate_photos consumption in share.ts
provides:
  - Supabase mock chains in 5 test files updated to match the shipped estimates.select() cols-branching query shape and the new estimate_photos table query
affects: [ci, testing]

tech-stack:
  added: []
  patterns:
    - "Supabase select() mocks branch via mockImplementation((cols) => ...) when a table is queried with different column projections across call sites in the same code path"

key-files:
  created: []
  modified:
    - tests/unit/services/generate-estimate.test.ts
    - tests/unit/services/generate-estimate-research.test.ts
    - tests/eval/harness.test.ts
    - tests/eval/price-research-regression.test.ts
    - tests/unit/share-query.test.ts

key-decisions:
  - "Returned data: null for the previousCurrent carry-forward query in all 4 estimates-mock files, causing copyEstimatePhotos to be skipped in tests (matches plan's stated safety rationale; no test asserts on that call)"
  - "Returned data: [] for estimate_photos in share-query.test.ts, causing getEstimatePhotos to resolve to [] (no failing share-query test asserts on attached photos)"

patterns-established:
  - "When a table's select() is called with different column arguments in different code paths, branch the mock's select mockImplementation on the cols argument rather than adding a second unconditional chain"

requirements-completed: []

duration: 6min
completed: 2026-07-05
---

# Quick Task 260704-slv: Sync Stale Supabase Test Mocks Summary

**Fixed 27 failing CI tests by adding cols-branching and table branches to 5 Supabase mock chains, matching two production queries (estimates version-carry-forward select, estimate_photos select) that shipped without matching test mock updates.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-05T00:38:06Z
- **Completed:** 2026-07-05T00:43:37Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Added a `cols === 'id'` mock branch to the `estimates` table's `select()` mock in `generate-estimate.test.ts` and `generate-estimate-research.test.ts`, matching the new `select('id').eq().eq().maybeSingle()` version-carry-forward query in `lib/services/generate-estimate.ts`.
- Added the same `cols === 'id'` branch as a sibling to the existing `estimate_sections`-includes branch in `harness.test.ts` and `price-research-regression.test.ts`, preserving the fallback branch.
- Added an `estimate_photos` table branch to `share-query.test.ts`'s `installMock`, returning a `select().eq().order()` chain, matching `lib/queries/estimate-photo.ts`'s `getEstimatePhotos` query now called from `lib/queries/share.ts`.
- Verified all 27 previously-failing tests across the 5 files now pass, plus confirmed the fix introduces no regressions to the rest of the CI-equivalent gate.

## Task Commits

1. **Task 1: Sync all 5 stale Supabase test mocks with the new production queries** - `b1fe67b3` (fix)

_No separate plan-metadata commit for quick tasks — SUMMARY and STATE updates are committed together at the end._

## Files Created/Modified
- `tests/unit/services/generate-estimate.test.ts` - estimates `select()` mock converted to `mockImplementation` branching on `cols === 'id'` vs. fallback version-lookup chain
- `tests/unit/services/generate-estimate-research.test.ts` - identical `select()` conversion; `insert`'s `captured.estimateInsert` capture logic left untouched
- `tests/eval/harness.test.ts` - added `cols === 'id'` branch as a new sibling inside the existing `mockImplementation`, between the `estimate_sections`-includes branch and the fallback
- `tests/eval/price-research-regression.test.ts` - identical sibling-branch addition as harness.test.ts
- `tests/unit/share-query.test.ts` - added `table === 'estimate_photos'` branch to `installMock`, returning `select().eq().order()` resolving to `{ data: [] }`, inserted before the final fallback `return { select: vi.fn() }`

## Decisions Made
- Followed the plan's mock shapes exactly (all `data: null` / `data: []` resolutions as specified) — no deviation needed since the plan's proposed mock chains, when applied verbatim, made all 27 tests pass with no other assertions broken.

## Deviations from Plan

None - plan executed exactly as written. All 5 mock edits matched the plan's specified code blocks and locations without adjustment.

## Issues Encountered

**Full-suite run flakiness (out of scope, pre-existing):** Running the full CI-equivalent gate (`npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval`) showed 5 test failures across 4 files not touched by this plan: `tests/unit/billing/seat-billing-wiring.test.ts` (2 failures), `tests/unit/company-action.test.ts` (1), `tests/unit/actions/team-invite.test.ts` (1), `tests/unit/mcp-route-contract.test.ts` (1). All 5 failures were `Test timed out in 5000ms/15000ms` errors, with one secondary assertion failure caused by a timed-out promise resolving twice. None of these 4 files reference `estimates`, `estimate_photos`, `generate-estimate`, or `share` mocks — they are unrelated to this plan's changes. Re-running these exact 4 files in isolation produced 40/40 passing tests with no timeouts, confirming this is pre-existing resource-contention flakiness in the full 383-file suite on this machine, not a regression introduced by the mock-sync changes. Per the plan's scope boundary ("Only touch the 5 test files named in the plan"), these were left untouched and are out of scope for this task.

The typecheck (`npx tsc --noEmit -p tsconfig.ci.json`) passed with zero errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The 5 named test files' mocks now match production query shapes; the 27 originally-failing CI tests are confirmed green when run standalone (`5 passed, 40 tests passed`).
- The 4-file / 5-test full-suite timeout flakiness is a pre-existing, out-of-scope issue unrelated to this task's changes and unrelated to the estimates/estimate_photos mock work — worth a separate investigation (likely test-runner parallelism/resource limits) if CI continues to show it, but it does not block this task's objective (unblocking CI on the stale-mock failures).
- `components/workspace/send/send-dialog.tsx` and `components/workspace/send/send-form.tsx` were left completely untouched, as instructed — their pre-existing uncommitted changes remain in the working tree for a separate task.

---
*Phase: quick-260704-slv*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 5 modified test files and the SUMMARY.md file confirmed present on disk. Commit `b1fe67b3` confirmed present in git log.
