---
phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
plan: 04
subsystem: estimate-graph
tags: [anchor-test, source-text-test, behavior-preserving, d-13-audit, whatsapp, refactor]
dependency_graph:
  requires:
    - "lib/estimate/graph (94-02/94-03 shared core: nodes/generate.ts, nodes/assess.ts, nodes/decide.ts, index.ts topology)"
    - "lib/estimate/adapters/whatsapp.ts (94-03 WhatsApp adapter: awaiting_details/buildAskDetailsMessage/revertVagueEstimate)"
    - "lib/whatsapp/estimate-graph.ts (94-03 thin wiring; buildEstimateGraph() stable)"
  provides:
    - "tests/unit/inngest/whatsapp-process-job.test.ts (anchor source-text test repointed to the moved module homes; GREEN)"
    - "D-13 behavior-preserving audit result (only readFileSync paths changed + the one documented ENGINE-04 rename)"
  affects:
    - "Phase 94 completion: CHAN-01 satisfied (WhatsApp consumes the shared graph; behavior preserved + provable by green suite)"
tech_stack:
  added: []
  patterns:
    - "Source-text anchor test repointed by readFileSync PATH only (D-13): graphSrc split into generateSrc/assessSrc/decideSrc/indexSrc/adapterSrc at the tokens' new homes"
    - "Single documented assertion change (ENGINE-04): /generationFailed/ -> /failure/ failure-as-state, behavior unchanged (QA-01 frozen test guards the actual routing)"
    - "Topology-location update: addConditionalEdges('generateEstimate'...) -> addConditionalEdges('generate'...) — node renamed during extraction, same routing semantics"
key_files:
  created:
    - ".planning/phases/94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam/94-04-SUMMARY.md"
  modified:
    - "tests/unit/inngest/whatsapp-process-job.test.ts"
decisions:
  - "jobSrc (lib/inngest/functions/whatsapp-process.ts) read kept UNCHANGED: step.run('orchestrate-estimate') + buildEstimateGraph() + onFailure + sendFallbackReply + idempotency assertions all preserved"
  - "isVagueEstimate( asserted in assessSrc (the CORE node that calls the gate) rather than vagueness.ts — the anchor test guards the graph wiring, and the call site is in assess.ts"
  - "checkGeneratedEdge asserted in decideSrc (where the edge fn now lives); the topology literal asserted in indexSrc (where addConditionalEdges now wires it)"
  - "Full suite run over the DIRTY tree (unrelated skeleton/settings redesign present); 10 failures classified as pre-existing out-of-scope UI work, NOT phase 94"
metrics:
  duration_min: 6
  tasks: 2
  files_changed: 1
  completed: 2026-06-20
---

# Phase 94 Plan 04: Anchor Test Repoint + D-13 Behavior-Preserving Audit Summary

Closed the behavior-preserving extraction by repointing the #1-trap source-text anchor test (`tests/unit/inngest/whatsapp-process-job.test.ts`) to the moved module homes — `graphSrc` (the now-thin `lib/whatsapp/estimate-graph.ts`) was split into reads of the CORE nodes (`generate`/`assess`/`decide`/`index`) and the WhatsApp adapter, with EVERY change being a readFileSync path/source-target repoint EXCEPT the single documented ENGINE-04 `generationFailed`→`failure` rename. The anchor test is GREEN again and the full phase-94 test scope (237 tests) is green, proving the extraction is behavior-preserving.

## What Was Built

### Task 1 — Repoint the anchor test's readFileSync paths to the moved token homes (commit 76dc006)
- Removed the single `graphSrc = readFileSync('lib/whatsapp/estimate-graph.ts')` read (the heavy graph moved out of that file in 94-03) and added five targeted reads at the tokens' new homes:
  - `generateSrc` → `lib/estimate/graph/nodes/generate.ts` (CORE generate: `generateEstimateForProject(` + the failure-as-state flag)
  - `assessSrc` → `lib/estimate/graph/nodes/assess.ts` (CORE assess: `isVagueEstimate(` call)
  - `decideSrc` → `lib/estimate/graph/nodes/decide.ts` (CORE decide: `checkGeneratedEdge`)
  - `indexSrc` → `lib/estimate/graph/index.ts` (CORE topology: `addConditionalEdges('generate', checkGeneratedEdge ...)`)
  - `adapterSrc` → `lib/estimate/adapters/whatsapp.ts` (WhatsApp adapter: `awaiting_details`, `buildAskDetailsMessage(`, `revertVagueEstimate(`)
- `jobSrc` (`lib/inngest/functions/whatsapp-process.ts`) read kept UNCHANGED; its `step.run('orchestrate-estimate')`, `buildEstimateGraph(`, `onFailure`, `sendFallbackReply`, `data?.event?.data`, and idempotency assertions are all preserved verbatim.
- THE ONE INTENTIONAL ASSERTION CHANGE (ENGINE-04, Pitfall 2): `expect(graphSrc).toMatch(/generationFailed/)` → `expect(generateSrc).toMatch(/failure/)`, with an inline comment documenting that `generationFailed` was generalized to failure-as-state (intentional contract change, NOT a behavior change — never-throw routing preserved; QA-01 frozen test guards the behavior). `grep -q "ENGINE-04"` matches.
- The topology literal node name was updated `'generateEstimate'` → `'generate'` (the node was renamed during extraction; same routing semantics, asserted against `indexSrc` where the wiring now lives) — part of the same path/source-target move.
- Verify: `npx vitest run tests/unit/inngest/whatsapp-process-job.test.ts` → 5/5 GREEN.

