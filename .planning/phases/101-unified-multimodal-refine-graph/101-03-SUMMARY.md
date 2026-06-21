---
phase: 101-unified-multimodal-refine-graph
plan: 03
subsystem: api
tags: [langgraph, refine, multimodal, openrouter, gemini, fallback, zod, state-graph, estimates]

# Dependency graph
requires:
  - phase: 99
    provides: getAIProviderWithFallback (OpenRouter→Gemini fallback) + ProvidersUnavailableError/InvalidEstimateOutputError markers + failureReasonToXtimatorError
  - phase: 100
    provides: withSchemaRetry (zod validation + bounded schema-retry) inherited via getAIProviderWithFallback
  - phase: 101-00
    provides: Wave-0 RED scaffolds (refine-node, no-checkpointer/buildRefineGraph, refine-route-contract)
  - phase: 101-01
    provides: ingestMultimodal shared raw-media→text path
  - phase: 101-02
    provides: refine-aware buildSystemPrompt({ mode:'refine' }) + buildRefineUserContent + widened RefineEstimateInput (industry/language/projectName)
provides:
  - makeRefineNode(runner) — never-throw refine node via getAIProviderWithFallback
  - buildRefineGraph(adapter, { runner }) — compiled refine sub-graph, no checkpointer, inline passthrough runner
  - makeRefineAdapter — preview finalize (no-op, no DB write) + onError re-throw
  - channel-neutral state fields existingEstimate/instruction/refined
  - thin refine route wrapper invoking the graph with byte-stable { success, refined, instruction } contract
affects: [phase-102-resilience-hardening, phase-103-eval-harness, estimate-editor-refine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated refine sub-graph (START→ingest→refine→finalize|onError→END) invoked INLINE with passthroughRunner — synchronous, non-persisting preview, no Inngest, no checkpointer"
    - "Refine node mirrors generate node's never-throw failure-as-state mapping byte-identically; routes through getAIProviderWithFallback to inherit Phase-99 fallback + Phase-100 zod/retry"
    - "Best-effort builder-context enrichment: company-row + price-book lookup failures fall back to neutral defaults so a preview pass never sinks on enrichment"

key-files:
  created:
    - lib/estimate/graph/nodes/refine.ts
    - lib/estimate/graph/refine-graph.ts
    - lib/estimate/adapters/refine.ts
  modified:
    - lib/estimate/graph/state.ts
    - app/api/estimates/[id]/refine/route.ts
    - tests/unit/estimate/auto-refine-isolation.test.ts

key-decisions:
  - "Refine node resolves company language/industry/currency + price book itself (by companyId), mirroring generate-estimate.ts, so refine feeds the shared prompt builder equivalently — the route only supplies the existing estimate structure"
  - "400 (nothing provided) vs 422 (provided but unusable after assembly) split via an explicit hasRawInput flag — preserves both status codes the editor depends on"
  - "Company-context resolution in the node is best-effort (try/catch → neutral defaults) so an enrichment lookup failure does not sink the refine preview; provider.refineEstimate errors still propagate to the typed failure mapping"

patterns-established:
  - "Refine adapter finalize is a deliberate NO-OP: refine is a preview; the route reads state.refined and returns it; persistence happens later via the editor Save"

requirements-completed: [HARD-01, UNIFY-03]

# Metrics
duration: 13min
completed: 2026-06-21
---

# Phase 101 Plan 03: Refine Through the Canonical Graph Summary

**Refine now runs through a dedicated channel-neutral StateGraph (`buildRefineGraph`) invoked inline with the passthrough runner — audio+image+text ingested via the shared `ingestMultimodal`, the refined preview riding `state.refined` with no DB write, inheriting the Phase-99 OpenRouter→Gemini fallback + Phase-100 zod validation/retry by calling `getAIProviderWithFallback`, while the editor's `{ success, refined, instruction }` contract + 400/422/429/demo-guard status codes stay byte-stable.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-21T14:57Z
- **Completed:** 2026-06-21T15:10Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `makeRefineNode(runner)` — never-throw refine node that calls `getAIProviderWithFallback` (NOT `getAIProvider`), the core bug fix that gives refine the Phase-99 fallback + Phase-100 schema-retry for free; failure mapping byte-identical to `generate.ts`.
- `buildRefineGraph(adapter, { runner })` — compiled refine sub-graph with NO persistence arg (DURABLE-02), both conditional targets in the reachability array; `makeRefineAdapter` mirrors the default adapter (preview finalize no-op + onError re-throw).
- Refine route rewritten as a thin wrapper: every guard + the `estimate_refine_proposed` activity log preserved; inline transcribe/vision/getAIProvider + the storage round-trip removed in favor of `ingestMultimodal` + the graph.
- Three new channel-neutral state fields (`existingEstimate`/`instruction`/`refined`) added without any channel tokens — graph-neutrality stays green.

## Task Commits

Each task was committed atomically:

1. **Task 1: channel-neutral refine state fields + makeRefineNode** - `6e1ee5e` (feat)
2. **Task 2: buildRefineGraph + makeRefineAdapter** - `ffa0219` (feat)
3. **Task 3: route refine through buildRefineGraph** - `6dc0228` (feat)

**Plan metadata:** (this commit — docs: complete plan)

## Files Created/Modified
- `lib/estimate/graph/nodes/refine.ts` (created) - Never-throw refine node via `getAIProviderWithFallback`; resolves company context + price book by companyId; maps provider/validation failures to typed reasons.
- `lib/estimate/graph/refine-graph.ts` (created) - `buildRefineGraph` factory; compiled with no checkpointer; START→ingest→refine→(finalize|onError)→END.
- `lib/estimate/adapters/refine.ts` (created) - `makeRefineAdapter`; channel 'web'; no-op ingest/finalize (preview) + onError re-throw via `failureReasonToXtimatorError`.
- `lib/estimate/graph/state.ts` (modified) - Added neutral `existingEstimate`/`instruction`/`refined` fields (type-only `EstimateOutput` import).
- `app/api/estimates/[id]/refine/route.ts` (modified) - Thin wrapper: `ingestMultimodal` ingestion + `buildRefineGraph` invocation; byte-stable contract; removed inline ingestion + storage round-trip + direct provider call.
- `tests/unit/estimate/auto-refine-isolation.test.ts` (modified) - Cast three Phase-96 full-state literals to `never` (state gained 3 required keys).

## Decisions Made
- Refine node owns company-context resolution (language/industry/currency + price book by companyId), mirroring `generate-estimate.ts`, rather than threading it from the route — strongest UNIFY-02 equivalence; the route only maps the existing estimate structure.
- 400 vs 422 split made explicit via a `hasRawInput` flag so whitespace-only input reaches the 422 "no usable instruction" guard while a truly empty body returns 400 (both editor-facing codes preserved).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cast Phase-96 auto-refine-isolation state literals to `never`**
- **Found during:** Task 1 (state.ts field addition)
- **Issue:** Adding three fields to `Annotation.Root` made the generated `StateType` require `existingEstimate`/`instruction`/`refined`; three Phase-96 test files pass full-state literals to nodes and no longer type-checked (new tsc errors).
- **Fix:** Cast the three `state` arguments at their call sites to `never` (matching the existing `as never` convention in the refine-node test), preserving every assertion.
- **Files modified:** tests/unit/estimate/auto-refine-isolation.test.ts
- **Verification:** tsc no longer reports those errors; auto-refine-isolation suite still passes.
- **Committed in:** `6e1ee5e` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Best-effort company-context + price-book resolution in the refine node**
- **Found during:** Task 3 (route-contract success path)
- **Issue:** The node's hard company-row lookup would throw whenever the service client is unavailable/stubbed, sinking the entire refine pass to `generation_failed` even though `existingEstimate`+`instruction` are the load-bearing inputs.
- **Fix:** Wrapped company-row + price-book resolution in try/catch with neutral defaults (USD, no industry, default language, empty price book). `provider.refineEstimate` errors remain outside the guards so they still map to typed reasons.
- **Files modified:** lib/estimate/graph/nodes/refine.ts
- **Verification:** refine-node + refine-route-contract suites green; success path returns 200 + refined.
- **Committed in:** `6dc0228` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical)
**Impact on plan:** Both essential for correctness; no scope creep. The 422/400 `hasRawInput` split and the storage round-trip removal were explicitly directed by the plan, not deviations.

