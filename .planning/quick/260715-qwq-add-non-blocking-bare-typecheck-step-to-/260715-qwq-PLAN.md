---
phase: quick-260715-qwq
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [CIVIS-01]
files_modified:
  - .github/workflows/test.yml

must_haves:
  truths:
    - "The Test workflow runs a bare `npx tsc --noEmit` (whole repo, tests/** included) on every push and PR"
    - "That bare typecheck can NEVER fail the `unit` job — a red bare tsc leaves the Test workflow conclusion at 'success'"
    - "build-deploy.yml still fires: its `workflow_run.conclusion == 'success'` gate is unaffected by advisory failures"
    - "The step reads as advisory in the GitHub Actions UI without opening the YAML (explicit `name:` says so)"
    - "The scoped `tsconfig.ci.json` typecheck remains the real, blocking gate"
    - "The comment above the scoped gate no longer claims bare tsc is red on 9 pre-existing errors"
    - "Only `.github/workflows/test.yml` changed — tsconfig.json and tsconfig.ci.json are untouched"
  artifacts:
    - path: ".github/workflows/test.yml"
      provides: "Advisory bare typecheck step inside the existing `unit` job"
      contains: "continue-on-error: true"
  key_links:
    - from: ".github/workflows/test.yml (advisory step)"
      to: "job conclusion of `unit`"
      via: "step-level continue-on-error: true (decouples step result from job result)"
      pattern: "continue-on-error: true"
    - from: ".github/workflows/build-deploy.yml"
      to: "Test workflow conclusion"
      via: "workflow_run gate `github.event.workflow_run.conclusion == 'success'`"
      pattern: "workflow_run.conclusion == 'success'"
---

<objective>
Make test/source type drift VISIBLE in CI without gating merges or deploys.

The CI typecheck (`npx tsc --noEmit -p tsconfig.ci.json`) is scoped to app/lib/components/hooks and deliberately excludes `tests/**`. Drift in test files (stale mocks, fixtures missing newly-required fields) is therefore completely invisible to the gate — it silently reached 25 errors before quick-260715-aa1 cleaned it to 0 on 2026-07-15. That clean state is NOT self-healing; with tests/ still excluded, it will rot back to red exactly as before.

Purpose: an early-warning signal for test-type rot, with zero risk to the deploy path.
Output: one advisory, non-blocking step in the existing `unit` job of `.github/workflows/test.yml`, plus a corrected stale comment.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.github/workflows/test.yml
@.github/workflows/build-deploy.yml
@tsconfig.ci.json

**WORKING DIRECTORY — READ THIS FIRST:** All work happens in the MAIN checkout at `C:/Users/Vanildo/Dev/xtimator` on branch `main`. Your shell may start in a git worktree under `.claude/worktrees/` which has NO node_modules and is on a feature branch — nothing there will run. `cd C:/Users/Vanildo/Dev/xtimator` for every command and use that root for every path.

**Why non-blocking is non-negotiable (the whole point of this design):**
`.github/workflows/build-deploy.yml` triggers on `workflow_run` for `workflows: ["Test"]` and its `build-and-push` job is gated on `github.event.workflow_run.conclusion == 'success'`. Any hard-failing check in the Test workflow therefore silently blocks EVERY deploy, and prod cannot self-heal. This is a known past incident class in this project (see memory: "Red CI blocks all deploys"). A red bare typecheck is a cleanup signal, never a merge blocker.
</context>

<interfaces>
<!-- Current state of the region being edited. `.github/workflows/test.yml` lines 46-49 verbatim: -->

```yaml
      # Scoped typecheck — app/lib/components/hooks only (tsconfig.ci.json).
      # The full `tsc --noEmit` is red on 9 pre-existing test-file-only errors
      # (research Pitfall 7); the scoped gate is GREEN and meaningful.
      - run: npx tsc --noEmit -p tsconfig.ci.json
```

The "red on 9 pre-existing test-file-only errors" claim is now FALSE — bare tsc is 0 errors as of quick-260715-aa1.

