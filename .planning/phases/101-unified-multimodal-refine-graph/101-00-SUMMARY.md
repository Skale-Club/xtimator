---
phase: 101-unified-multimodal-refine-graph
plan: 00
subsystem: testing
tags: [vitest, red-tests, nyquist, refine, multimodal, prompt-builder, langgraph]

# Dependency graph
requires:
  - phase: 99-unified-error-model
    provides: "ProvidersUnavailableError / InvalidEstimateOutputError markers (lib/ai/with-fallback.ts) reused by the refine-node failure-mapping contract"
  - phase: 100-output-guardrails
    provides: "getAIProviderWithFallback schema-retry seam that the refine node inherits"
provides:
  - "Five RED test files + two extensions locking every Phase 101 contract before implementation (Nyquist)"
  - "UNIFY-01 contract: ingestMultimodal aggregation + per-item-skip-not-throw"
  - "UNIFY-03 contract: makeRefineNode never-throw + marker->reason mapping"
  - "HARD-01 contract: refine route response shape + status codes (JSON back-compat path)"
  - "HARD-02/UNIFY-02 contract: shared buildSystemPrompt mode:'refine' + bespoke-prompt deletion + buildRefineUserContent sanitization"
  - "DURABLE-02 (101) contract: buildRefineGraph compiles without a checkpointer"
affects: [101-01, 101-02, 101-03, 102-resilience-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Computed-specifier importTarget (/* @vite-ignore */) keeps RED files collecting cleanly and failing at RUN time"
    - "fs.readFileSync source-grep assertions for deletion-markers + cross-adapter parity (Pitfall 4)"
    - "importActual partial-mock to spy buildSystemPrompt while preserving its real output"

key-files:
  created:
    - tests/unit/estimate/multimodal-ingest.test.ts
    - tests/unit/estimate/refine-node.test.ts
    - tests/unit/estimate/generate-refine-equivalence.test.ts
    - tests/unit/api/refine-route-contract.test.ts
    - tests/unit/ai/refine-shared-prompt.test.ts
  modified:
    - tests/unit/ai/prompt-builder.test.ts
    - tests/unit/estimate/no-checkpointer.test.ts

key-decisions:
  - "Equivalence + shared-prompt deletion assertions target ONLY openrouter.ts + gemini.ts (Phase 101 scope per RESEARCH); anthropic.ts left out of scope despite carrying the same bespoke marker"
  - "Route-contract test drives ONLY the JSON {instruction} back-compat path — multipart Request.formData() hangs in jsdom (matches refine-error-surface.test.ts)"
  - "422 whitespace-only case is RED today (route returns 400); pins the Wave-1/2 restructure where an assembled-but-empty instruction must surface as 'no usable instruction' 422"

patterns-established:
  - "Wave-0 RED scaffold: source-not-yet-existing modules imported via computed specifier; markers/types that already exist imported statically"
  - "Generate-unchanged regression guards (no-opts byte-identical, generate-path mode assertion) ship GREEN alongside the refine RED cases"

requirements-completed: []  # Wave-0 scaffold — requirements HARD-01/02, UNIFY-01/02/03 are MADE-GREEN in Waves 1-2, not here

# Metrics
duration: 18min
completed: 2026-06-21
---

# Phase 101 Plan 00: Wave-0 RED/EXTEND Test Scaffold Summary

**Five new failing test files plus two extensions lock every Phase 101 contract (shared multimodal ingestion, never-throw refine node, refine route response shape, shared refine-mode prompt, no-checkpointer refine graph) before any implementation lands — all RED at RUN time, with generate-path regression guards GREEN.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-21T12:38:00Z
- **Completed:** 2026-06-21T12:43:00Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 extended)

## Accomplishments
- UNIFY-01 RED contract (`multimodal-ingest.test.ts`): `ingestMultimodal` aggregates audio/photo/text, trims/filters texts, and SKIPS a single failed item without throwing — `transcribeAudioOR`/`analyzePhotoOR` mocked.
- UNIFY-03 RED contract (`refine-node.test.ts`): `makeRefineNode` resolves `{ refined }` on success and maps `ProvidersUnavailableError → provider_unavailable`, `InvalidEstimateOutputError → invalid_output`, missing input `→ no_usable_input`, else `→ generation_failed`, never throwing.
- Criterion-5 RED contract (`generate-refine-equivalence.test.ts`): both paths exercise the shared `buildSystemPrompt` (refine with `{ mode: 'refine' }`); bespoke `## Refinement Instruction` deletion asserted in both adapters. Generate-path mode assertion ships GREEN as the regression guard.
- HARD-01 RED contract (`refine-route-contract.test.ts`): success `{ success, refined, instruction }` + 200, and 400/422/429/demo-guard/typed-failure status codes — JSON back-compat path only.
- HARD-02/UNIFY-02 RED contract (`refine-shared-prompt.test.ts` + extended `prompt-builder.test.ts`): no bespoke prompt remains, both adapters call the shared builder with refine mode, refine reuses Language/PriceBook/Security blocks verbatim, generate stays byte-identical, and `buildRefineUserContent` `<instruction>`-tags + escapes the instruction.
- DURABLE-02 (101) RED contract (extended `no-checkpointer.test.ts`): `buildRefineGraph` compiles the StateGraph with no checkpointer/saver.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED tests for shared ingestion + refine node + equivalence** - `ffac9b5` (test)
2. **Task 2: RED route-contract + refine-shared-prompt; extend prompt-builder + no-checkpointer** - `a91d883` (test)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `tests/unit/estimate/multimodal-ingest.test.ts` - UNIFY-01 RED: ingestMultimodal aggregation + per-item-skip
- `tests/unit/estimate/refine-node.test.ts` - UNIFY-03 RED: never-throw refine node + marker->reason mapping
- `tests/unit/estimate/generate-refine-equivalence.test.ts` - Criterion 5 RED: shared buildSystemPrompt seam + bespoke-prompt deletion
- `tests/unit/api/refine-route-contract.test.ts` - HARD-01 RED: route response shape + status codes (JSON path)
- `tests/unit/ai/refine-shared-prompt.test.ts` - HARD-02/UNIFY-02 RED: no bespoke prompt remains; shared builder mode:'refine'
- `tests/unit/ai/prompt-builder.test.ts` - EXTEND: refine-mode block (opening differs, shared-blocks reuse, no-opts regression guard, buildRefineUserContent sanitization)
- `tests/unit/estimate/no-checkpointer.test.ts` - EXTEND: buildRefineGraph compiles without a checkpointer