### Task 2 — Full-suite green gate + D-13 behavior-preserving audit
- **D-13 audit (the heart of the plan):**
  - `tests/unit/whatsapp/ask-details.test.ts` — `git diff` EMPTY (0 changes). The 94-02 re-export of `isVagueEstimate` from `lib/whatsapp/ask-details.ts` kept it green untouched.
  - `tests/unit/whatsapp/never-reply-regression.test.ts` (QA-01 frozen) — `git diff` EMPTY (0 changes). Behavioral safety net intact since Plan 01: `graph.invoke` resolves + exactly one `sendWhatsAppMessage` across all three failure paths; `awaiting_details` state assertion unchanged.
  - `tests/unit/inngest/whatsapp-process-job.test.ts` — the ONLY pre-existing test changed; the diff (50 insertions / 14 deletions) is limited to (a) new readFileSync vars, (b) regex source-target swaps to the new homes, and (c) the single documented ENGINE-04 `generationFailed`→`failure` rename + the `'generateEstimate'`→`'generate'` topology node-name update. NO assertion was weakened or deleted.
- **Secret-scan gate:** `lib/estimate` scanned with the plan's pattern (`whsec_|sk_(test|live)_|sb_secret_|sk-ant-|sk-proj-`) → CLEAN. (A broader scan that also included bare `re_` produced a false positive on the substring `signatu**re_**enabled` in `profile-field-map.ts` — a column name, not a Resend key.)
- **Full suite (`npm test`) over the DIRTY working tree:** 1529 passed / 10 failed / 2 skipped / 33 todo (1574 total).
- **Phase-94 test scope (`tests/unit/estimate` + `tests/unit/whatsapp` + the anchor):** 237 passed / 0 failed / 28 todo — ALL GREEN.

## Full-Suite Failure Classification (the behavior-preserving gate)

The full suite ran over a DIRTY tree that includes the user's unrelated loading-skeletons redesign (~68 uncommitted files: `app/**/loading.tsx`, `components/skeletons/`, `card.tsx`, `project-workspace.tsx`, settings nav/account). Per the user's explicit "leave as-is, continue" choice, those were left untouched. The 10 failures classify cleanly:

| Failing file | Count | Imports phase-94 code? | Classification |
|--------------|-------|------------------------|----------------|
| `tests/unit/components/onboarding-survey.test.tsx` | 5 | No (`components/onboarding/survey/*`) | PRE-EXISTING — out of scope (unrelated UI work) |
| `tests/unit/landing-actions.test.ts` | 4 | No (landing actions / `platform_branding`) | PRE-EXISTING — out of scope (unrelated UI work) |
| `tests/unit/components/theme-toggle.test.tsx` | 1 | No (`components/app-shell/theme-toggle`) | PRE-EXISTING — out of scope (unrelated UI work) |

- **BLOCKING (phase-94) failures: 0.** Nothing under `tests/unit/estimate/*`, `tests/unit/whatsapp/*`, the anchor test, or anything importing `lib/estimate/*` / the rewired `lib/whatsapp/estimate-graph.ts` failed.
- All 10 failures are in UI files whose source areas (`components/onboarding/survey`, `components/app-shell/sidebar`/`theme-toggle`, `components/settings/*`, `app/(app)/settings/*`, `app/admin/landing`) are modified by the uncommitted skeleton/settings redesign in the working tree. They have ZERO dependency on phase-94 code. Not fixed (out of scope, not caused by phase 94). Reported here for visibility.

## D-13 Audit Outcome

**CONFIRMED behavior-preserving.** The extraction changed only WHERE the guarded tokens live, never WHAT the test asserts:
- 2 of the 3 behavior-preserving anchors (`ask-details.test.ts`, `never-reply-regression.test.ts`) have ZERO changes.
- The third (`whatsapp-process-job.test.ts`) changed only readFileSync paths/source-targets + the single documented ENGINE-04 `generationFailed`→`failure` rename (with the `'generateEstimate'`→`'generate'` topology node-name shift that accompanies it).
- No assertion's strength was reduced; no failure-path coverage was removed. The QA-01 frozen behavioral test (never-throw / always-reply, exactly-one-reply across all three failure paths) is green and untouched — the authoritative proof that WhatsApp behavior survived the move.

## Deviations from Plan

None — plan executed exactly as written. The single ENGINE-04 `generationFailed`→`failure` assertion change is the documented exception specified in the plan (Task 1, step 3), not a deviation.

## Commit Isolation Verification

`git add -A`/`git add .`/`git commit -a` were NEVER used. The only commit (`76dc006`) staged exactly one explicit path: `tests/unit/inngest/whatsapp-process-job.test.ts`. No `git stash`/`checkout`/`reset`/`pull` and no edits to any `loading.tsx`/skeleton/settings/card/project-workspace file. The unrelated skeleton work remains uncommitted and untouched (verified via `git status` after the final commit).

## Known Stubs

None introduced by this plan. (The `lib/estimate/adapters/default.ts` web/MCP stub is from 94-03 and is documented there; it is intentional and filled in Phase 95.)

## Self-Check: PASSED

- FOUND: `.planning/phases/94-.../94-04-SUMMARY.md`
- FOUND: `tests/unit/inngest/whatsapp-process-job.test.ts` (repointed, ENGINE-04 marker present)
- FOUND: commit `76dc006`
