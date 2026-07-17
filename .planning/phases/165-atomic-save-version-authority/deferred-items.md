# Deferred items — Phase 165

## 165-02: pre-existing `eslint-plugin-react-hooks` "React Compiler" ref-mutation diagnostics in `estimate-editor.tsx` (out of scope)

**Found during:** Task 2, while linting `components/workspace/estimate/estimate-editor.tsx` after the runSave/conflict wiring changes.

**What was observed:** `npx eslint components/workspace/estimate/estimate-editor.tsx` reports two `react-hooks/refs` errors ("Cannot access refs during render — Cannot update ref during render") pointing at:
- `stateRef.current = state` (pre-existing since long before 165-02, keeps a ref in sync with reducer state for use in callbacks)
- `handleVersionChangeRef.current = handleVersionChange` (pre-existing since long before 165-02, same "latest ref" pattern used for `useEstimateVersionSlot`'s callback)

Neither line was touched by 165-02. Confirmed via `git stash` (reverting the file to its pre-165-02 committed state and re-linting in place): the pristine HEAD version of this exact file produces **zero** errors from this rule. Only after 165-02's additions (new `useState`/`useEffect` hooks elsewhere in the same component) does the rule start flagging these two pre-existing lines — `eslint-plugin-react-hooks` v6+ bundles the actual React Compiler and runs whole-component data-flow analysis, so adding hooks elsewhere in a function can change which pre-existing lines its diagnostics surface, even though the flagged lines themselves are unmodified.

**Why this is out of scope (not fixed):**
1. Not part of this plan's mandated verification (`<verification>` lists only the two targeted vitest suites, `npx tsc --noEmit -p tsconfig.ci.json`, and `npm test` — no eslint step).
2. Not part of CI's blocking gate — `.github/workflows/test.yml` runs `tsc` (scoped + advisory) and `vitest`; it never invokes `eslint`/`npm run lint`.
3. The flagged "ref mutated during render" pattern (`someRef.current = someValue` directly in the component body, to keep a ref in sync with the latest render's value for use inside callbacks/effects) is a **pervasive, established idiom in this codebase** — 135 occurrences across `components/`, `app/`, and `lib/` (`grep -rn "Ref\.current = " components/ app/ lib/ | wc -l`). Refactoring it here alone, in isolation, would be inconsistent with the rest of the codebase and is a repo-wide tooling/adoption decision, not a 165-02 fix.
4. `git diff` confirms 165-02 added zero NEW `.current =` write assignments — only two new `.current` READS (`stateRef.current.editEpoch`, `stateToSavePayload(stateRef.current, opts)`), which mirror the exact pre-existing read pattern already used elsewhere in this same function.

**Recommendation:** If/when this codebase adopts the React Compiler (or wants to start enforcing `eslint-plugin-react-hooks`'s compiler-based rules as a real gate), that adoption should be its own dedicated phase — it will need to touch all 135 call sites, not just this file.

**Verification that 165-02's own added code is clean:** `npx tsc --noEmit -p tsconfig.ci.json` exits 0; both new test files (`estimate-reducer-mark-saved.test.ts`, `estimate-editor-conflict.test.tsx`) pass in full.

## 165-02: pre-existing failure in `tests/unit/actions/recording-early-return-events.test.ts` (unrelated file, out of scope)

**Found during:** a broader regression sweep (`npx vitest run tests/unit/estimate tests/unit/actions tests/unit/workspace tests/unit/schemas`) run after Task 2 to check for collateral damage from the `lib/actions/estimate.ts` / reducer / editor changes.

**What was observed:** `tests/unit/actions/recording-early-return-events.test.ts > ... accepts a valid path + sane duration and does NOT record a failed event` fails with `TypeError: supabase.from(...).select is not a function` inside `lib/actions/recording.ts:286` (`companies` tier lookup). Confirmed unrelated to 165-02: `lib/actions/recording.ts` and its test file are untouched by this plan (`git status --short` shows no pending changes to either), and the failure reproduces in complete isolation (`npx vitest run tests/unit/actions/recording-early-return-events.test.ts` alone, no other test files in the run). Not caused by 165-02's changes to `lib/actions/estimate.ts`, `use-estimate-reducer.ts`, or `estimate-editor.tsx` — a different action module entirely, most likely a pre-existing mock/shape drift against `recording.ts`'s current implementation (the mock's `supabase.from(...)` chain doesn't expose `.select` for this particular query path).

**Why not fixed:** out of scope per the SCOPE BOUNDARY rule — a pre-existing failure in a file this plan does not touch or depend on.
