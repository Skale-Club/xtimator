---
phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
plan: 02
subsystem: estimate-domain-core
tags: [langgraph, refactor, channel-neutral, steprunner, never-throw]
requires:
  - "94-01 (Wave 0 test stubs + CHECKPOINTING.md artifact)"
  - "lib/services/generate-estimate.ts (generateEstimateForProject — unchanged)"
  - "lib/whatsapp/ask-details.ts (isVagueEstimate source — moved + re-export)"
provides:
  - "lib/estimate/quality/vagueness.ts — channel-neutral isVagueEstimate + VagueCheckEstimate"
  - "lib/estimate/graph/state.ts — channel-neutral EstimateState Annotation.Root + EstimateStateType"
  - "lib/estimate/graph/types.ts — ChannelAdapter + StepRunner interfaces + passthroughRunner"
  - "lib/estimate/graph/nodes/generate.ts — makeGenerateNode(runner) (never-throw -> failure)"
  - "lib/estimate/graph/nodes/assess.ts — assessNode (isVagueEstimate -> isVague)"
  - "lib/estimate/graph/nodes/decide.ts — checkGeneratedEdge / checkVagueEdge"
  - "lib/estimate/graph/index.ts — buildEstimateGraph(adapter, { runner }) factory, no checkpointer"
affects:
  - "lib/whatsapp/ask-details.ts (now re-exports isVagueEstimate from the quality module)"
  - "Plan 94-03 (WhatsApp adapter + rewiring will consume this core)"
tech-stack:
  added: []
  patterns:
    - "Closure-factory ChannelAdapter (mirrors makeQueryTools) — edge behaviors only"
    - "Failure-as-state never-throw invariant (failure?: { reason } channel)"
    - "StepRunner durability seam injected at the factory; passthrough default"
key-files:
  created:
    - lib/estimate/quality/vagueness.ts
    - lib/estimate/graph/state.ts
    - lib/estimate/graph/types.ts
    - lib/estimate/graph/nodes/generate.ts
    - lib/estimate/graph/nodes/assess.ts
    - lib/estimate/graph/nodes/decide.ts
    - lib/estimate/graph/index.ts
  modified:
    - lib/whatsapp/ask-details.ts
decisions:
  - "3-fn adapter surface (ingest/finalize/onError); finalize folds vague-vs-confirm via state.isVague (D-05); Phase 96 splits a dedicated refine edge"
  - "checkInputsEdge in the neutral core routes on state.failure (adapter ingest sets the failure flag for no-usable-input); keeps the precondition channel-neutral"
  - "Edge target names: checkGeneratedEdge -> 'onError'|'assess'; checkVagueEdge -> 'finalizeAsk'|'finalizeConfirm' (exported for Phase 96; index.ts wires assess->finalize directly for the 3-fn surface)"
metrics:
  duration_minutes: 5
  tasks: 3
  files_changed: 8
  completed: 2026-06-20T17:07:49Z
---

# Phase 94 Plan 02: Extract Canonical Channel-Neutral Estimate Core Summary

Behavior-preserving MOVE of the WhatsApp estimate domain logic into a channel-neutral shared core: the deterministic vagueness gate, the canonical `EstimateState`, the `ChannelAdapter` + `StepRunner` contracts, the `generate`/`assess`/`decide` core nodes, and the `buildEstimateGraph(adapter, { runner })` factory — strictly WhatsApp-free (static-grep enforced), never-throwing via failure-as-state, and compiled with no LangGraph checkpointer.

## What Was Built

- **`lib/estimate/quality/vagueness.ts`** — `isVagueEstimate` + `VagueCheckEstimate` moved verbatim from `lib/whatsapp/ask-details.ts` (identical truth table). `ask-details.ts` now re-exports both so the old `@/lib/whatsapp/ask-details` import path stays valid; `ask-details.test.ts` passes with zero assertion changes.
- **`lib/estimate/graph/state.ts`** — `EstimateState = Annotation.Root({...})` with only channel-neutral channels: `companyId`, `projectId`, `channel`, `prompts`, `estimateId`, `estimateLanguage`, `isVague`, `failure`, and `refineAttempts` (Phase 96 scaffold). No `ownerPhone`/`messages`/`currentMessage`/`mediaResults`. Exports `EstimateStateType`.
- **`lib/estimate/graph/types.ts`** — `ChannelAdapter` (3-fn surface: `ingest`/`finalize`/`onError`), `StepRunner` (`run<T>(name, fn)`), and `passthroughRunner` (`run: (_name, fn) => fn()`).
- **`lib/estimate/graph/nodes/generate.ts`** — `makeGenerateNode(runner)`; wraps `generateEstimateForProject` via `runner.run('ai-generate', ...)`; on catch RESOLVES with `failure: { reason: 'generation_failed' }` (never throws — ENGINE-04, generalizes the old `generationFailed`).
- **`lib/estimate/graph/nodes/assess.ts`** — `assessNode`; verbatim port of `evaluateVaguenessNode` (re-reads estimate via `requireServiceClient()`, runs `isVagueEstimate` -> `isVague`).
- **`lib/estimate/graph/nodes/decide.ts`** — `checkGeneratedEdge` (`failure || !estimateId ? 'onError' : 'assess'`) and `checkVagueEdge` (`isVague ? 'finalizeAsk' : 'finalizeConfirm'`).
- **`lib/estimate/graph/index.ts`** — `buildEstimateGraph(adapter, { runner = passthroughRunner } = {})`; composes core nodes + adapter edge nodes into a `StateGraph` and returns a plain `.compile()` (no checkpointer/saver — DURABLE-02).

