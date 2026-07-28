# Deferred Items — Phase 184 (Consolidated Pagination Engine)

Out-of-scope discoveries logged during plan execution (not fixed, per the
executor's scope-boundary rule — only issues directly caused by the current
task's own changes are auto-fixed).

## Plan 184-03 (Task 1 verification)

- **`scripts/pagination-drift-spike.ts`** (Plan 184-01, already committed
  before this plan started) has the same `fontkit.openSync()` return-type
  issue Task 1 hit in `estimator.ts`: `Font | FontCollection` union means
  `font.unitsPerEm` / `font.layout(...)` don't type-check without a narrowing
  guard. Confirmed via a full-repo `npx tsc --noEmit` (bare, not the scoped
  `tsconfig.ci.json` CI gate):
  ```
  scripts/pagination-drift-spike.ts(78,38): error TS2339: Property 'unitsPerEm' does not exist on type 'Font | FontCollection'.
  scripts/pagination-drift-spike.ts(86,38): error TS2339: Property 'layout' does not exist on type 'Font | FontCollection'.
  scripts/pagination-drift-spike.ts(29,25): error TS7016: Could not find a declaration file for module 'linebreak'.
  ```
  Not fixed here: `scripts/` is a standalone one-off spike script (not part of
  this plan's `files_modified`), excluded from `tsconfig.ci.json`'s scoped
  include list (only `app/lib/components/hooks`), so it does NOT block the CI
  gate or this plan's own verification step. Bare `tsc --noEmit` across the
  whole repo is therefore not fully clean (contradicting the stale
  `project_ci_gates_scoped_not_bare` memory note claiming it was clean as of
  2026-07-15) — a future cleanup pass on `scripts/pagination-drift-spike.ts`
  can apply the same `'layout' in opened` narrowing guard added to
  `lib/estimate/pagination/measure/estimator.ts` in this plan.