Structure of the `unit` job (the ONLY job in this workflow): checkout → setup-node → `npm install --no-audit --no-fund` → scoped typecheck → `npx vitest run tests/unit tests/eval` → same vitest run again (determinism gate).
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add advisory bare typecheck step and correct the stale comment</name>
  <files>.github/workflows/test.yml</files>
  <action>
Edit ONLY `.github/workflows/test.yml`. Replace the 4-line block at lines 46-49 (the scoped typecheck comment + its `- run:`) with the comment-corrected scoped gate followed immediately by the new advisory step, so the two typechecks read as a pair:

```yaml
      # Scoped typecheck — app/lib/components/hooks only (tsconfig.ci.json).
      # This is the REAL gate: it covers only code that can actually reach
      # production, so a failure here is always deploy-relevant. It deliberately
      # excludes tests/**, which is exactly why the advisory step below exists.
      - run: npx tsc --noEmit -p tsconfig.ci.json

      # Advisory bare typecheck — the WHOLE repo, tests/** included.
      # NON-BLOCKING BY DESIGN (`continue-on-error: true`). Do NOT promote this
      # to a hard gate: build-deploy.yml triggers on `workflow_run` for this
      # workflow and only builds when `workflow_run.conclusion == 'success'`, so
      # anything that can fail the Test workflow silently blocks EVERY deploy and
      # stops prod from self-healing.
      # What it watches: type drift in tests/** — stale mocks, fixtures missing
      # newly-required fields. That drift is invisible to the scoped gate above
      # and had silently reached 25 errors before quick-260715-aa1 brought bare
      # `tsc --noEmit` to 0 (2026-07-15). Red here means drift to clean up, never
      # a blocked merge.
      - name: Bare typecheck (advisory, non-blocking)
        continue-on-error: true
        run: npx tsc --noEmit
```

Hard constraints — the diff MUST NOT violate any of these:
1. `continue-on-error: true` is STEP-level, on the new step only. Never job-level, never on any other step.
2. Do NOT add a new job. `unit` stays the only job — a second job means a second `npm install` and makes the mapping from job-level continue-on-error to the workflow-run conclusion that build-deploy.yml reads ambiguous.
3. Do NOT touch `tsconfig.ci.json` `include`/`exclude`. The scoped config stays the real gate.
4. Do NOT touch `tsconfig.json` `target` (ES2017) — raising it repo-wide would change production emit.
5. Do NOT modify the workflow header comment block (lines 1-15), the `on:`/`permissions:` blocks, or the two vitest steps. Keep the diff to this one region.
6. The advisory step keeps the bare `run: npx tsc --noEmit` form — no `-p`, no extra flags.

Note the existing steps in this job are mostly bare `- run:` with no `name:`. The advisory step intentionally gets an explicit `name:` so its advisory status is obvious in the Actions UI without opening the YAML — that asymmetry is deliberate, not an inconsistency to "fix".
  </action>
  <verify>
    <automated>cd C:/Users/Vanildo/Dev/xtimator && node -e "const y=require('js-yaml'),f=require('fs');const d=y.load(f.readFileSync('.github/workflows/test.yml','utf8'));const jobs=Object.keys(d.jobs);if(jobs.length!==1||jobs[0]!=='unit')throw new Error('job set changed: '+jobs);if(d.jobs.unit['continue-on-error']!==undefined)throw new Error('job-level continue-on-error MUST NOT be set');const s=d.jobs.unit.steps.find(x=>x.run==='npx tsc --noEmit');if(!s)throw new Error('advisory bare typecheck step missing');if(s['continue-on-error']!==true)throw new Error('advisory step is NOT non-blocking');if(!s.name)throw new Error('advisory step needs an explicit name');const scoped=d.jobs.unit.steps.findIndex(x=>x.run==='npx tsc --noEmit -p tsconfig.ci.json');const adv=d.jobs.unit.steps.indexOf(s);if(scoped===-1)throw new Error('scoped gate missing');if(adv!==scoped+1)throw new Error('advisory step must directly follow the scoped gate');if(d.jobs.unit.steps.filter(x=>x['continue-on-error']).length!==1)throw new Error('exactly one step may be non-blocking');console.log('OK:',s.name)"</automated>
  </verify>
  <done>YAML parses; `unit` is still the only job; the advisory step exists directly after the scoped gate, has an explicit name, and is the only step with `continue-on-error: true`; no job-level continue-on-error. The stale "red on 9 pre-existing test-file-only errors" comment is gone.</done>