## Tasks

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | Move isVagueEstimate to quality module + re-export | afa6420 | lib/estimate/quality/vagueness.ts, lib/whatsapp/ask-details.ts |
| 2 | Channel-neutral state + ChannelAdapter/StepRunner contracts | b3d5140 | lib/estimate/graph/state.ts, lib/estimate/graph/types.ts |
| 3 | Core generate/assess/decide nodes + buildEstimateGraph factory | d341b99 | lib/estimate/graph/nodes/{generate,assess,decide}.ts, lib/estimate/graph/index.ts |

## Tests Now Green (target set)

`npx vitest run tests/unit/estimate/{vagueness,step-runner,never-throw,graph-neutrality,no-checkpointer}.test.ts` -> **5 files, 18 tests, all passing.**

- `vagueness.test.ts` — ENGINE-03 truth table at the new path (GREEN)
- `step-runner.test.ts` — passthroughRunner + buildEstimateGraph runner injection (GREEN)
- `never-throw.test.ts` — generate resolves with failure; decide routes failure to terminal (GREEN)
- `graph-neutrality.test.ts` — core files exist, zero WhatsApp tokens (GREEN)
- `no-checkpointer.test.ts` — CHECKPOINTING.md artifact + factory `.compile()` with no saver (GREEN)
- `channel-adapter.test.ts` — ENGINE-02 first test (buildEstimateGraph(adapter) compiles) GREEN; the second test (`@/lib/estimate/adapters/whatsapp` `makeWhatsAppAdapter`) intentionally stays RED until **Plan 94-03** lands the WhatsApp adapter.

Behavior-preserving anchors stay green with no assertion changes: `tests/unit/whatsapp/ask-details.test.ts` and `tests/unit/inngest/whatsapp-process-job.test.ts` (`lib/whatsapp/estimate-graph.ts` untouched this plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed forbidden-token strings from doc comments**
- **Found during:** Task 1 & Task 3 verification.
- **Issue:** Doc-comment prose in `vagueness.ts` literally contained `lib/whatsapp` (3x), `generate.ts` contained `generationFailed`, and `index.ts` contained `checkpointer`/`saver`. The Wave 0 static-grep tests (`graph-neutrality`, `no-checkpointer`) and the plan's acceptance grep assert these tokens are absent — comments count, since the tests do a raw `src.includes(...)` / `not.toMatch(...)`.
- **Fix:** Reworded the comments to describe the same intent without the literal forbidden tokens (e.g. "a single channel module" instead of `lib/whatsapp`; "boolean failure flag" instead of `generationFailed`; "no persistence argument" instead of `checkpointer / saver`). No logic change.
- **Files modified:** lib/estimate/quality/vagueness.ts, lib/estimate/graph/nodes/generate.ts, lib/estimate/graph/index.ts.
- **Commits:** folded into afa6420 / d341b99 (fixed before each task commit).

## Known Stubs

- **`refineAttempts` channel in `state.ts`** — intentionally scaffolded and unused this phase. Per success criterion 1 + Open Question 1 in 94-RESEARCH.md, the field is added now to avoid a state-shape change in Phase 96 (auto-refine). Zero behavior impact. Will be wired in **Phase 96**.

These are intentional, documented scaffolds — not blockers to this plan's goal (extract the channel-neutral core). The WhatsApp adapter that consumes this core lands in **Plan 94-03**.

## Notes for Plan 94-03

- The 3-fn `ChannelAdapter` surface is `ingest`/`finalize`/`onError`. `finalize` must read `state.isVague` to choose ask-details vs confirm. `onError` must read `state.failure?.reason` to pick the generation-failed copy vs the no-input copy (keep both byte-identical to the source `sendErrorNode` for the QA-01 frozen test).
- The adapter's `ingest` owns the `Send` fan-out + `mediaResults` and MUST set `failure` (no-usable-input) so the core `checkInputsEdge` routes to `onError`.
- `makeWhatsAppAdapter({ companyId, supabase, ownerPhone })` (closure-factory) is the remaining RED in `channel-adapter.test.ts`.

## Self-Check: PASSED

All 7 created source files + the SUMMARY exist on disk; all 3 task commits (afa6420, b3d5140, d341b99) exist in git history.
