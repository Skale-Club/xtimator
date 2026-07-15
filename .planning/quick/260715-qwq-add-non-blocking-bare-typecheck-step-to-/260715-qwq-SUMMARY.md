---
phase: quick-260715-qwq
plan: 01
subsystem: infra
tags: [ci, github-actions, typescript, tsc, workflow_run, continue-on-error]

# Dependency graph
requires:
  - phase: quick-260715-aa1
    provides: "Bare `tsc --noEmit` cleaned from 25 errors to 0 — the clean baseline this advisory step now guards"
provides:
  - "Advisory bare `npx tsc --noEmit` step (whole repo, tests/** included) in the `unit` job of the Test workflow"
  - "Early-warning signal for tests/** type drift that the scoped tsconfig.ci.json gate structurally cannot see"
  - "Corrected comment on the scoped gate (the '9 pre-existing errors' claim was stale/false)"
affects: [ci, test-maintenance, deploy-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Advisory-vs-blocking CI check split: step-level `continue-on-error: true` for signal-only checks in a workflow whose conclusion gates deploys"

key-files:
  created:
    - .planning/quick/260715-qwq-add-non-blocking-bare-typecheck-step-to-/260715-qwq-SUMMARY.md
  modified:
    - .github/workflows/test.yml

key-decisions:
  - "Step-level `continue-on-error: true` (not job-level, not a second job) — keeps `unit` the only job so the step→job→workflow-run conclusion mapping that build-deploy.yml reads stays unambiguous, and avoids a second `npm install`"
  - "Advisory step gets an explicit `name:` while sibling steps stay bare `- run:` — deliberate asymmetry so its advisory status is visible in the Actions UI without opening the YAML"
  - "tsconfig.ci.json remains the real blocking gate; its include/exclude untouched"

patterns-established:
  - "Signal-not-gate: checks that watch non-shipping code (tests/**) report but never fail the Test workflow, because build-deploy.yml gates on `workflow_run.conclusion == 'success'` and a red Test silently blocks EVERY deploy"

requirements-completed: [CIVIS-01]

# Metrics
duration: 8min
completed: 2026-07-15
---

# Quick 260715-qwq: Non-blocking bare typecheck in CI Summary

**Advisory `npx tsc --noEmit` step (whole repo, tests/** included) added to the Test workflow's `unit` job with step-level `continue-on-error: true` — surfaces test-type drift on every push/PR while remaining structurally incapable of failing the job, the workflow conclusion, or the deploy that reads it.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** 1 (`.github/workflows/test.yml`, +18/-2)

## Accomplishments

- Test drift in `tests/**` is now reported on every CI run. The scoped gate (`tsconfig.ci.json`) excludes `tests/**` by design, so the 25-error rot fixed in quick-260715-aa1 was invisible to CI and would have rotted back silently. It no longer can.
- Zero deploy risk, by construction: `continue-on-error: true` is step-level on the new step only; `unit` remains the sole job; no job-level `continue-on-error` exists. A red bare tsc leaves the Test workflow conclusion at `success`, so build-deploy.yml's `workflow_run.conclusion == 'success'` gate still fires.
- The stale comment claiming bare tsc is "red on 9 pre-existing test-file-only errors" is gone — it was false as of quick-260715-aa1 and would have taught the next reader that red is normal.
- Advisory status is legible in the Actions UI without opening the YAML (step named `Bare typecheck (advisory, non-blocking)`).

## Task Commits

1. **Task 1 + 2: Add advisory bare typecheck step and correct the stale comment** — `a1037f61` (ci)

Both tasks touch the same single file and the same region; Task 2 was verification + commit of Task 1's edit, so the plan produced one atomic commit rather than two. No functional deviation from the plan.

## Files Created/Modified

- `.github/workflows/test.yml` — Advisory bare typecheck step added directly after the scoped gate; scoped gate's comment corrected to explain why it's the real gate and why the advisory step exists alongside it.

## Verification (actual observed output)

| Check | Expected | Actual |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.ci.json` | 0 errors (gate stays green) | exit 0, no output |
| `npx tsc --noEmit` | 0 errors | exit 0, no output |
| `npx vitest run tests/unit tests/eval` | 3442 passing | **3442 passed**, 21 todo (3463); 464 files passed, 1 skipped; exit 0 |
| Structural YAML assertion (plan's check) | passes | `OK: Bare typecheck (advisory, non-blocking)` |
| `git diff --stat -- tsconfig.json tsconfig.ci.json` | empty | empty (both untouched) |
| `git show --pretty=format: --name-only HEAD` | exactly `.github/workflows/test.yml` | `.github/workflows/test.yml` only |
| Pre-existing unrelated mods intact | still unstaged | `M app/admin/integrations/integrations-nav.tsx`, `M package-lock.json` — untouched |
| Not pushed | HEAD not on origin/main | OK — HEAD `a1037f61` local-only; `origin/main` still at `732b3a88` |

The structural assertion independently confirms: `unit` is the only job; no job-level `continue-on-error`; the advisory step directly follows the scoped gate; it has an explicit name; it is the *only* step with `continue-on-error: true`.

## Decisions Made

None beyond the plan — followed as specified. The plan's design rationale (step-level over job-level, one job, explicit name) was adopted verbatim.

## Deviations from Plan

None — plan executed exactly as written.

The only procedural difference: Tasks 1 and 2 collapsed into a single commit, because Task 2's action *was* the verification and commit of Task 1's edit to the same file. No separate commit was warranted.

## Issues Encountered

None. Bare `tsc --noEmit` was 0 errors at execution time, matching the quick-260715-aa1 baseline — no new drift had landed, so the STOP-and-report condition in the plan was not triggered.

## User Setup Required

None.

## Next Phase Readiness

- **The commit is LOCAL and NOT pushed**, per explicit constraint. Pushing to `main` auto-deploys to prod (CI → GHCR → Coolify) and requires the user's explicit approval. `origin/main` is unchanged at `732b3a88`.
- The advisory step's real behavior (that a red bare tsc genuinely leaves the workflow conclusion `success`) has only been verified structurally, not observed live. First push will confirm it on a real runner — and since bare tsc is currently 0 errors, the first run should be green anyway.
- Caveat worth keeping in view: this is a signal, not a gate. Nothing forces anyone to act on a red advisory step. It surfaces drift; it does not prevent it.

## Self-Check: PASSED

- `.github/workflows/test.yml` — FOUND
- `.planning/quick/260715-qwq-add-non-blocking-bare-typecheck-step-to-/260715-qwq-SUMMARY.md` — FOUND
- Commit `a1037f61` — FOUND (local, on `main`, not on `origin/main`)

---
*Phase: quick-260715-qwq*
*Completed: 2026-07-15*
</content>