</task>

<task type="auto">
  <name>Task 2: Verify the gate stays green and commit test.yml only (DO NOT PUSH)</name>
  <files>.github/workflows/test.yml</files>
  <action>
Run all verification from `C:/Users/Vanildo/Dev/xtimator`, then commit.

Verification (all must hold):
- `npx tsc --noEmit -p tsconfig.ci.json` — the existing gate, must stay green (0 errors)
- `npx tsc --noEmit` — expected 0 errors right now
- `npx vitest run tests/unit tests/eval` — expected 3442 passing
- `git diff --stat -- tsconfig.json tsconfig.ci.json` — MUST be empty output (proves constraints 3 and 4 held)

If bare `tsc --noEmit` reports errors: STOP and report. It was 0 as of quick-260715-aa1; a non-zero count means new drift landed since, which is a separate finding, NOT something to fix here or to paper over by changing the step.

Git — read carefully:
- `main` has PRE-EXISTING uncommitted changes to `app/admin/integrations/integrations-nav.tsx` and `package-lock.json` that are NOT part of this task. Do NOT stage, revert, stash, checkout, or otherwise touch them. They must still show as unstaged modifications when you are done.
- Stage EXACTLY one file: `git add .github/workflows/test.yml`
- Confirm the staged set before committing: `git diff --cached --name-only` must print exactly `.github/workflows/test.yml` and nothing else.
- Commit on `main` with: `ci(quick-260715-qwq): add non-blocking bare typecheck step to Test workflow`
- **DO NOT PUSH.** Pushing to `main` auto-deploys to prod (CI → GHCR → Coolify) and requires explicit user approval first. Leave the commit local. Do not run `git push` under any circumstances.
  </action>
  <verify>
    <automated>cd C:/Users/Vanildo/Dev/xtimator && npx tsc --noEmit -p tsconfig.ci.json && npx tsc --noEmit && npx vitest run tests/unit tests/eval && test -z "$(git diff --stat -- tsconfig.json tsconfig.ci.json)" && test "$(git show --pretty=format: --name-only HEAD | grep -v '^$')" = ".github/workflows/test.yml" && git status --short | grep -q 'app/admin/integrations/integrations-nav.tsx' && ! git merge-base --is-ancestor HEAD origin/main && echo "ALL CHECKS PASS"</automated>
  </verify>
  <done>Scoped gate green; bare tsc 0 errors; 3442 tests passing; tsconfig.json and tsconfig.ci.json unmodified; HEAD commit touches exactly `.github/workflows/test.yml`; the two pre-existing unrelated modifications remain unstaged and intact; commit exists locally on `main` and was NOT pushed.</done>
</task>

</tasks>

<verification>
- `.github/workflows/test.yml` parses as valid YAML
- The `unit` job is still the workflow's only job (no second `npm install`)
- The advisory step is the only `continue-on-error: true` in the file, and it is step-level
- `npx tsc --noEmit -p tsconfig.ci.json` → 0 errors (existing gate unchanged and green)
- `npx tsc --noEmit` → 0 errors (advisory signal currently clean)
- `npx vitest run tests/unit tests/eval` → 3442 passing
- `tsconfig.json` and `tsconfig.ci.json` show no diff
- The deploy gate in build-deploy.yml (`workflow_run.conclusion == 'success'`) is structurally unable to be tripped by the advisory step
- Local commit on `main`, nothing pushed
</verification>

<success_criteria>
Bare-repo type drift (including `tests/**`) is reported on every CI run under a step named so its advisory status is obvious in the Actions UI, while remaining structurally incapable of failing the `unit` job, the Test workflow conclusion, or the deploy that reads it. The scoped `tsconfig.ci.json` gate is untouched and still blocking. The stale comment claiming bare tsc is red on 9 pre-existing errors is corrected. Exactly one file changed, committed locally, not pushed.
</success_criteria>

<output>
After completion, create `.planning/quick/260715-qwq-add-non-blocking-bare-typecheck-step-to-/260715-qwq-SUMMARY.md`
</output>
