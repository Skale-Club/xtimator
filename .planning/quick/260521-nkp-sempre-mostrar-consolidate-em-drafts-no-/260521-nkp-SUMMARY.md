---
phase: quick-260521-nkp
plan: 01
subsystem: ui

tags: [estimate-editor, floating-actions, ux-bugfix, react, typescript]

# Dependency graph
requires:
  - phase: SEED-028-Phase-B
    provides: EstimateFloatingActions component (replaces 2s autosave)
provides:
  - "Consolidate is always reachable on a current draft (no more 'fake edit' workaround)"
  - "Discard is disabled on a clean draft (mirrors Save Draft behavior)"
  - "Saved pulse pill preserved as transient post-save feedback"
affects: [estimate-editor, send-tab, draft-to-consolidated workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render-cluster-with-disabled-buttons (instead of unmounting) for always-available primary action"

key-files:
  created: []
  modified:
    - components/workspace/estimate/estimate-floating-actions.tsx

key-decisions:
  - "Narrowed clean-branch short-circuit to ONLY the 'saved' status (not 'idle'/'error') — preserves the brief Saved pulse while exposing Consolidate on every other clean draft state"
  - "Discard disabled condition mirrors Save Draft (`isSaving || !isDirty`) — nothing to discard when clean"
  - "Consolidate keeps `disabled={isSaving}` only — clickable on a clean draft, blocked during in-flight save"

patterns-established:
  - "Floating action cluster: when a primary action (Consolidate) is the user's goal, keep the cluster visible and disable only the secondary/destructive actions when not applicable, instead of unmounting the cluster entirely"

requirements-completed:
  - QUICK-260521-NKP-01

# Metrics
duration: ~5 min (auto-execution)
completed: 2026-05-21
---

# Phase quick-260521-nkp Plan 01: Sempre mostrar Consolidate em drafts (no-edit path) Summary

**Bug fix: Consolidate is now always visible on a current draft; Save Draft and Discard correctly disable themselves when the draft is clean; the brief 'Saved' pulse pill survives unchanged.**

## Performance

- **Duration:** ~5 min (autonomous executor, single-file diff)
- **Started:** 2026-05-21T20:04:13Z
- **Completed:** 2026-05-21T20:04:56Z
- **Tasks:** 1 of 2 executed automatically (Task 2 is a human-verify checkpoint — deferred to user)
- **Files modified:** 1
- **Net diff:** -17 / +16 lines (≈ 1 line net reduction — well under the ~10-line budget)

## Accomplishments
- `EstimateFloatingActions` clean-draft guard narrowed from `!isDirty && status !== 'saving'` to `!isDirty && status === 'saved'`, so only the post-save Saved-pulse window short-circuits the cluster
- All other clean-draft states (idle, error) now fall through to the action cluster with Discard + Save Draft visibly disabled and Consolidate enabled
- Discard button `disabled` condition tightened to `isSaving || !isDirty` (mirrors Save Draft) so users can't trigger Discard with nothing to discard
- Doc comment + inline comment refreshed to match the new behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Always render the action cluster on a current draft; show "Saved" pulse only briefly** — `cced5d1` (fix)

**Plan metadata commit (SUMMARY.md + STATE.md):** Handled by the orchestrator in Step 8 (per executor constraints).

## Files Created/Modified
- `components/workspace/estimate/estimate-floating-actions.tsx` — Narrowed the clean-branch guard, updated the file-header doc comment, updated the inline cluster comment, and tightened the Discard button's `disabled` condition. The `!isCurrent` early return, the consolidated branch, the props interface, the component signature, and the Save/Consolidate disabled conditions are all byte-identical to before.

## Decisions Made
- **Narrow the clean-branch guard to `status === 'saved'`, not remove it entirely.** Keeps the 2.5s Saved pulse pill (a useful affordance) while still surfacing Consolidate on every other clean state.
- **Mirror Save Draft's disabled condition on Discard.** Both buttons act on "current pending changes" — if nothing is dirty, both are equally inapplicable, so disabling Discard alongside Save Draft is the consistent UX.
- **Do not touch Consolidate's disabled condition.** Plan explicitly forbids it, and `isSaving`-only was already the correct condition — it stays clickable on a clean draft (which is the whole point of the fix) and disabled during an in-flight save.

## Deviations from Plan

None — plan executed exactly as written. The 4 narrow changes specified in Task 1 (guard narrowing, two comment tweaks, Discard disabled condition) were applied verbatim with no auto-fixes triggered.

## Issues Encountered

None during the code change itself.

(Operational note for the worktree harness, not a code issue: the initial Edit calls were intercepted by a pre-tool read-before-edit hook because the Read tool had resolved to the main repo path rather than the worktree path on first invocation. Resolved by Read-ing the worktree's absolute path and re-applying all three edits there. The committed diff in this worktree branch is the canonical source of truth.)

## Stub & Threat Scan

- **Stubs:** None introduced. No hardcoded empty arrays/objects/strings, no placeholder copy, no unwired props. The component continues to consume the same caller-provided props as before.
- **Threat flags:** None. The change is purely client-side render logic on an existing UI surface. No new network endpoint, auth path, file access, schema change, or trust-boundary surface.

## Human Verification (Deferred to User)

Task 2 in the plan is a `checkpoint:human-verify` step. Per the executor's automated-run constraints, the dev server was NOT started and no screenshots were taken from this run. The user (or the orchestrator's next step) should manually verify the following six rendering states against an estimate page:

1. **Clean draft, idle** — Cluster visible, Discard + Save draft disabled (greyed), Consolidate enabled. **(This is the bug fix — used to be hidden.)**
2. **Dirty draft** — All three buttons enabled; Save draft and Discard usable.
3. **Saved pulse** — From dirty, click Save draft. Green "Saved" pulse pill shows for ~2.5s, then the cluster reappears with Save/Discard disabled and Consolidate enabled.
4. **Consolidated current** — Only the "New version" floating button shows (unchanged).
5. **Old version (non-current)** — Nothing renders (unchanged).
6. **Saving in flight** — All three buttons disabled while the save is in flight.

Confirmation criterion: in state 1, Consolidate must be clickable without first manufacturing a fake edit.

## Self-Check: PASSED

- `components/workspace/estimate/estimate-floating-actions.tsx` exists and contains all 4 expected modifications (guard narrowing, doc comment update, inline comment update, Discard disabled tightening). Verified inline by Read after edits.
- Commit `cced5d1` exists on branch `worktree-agent-a620a0373e61ebeeb` (`fix(quick-260521-nkp): always show Consolidate on current drafts`).
- `npx tsc --noEmit` produced no output (no errors) after the change.

## Next Phase Readiness

- The estimate-editor draft → consolidated workflow is now free of the no-edit-path bug; no follow-up plan needed for this bug.
- No coupling changes; downstream consumers (`estimate-editor.tsx`, `send-tab.tsx`) untouched and unaffected.

---
*Phase: quick-260521-nkp*
*Completed: 2026-05-21*