## RED Test Inventory (Wave 1/2 ownership)

| Test (file > case) | Contract | RED reason today | Made GREEN by |
|---|---|---|---|
| multimodal-ingest.test.ts (all 4) | UNIFY-01 | `@/lib/estimate/ingest/multimodal` does not exist | Wave 1 (101-01) |
| refine-node.test.ts (all 5) | UNIFY-03 | `@/lib/estimate/graph/nodes/refine` does not exist | Wave 2 (101-02) |
| generate-refine-equivalence.test.ts > refine mode:'refine' | criterion 5 / HARD-02 | refine adapter builds bespoke prompt, never passes mode | Wave 1 (101-01) |
| generate-refine-equivalence.test.ts > both deletion cases | criterion 5 | `## Refinement Instruction` still in both adapters | Wave 1 (101-01) |
| refine-shared-prompt.test.ts > 2× deletion + 2× mode:'refine' | HARD-02/UNIFY-02 | bespoke prompt present; no mode arg | Wave 1 (101-01) |
| prompt-builder.test.ts > refine-mode opening differs | HARD-02 | builder has no `mode` param (2nd arg ignored at runtime) | Wave 1 (101-01) |
| prompt-builder.test.ts > buildRefineUserContent sanitization | HARD-02 | `buildRefineUserContent` does not exist | Wave 1 (101-01) |
| refine-route-contract.test.ts > whitespace-only -> 422 | HARD-01 | route returns 400 for trimmed-empty instruction | Wave 1/2 (101-02/03) |
| no-checkpointer.test.ts > buildRefineGraph 2 cases | DURABLE-02 (101) | `lib/estimate/graph/refine-graph.ts` does not exist | Wave 2 (101-02) |

GREEN regression guards shipped here (must stay green): generate-path `buildSystemPrompt` (no refine mode), `buildSystemPrompt` no-opts byte-identical, route success-shape/200, route 400/429/demo-guard, route provider-failure typed `{ error, code }` (Phase 99 asResponse already landed), and all prior prompt-builder + refine-error-surface cases.

## Decisions Made
- Asserted the bespoke-prompt deletion + shared-builder reuse against **openrouter.ts and gemini.ts only** — the two adapters in Phase 101 scope per RESEARCH/CONTEXT. `anthropic.ts` carries the same `## Refinement Instruction` marker but is out of this phase's scope, so it is intentionally not asserted (would force unplanned Wave-1 edits).
- Drove the route-contract test through the **JSON `{ instruction }` back-compat path only**, because `Request.formData()` multipart parsing hangs in vitest/jsdom (documented in refine-error-surface.test.ts:16-21). Multimodal ingestion is covered at the `ingestMultimodal` unit level.
- The provider-failure route case asserts the typed `{ error, code }` envelope is **already GREEN** — Phase 99 landed the route's `asResponse` outer catch. It is retained to pin the contract so Wave 1/2 cannot regress it while moving logic into the graph.

## Deviations from Plan

None - plan executed exactly as written. All seven files authored per the task `<action>` blocks; mocking patterns (computed-specifier importTarget, fs source-grep, importActual spy) follow the repo's established Wave-0 conventions.

## Issues Encountered
None. One nuance worth recording: `buildSystemPrompt(input, { mode: 'refine' })` is type-invalid against the current one-arg signature, but vitest's esbuild transform does not typecheck, so the extra arg is silently ignored at runtime — which is exactly why the refine-opening assertion is RED today (it currently receives the generate prompt). This is the intended RED, not a transform error.

## Pre-existing / Out-of-scope notes
- The xphere integration files (`lib/integrations/xphere/*`, `tests/unit/xphere-client.test.ts`) were NOT touched, staged, or committed (per execution-mode scope boundary).
- No pre-existing unrelated test failures were introduced; the three frozen invariant suites (graph-neutrality, never-throw, never-reply-regression) all pass (11/11).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Every Phase 101 requirement now has a RED automated target. Wave 1 (101-01: shared `ingestMultimodal` + prompt-builder refine mode + bespoke-prompt deletion in both adapters) and Wave 2 (101-02: `makeRefineNode` + `buildRefineGraph`; 101-03: thin route wrapper) implement against these fixed contracts.
- No blockers.

## Self-Check: PASSED

- All 7 test files verified present on disk.
- SUMMARY.md verified present.
- Task commits `ffac9b5` (Task 1) and `a91d883` (Task 2) verified in git history.

---
*Phase: 101-unified-multimodal-refine-graph*
*Completed: 2026-06-21*
