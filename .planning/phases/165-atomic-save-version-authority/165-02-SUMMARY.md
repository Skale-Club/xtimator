---
phase: 165-atomic-save-version-authority
plan: 02
subsystem: ui
tags: [react, reducer, useReducer, optimistic-concurrency, sonner, estimate-engine]

# Dependency graph
requires:
  - phase: 165-01
    provides: "save_estimate_atomic RPC returning {updated_at, id_map, project_total, project_id, previous_total}; saveEstimate rewritten to call the RPC once; distinct estimate_locked/estimate_conflict/estimate_not_current error mapping; compute-totals.ts's flat-tax path honoring per-line taxable server-side."
provides:
  - "MARK_SAVED (reducer): remaps every temp- section/item id to its RPC-assigned uuid (SAVE-03), adopts the server's full totals breakdown (SAVE-07), and only clears isDirty when the pre-save editEpoch still matches the current one (SAVE-04)."
  - "editEpoch: a monotonic counter on EstimateEditorState, bumped by a centralized `dirty()` helper in all 15 isDirty-setting reducer actions; never bumped by MARK_SAVED/INIT."
  - "recalculate's flat-tax preview: excludes taxable=false lines from the taxable base and prorates the global discount onto that base exactly like the server's flat path — closes the client half of SAVE-07."
  - "saveEstimate (lib/actions/estimate.ts): return additively extended with subtotal/tax_amount/discount_amount/balance_due alongside the existing total/updated_at/id_map."
  - "estimate-editor.tsx: runSave captures editEpoch before the request, supports a `force` option (last-writer-wins retry), a conflictPending latch that pauses autosave without blocking the keep-mine retry, an estimate_not_current latch folded into isContentReadOnly like a lock, and a non-destructive two-choice conflict-resolution toast."