## Issues Encountered
- **Pre-existing cross-suite worker-reuse leakage** in the full `tests/unit/ai tests/unit/estimate tests/unit/api` sweep (12 timeout failures across `generate-estimate-dispatch`/`name-patch`/`quota`, `jobs-status`, `channel-adapter`, `step-runner`). Proven pre-existing and NOT caused by this plan: each directory passes in isolation (estimate 82/82, ai 63/63); `tests/unit/api` ALONE fails 10/51; base commit `3e0dc1b` fails the same; stashing Task 3 yields 14 failures (more than the 12 with my work). All 101-03-owned tests are GREEN in isolation AND in the cross-suite sweep. Logged in `deferred-items.md` for a future test-harness isolation pass.

## Verification

- Target tests GREEN (in isolation, 33/33 together): `refine-node`, `no-checkpointer` (buildRefineGraph), `refine-route-contract`, `refine-error-surface`, `generate-refine-equivalence`, `graph-neutrality`, `never-throw`, `channel-adapter`.
- `npx tsc --noEmit`: no new errors from this plan's source files; the 9 remaining errors are pre-existing test-file issues (es2018 regex flag, mock typing, Branding shape, xphere — all out of scope).
- Grep contract: refine path uses `getAIProviderWithFallback` (not `getAIProvider`); route invokes `buildRefineGraph` + `makeRefineAdapter` + `ingestMultimodal`; `refine-graph.ts` `.compile()` has no persistence arg; `estimate_refine_proposed` activity log preserved.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HARD-01 + UNIFY-03 complete; Phase 101 (HARD-01/02, UNIFY-01..03) now fully delivered across plans 101-00..03.
- Phase 102 (Resilience Hardening — batch isolation, configurable auto-refine cap, replay-safe TTL) can build on the now-unified refine path.
- Recommended follow-up (non-blocking): a test-harness isolation pass to fix the pre-existing vitest worker-reuse leakage documented in `deferred-items.md`.

## Self-Check: PASSED

- Created files verified on disk: refine.ts (node), refine-graph.ts, adapters/refine.ts, 101-03-SUMMARY.md — all FOUND.
- Task commits verified in git log: 6e1ee5e, ffa0219, 6dc0228 — all FOUND.

---
*Phase: 101-unified-multimodal-refine-graph*
*Completed: 2026-06-21*