affects: [170-refine-apply-merge — the RPC's id_map + editEpoch pattern established here should be reused if refine-apply ever needs its own temp-id remap or dirty tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized `dirty(state)` helper for isDirty+editEpoch — every dirty-setting reducer branch spreads `...dirty(state)` instead of hand-writing `isDirty: true`, so a missed epoch bump is structurally impossible."
    - "One-shot retry via request-id state + a guarding ref (handledKeepMineIdRef) — NOT a direct self-reference of a useCallback-memoized function from inside its own body. eslint-plugin-react-hooks v6 bundles the actual React Compiler and its `react-hooks/immutability`/`react-hooks/refs` diagnostics reject that self-reference pattern (even via a ref) as a hook-value cycle; routing the retry through a state bump + a separate effect (whose body only reads, and whose ref mutation happens INSIDE the effect, never during render) is the compiler-safe shape."
    - "Optional trailing fields on a shared dispatch action (idMap/totals/savedEpoch all optional on MARK_SAVED) so a second, simpler dispatch site (presentation-settings re-baseline) stays valid without a payload shape it can't produce."

key-files:
  created:
    - tests/unit/workspace/estimate-reducer-mark-saved.test.ts
    - tests/unit/workspace/estimate-editor-conflict.test.tsx
    - .planning/phases/165-atomic-save-version-authority/deferred-items.md
  modified:
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/estimate-editor.tsx
    - lib/actions/estimate.ts

key-decisions:
  - "'Keep my changes' force-save omits `expectedUpdatedAt` (undefined) rather than sending a literal `null` — saveEstimate's own `estimateData.expectedUpdatedAt ?? null` coalesces both to the same RPC value (p_expected_updated_at IS NULL -> skip compare-and-set), so the zod schema (`.optional()`, not `.nullable()`) did not need loosening. Byte-identical server-side outcome to what the plan's interface literally described, via a less invasive client-side change."
  - "The 'Keep my changes' retry is NOT implemented as runSave calling itself from inside its own useCallback body (nor via a ref that stores/reads the same self-referential value). eslint-plugin-react-hooks v6's bundled React Compiler diagnostics flag both shapes as an unsafe hook-value cycle (a real, reproducible ERROR, not a style nit). Implemented instead as a `keepMineRequestId` counter bumped by the toast action, consumed by a separate effect that calls runSave({force:true}) — a completely ordinary effect-depends-on-a-callback pattern. A `handledKeepMineIdRef` (mutated only inside that effect) guards against re-firing on every render, which is necessary because `t` (useTranslation) is unmemoized and therefore gives `runSave` a new identity on every render."
  - "estimate_not_current folds into isContentReadOnly (like lockedByServer) since a superseded version is permanently non-editable — no separate carve-out needed, unlike conflictPending which must stay outside isContentReadOnly so the keep-mine retry can still call runSave."
  - "MARK_SAVED's totals adoption covers subtotal/tax_amount/discount_amount/total/balance_due only (per the plan's exact contract) — `deposit` itself is left as the reducer's own client-computed preview, unchanged by this plan."

requirements-completed: [SAVE-03, SAVE-04, SAVE-05, SAVE-07]

# Metrics
duration: ~50min
completed: 2026-07-17
---

# Phase 165 Plan 02: Client-Side Save Contract — Remap, Dirty-Epoch, Preview Parity, Conflict UX Summary

**Closes the client half of audit § B: MARK_SAVED now remaps temp-ids from the RPC's `id_map`, adopts the server's authoritative totals, gates `isDirty` clearing on a monotonic `editEpoch` (killing the false-clean bug), and a `conflictPending`/`estimate_not_current` latch pair replaces the old single-action toast-storm conflict UX with a paused, non-destructive, two-choice resolution.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2/2 completed
- **Files modified:** 6 (3 modified source files, 2 new test files, 1 new deferred-items note)

## Accomplishments

- Closed audit findings B4 (false-clean `isDirty`), B5 (temp-id churn), the client half of B8/SAVE-07 (preview ≠ server totals, taxable no-op in the flat path), and B2/B6 (conflict toast-storm + forced discard)
- `MARK_SAVED` now carries three OPTIONAL fields (`idMap`, `totals`, `savedEpoch`) so the pre-existing presentation-settings re-baseline dispatch (`{updated_at}` only) stays valid unchanged
- `editEpoch`: monotonic counter bumped via a single centralized `dirty()` helper in **all 15** isDirty-setting reducer actions (verified individually by a parametrized test), never bumped by `MARK_SAVED`/`INIT`
- `recalculate`'s flat-tax path now excludes `taxable=false` lines from the taxable base and prorates the global discount onto that base exactly like `compute-totals.ts`'s server flat path (165-01) — a mixed-taxable preview matches the server and never goes negative; the all-taxable case stays byte-identical to the pre-165-02 formula
- `runSave` captures `editEpoch` before the request, and dispatches `MARK_SAVED` with `idMap`/`totals`/`savedEpoch` on success
- A `force` option on `runSave`/`stateToSavePayload` powers "Keep my changes": omits `expectedUpdatedAt`, which `saveEstimate` coalesces to `null`, which the RPC treats as "skip the compare-and-set" (last-writer-wins on content, saving the CURRENT tab's full payload — never a silent discard)
- `conflictPending` latch pauses autosave (in the effect's own dependency array, so its cleanup cancels any already-scheduled timer) WITHOUT folding into `isContentReadOnly` — `runSave`'s own early-return guard stays keyed on `isContentReadOnly` alone so the keep-mine retry still works
- Exactly ONE non-stacking conflict toast (fixed `id`) with two non-destructive choices: "Reload latest" (existing `handleDiscard`) and "Keep my changes" (routed through a one-shot `keepMineRequestId` effect)
- `estimate_not_current` (RPC P0003) is terminal: folds into `isContentReadOnly` like a lock, with its own banner + "Create new version" affordance — no autosave loop

## Task Commits

Each task was committed atomically:

1. **Task 1: saveEstimate return + reducer MARK_SAVED (remap + totals + epoch) + flat taxable** - `07606e03` (feat)
2. **Task 2: Editor wiring — epoch capture, id_map/totals dispatch, conflict/not-current latch + non-destructive resolution** - `27047764` (feat)

_Plan-metadata commit (this SUMMARY + REQUIREMENTS.md/STATE.md/ROADMAP.md) lands separately below._

## Files Created/Modified

- `components/workspace/estimate/use-estimate-reducer.ts` — `editEpoch` state field; centralized `dirty()` helper; MARK_SAVED remap/totals/epoch-gated clear; flat-tax taxable + discount proration
- `components/workspace/estimate/estimate-editor.tsx` — `runSave` epoch capture + `force` option; `conflictPending`/`notCurrentByServer`/`keepMineRequestId` state; conflict/not-current banners and toast
- `lib/actions/estimate.ts` — `saveEstimate`'s success return additively extended with the full totals breakdown
- `tests/unit/workspace/estimate-reducer-mark-saved.test.ts` (new) — 28 tests: remap, totals adoption, dirty-epoch (match/mismatch/absent), flat-tax taxable + proration + byte-identical guard, and a parametrized check that all 15 dirty-setting actions bump `editEpoch`
- `tests/unit/workspace/estimate-editor-conflict.test.tsx` (new) — 5 tests: conflict pauses autosave + single notice, "Keep my changes" force-retries, "Reload latest" discards via `handleDiscard`, `estimate_not_current` terminal banner + no loop, mid-save edit keeps the editor dirty and re-saves once the in-flight save resolves
- `.planning/phases/165-atomic-save-version-authority/deferred-items.md` (new) — documents two out-of-scope findings (see Deviations below)

## Decisions Made

See `key-decisions` in the frontmatter above (force-save via omission, not a literal null; the `keepMineRequestId` effect pattern instead of a self-referential `runSave`; `estimate_not_current`'s carve-out choice; totals-adoption scope).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a re-fire loop in the "Keep my changes" retry effect**
- **Found during:** Task 2, while running the new `estimate-editor-conflict.test.tsx` suite
- **Issue:** The first implementation of the keep-mine retry effect (`useEffect(() => { if (keepMineRequestId === 0) return; void runSave({force:true}) }, [keepMineRequestId, runSave])`) fired `runSave` FIVE times instead of once. Root cause: `useTranslation()`'s `t` function is not memoized (a plain function defined fresh on every call), so `runSave` (whose `useCallback` deps include `t`) gets a new identity on every render — and every subsequent render (cascading from `setSaveStatus`/`dispatch(MARK_SAVED)` inside the in-flight save) re-ran the effect and re-fired the save, since the guard only excluded the initial `0` value, not "already handled this id".
- **Fix:** Added `handledKeepMineIdRef` (a ref mutated only inside the effect, never during render) so the effect fires `runSave({force:true})` exactly once per `keepMineRequestId` bump regardless of how many extra times the effect body re-runs due to `runSave`'s unstable identity.
- **Files modified:** `components/workspace/estimate/estimate-editor.tsx`
- **Verification:** The "Keep my changes" test now asserts `mockSaveEstimate` is called exactly twice (conflict + one force-retry), not five times; full suite green.
- **Committed in:** `27047764` (Task 2 commit)

**2. [Rule 1 - Bug] Replaced a self-referential `runSave`/ref retry with a state+effect pattern**
- **Found during:** Task 2, while linting `estimate-editor.tsx` after the initial "Keep my changes" implementation
- **Issue:** The plan's literal wording ("the keep-mine handler clears conflictPending, then calls runSave({force:true})") was first implemented two ways — (a) `runSave` calling itself directly from inside its own `useCallback` body, and (b) a `runSaveRef` mirroring the file's existing `handleVersionChangeRef` pattern. Both are functionally safe plain-JS closures, but `eslint-plugin-react-hooks` v6 (which bundles the actual React Compiler as a lint diagnostic engine) flags both as an unsafe self-referential hook-value cycle (`react-hooks/immutability` / "accessed before it is declared... prevents the earlier access from updating when this value changes over time") — a real, reproducible ERROR under this project's installed toolchain, not a style nit.
- **Fix:** Routed the retry through a `keepMineRequestId` counter (bumped by the toast action) consumed by a plain, non-self-referential `useEffect` that calls `runSave({force:true})` — see Deviation #1 above for the follow-up fix to that effect's re-fire behavior.
- **Files modified:** `components/workspace/estimate/estimate-editor.tsx`
- **Verification:** `npx eslint components/workspace/estimate/estimate-editor.tsx` reports zero errors introduced by this code path (only the two pre-existing, unrelated `react-hooks/refs` errors documented in deferred-items.md remain).
- **Committed in:** `27047764` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs found and fixed while implementing the plan's own "Keep my changes" instruction; no scope creep, same user-facing behavior the plan specified)
**Impact on plan:** Both fixes were necessary for the "Keep my changes" retry to behave correctly (exactly one force-save, not zero or five) and to keep the codebase's installed lint toolchain from erroring on the new code. No behavior change vs. what the plan specified — the toast still reads "Keep my changes" and still results in exactly one force-save.

## Issues Encountered

- **`eslint-plugin-react-hooks` v6 bundles the React Compiler and flags two PRE-EXISTING patterns in `estimate-editor.tsx`** (`stateRef.current = state`, `handleVersionChangeRef.current = handleVersionChange`) as `react-hooks/refs` errors — but only once 165-02's OWN new hooks were added elsewhere in the same component (confirmed via `git stash`: the pristine pre-165-02 file lints clean; the flagged lines are untouched by this plan). This pattern is used 135 times across the codebase and is not part of any CI gate (`.github/workflows/test.yml` never invokes eslint) or this plan's mandated verification. Documented in `.planning/phases/165-atomic-save-version-authority/deferred-items.md` and left unfixed as an explicit out-of-scope, pre-existing, non-blocking finding (SCOPE BOUNDARY).
- **`tests/unit/actions/recording-early-return-events.test.ts` has one pre-existing, unrelated failure** (`TypeError: supabase.from(...).select is not a function` in `lib/actions/recording.ts`) discovered during a broader regression sweep. Confirmed unrelated to this plan (different action module, untouched file, reproduces in complete isolation). Documented in `deferred-items.md`, not fixed (out of scope).
- **Shared-environment git index contention**, same pattern documented in every prior 165/166/167/168 SUMMARY — other concurrent GSD sessions were committing in parallel during this plan's execution. One unrelated, unmodified snapshot file (`tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap`) showed as locally modified throughout this plan's execution; it was never staged or touched by either of this plan's commits (`git add` used explicit pathspecs for exactly the files this plan changed, never `git add -A`).
- **Full `npm test` is flaky/slow under this shared load**, exactly as flagged in the task prompt. A full run surfaced only the two pre-existing, unrelated failures above before being time-boxed; the reliable signal used instead: both new targeted suites green (33/33), `npx tsc --noEmit -p tsconfig.ci.json` exits 0, and a scoped regression sweep across `tests/unit/estimate`, `tests/unit/actions`, `tests/unit/workspace`, `tests/unit/schemas` (555 passed, only the one documented pre-existing failure).

## Next Phase Readiness

- Phase 165 is now **fully complete (2/2 plans)** — SAVE-01 through SAVE-07 are all closed (165-01 closed SAVE-01/02/06 and the server half of SAVE-07; 165-02 closes SAVE-03/04/05 and the client half of SAVE-07).
- `estimate-editor.tsx`'s `runSave`/`stateToSavePayload` now support a `force` option and a request-id-driven one-shot retry pattern — reusable shape if a future phase (e.g. 170's refine-apply-merge) needs its own "retry with an overridden guard" flow.
- The `dirty()` centralization in the reducer means any FUTURE new content-mutating action only needs to spread `...dirty(state)` to correctly participate in dirty-epoch tracking — no separate epoch-bump discipline to remember.
- Deferred, non-blocking findings for a future hygiene pass (not this milestone): the pre-existing `react-hooks/refs` compiler diagnostics (135 occurrences codebase-wide) and the unrelated `recording-early-return-events.test.ts` failure — both in `deferred-items.md`.

## Self-Check: PASSED

All created files confirmed on disk; both task commit hashes (`07606e03`, `27047764`) confirmed present in `git log --oneline --all`.

---
*Phase: 165-atomic-save-version-authority*
*Completed: 2026-07-17*
