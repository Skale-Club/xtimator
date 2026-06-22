---
phase: 101-unified-multimodal-refine-graph
verified: 2026-06-21T15:22:00Z
status: passed
score: 5/5 must-haves verified
human_verification:
  - test: "Editor refine via text + voice note + photo previews a refined estimate, then Save persists it"
    expected: "Refined preview renders in the editor (marked dirty, not persisted); Save Draft / Consolidate persists identically to before Phase 101"
    why_human: "End-to-end UI flow + DB persistence on Save — not exercisable without a running app + Supabase + real audio/image"
  - test: "Provider-fallback under outage: simulate OpenRouter outage, run a refine"
    expected: "Refine still returns a valid refined preview via the Gemini fallback (Phase 99) with Phase-100 zod validation applied"
    why_human: "Requires live provider outage simulation + real AI calls; unit tests mock the provider seam"
---

# Phase 101: Unified Multimodal + Refine-Through-Graph Verification Report

**Phase Goal:** The refine path stops being a parallel re-implementation — it runs through the same canonical graph (INLINE/synchronous, passthrough StepRunner, NOT Inngest per the 2026-06-21 user decision), shared multimodal ingestion, shared prompt builder, provider fallback (Phase 99), and output validation/guardrails (Phase 100). Requirements HARD-01, HARD-02, UNIFY-01, UNIFY-02, UNIFY-03.

**Verified:** 2026-06-21T15:22:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 (UNIFY-01) | One channel-neutral multimodal ingestion path (audio+image+text) shared by refine + WhatsApp; per-item failure skipped not thrown | ✓ VERIFIED | `lib/estimate/ingest/multimodal.ts:46` `ingestMultimodal` — per-item try/catch skip (lines 50-67), texts trimmed/filtered (69); no `lib/whatsapp/*` import (neutral). WhatsApp `processMessage` routes BOTH transcription (`whatsapp.ts:202`) and vision (`whatsapp.ts:255`) through it; Send[]/mediaResults batch structure unchanged. Route consumes it (`route.ts:169`). |
| 2 (HARD-02/UNIFY-02) | One prompt builder; refine reuses buildSystemPrompt/buildRefineUserContent; bespoke prompt deleted from all providers; generate byte-stable | ✓ VERIFIED | `prompt-builder.ts:48` `buildSystemPrompt(input,{mode})` swaps ONLY opening paragraph (56-62), reuses Language/Price Book/Security verbatim; generate default `mode:'generate'` (52) → byte-identical regression guard GREEN. `buildRefineUserContent` (105) sanitizes instruction inside `<instruction>` (113-115). Security block lists `<instruction>` as untrusted (90). Bespoke `## Refinement Instruction` ABSENT from all 3 providers (grep: no matches). All 3 (openrouter/gemini/anthropic) import + call shared builder with `{mode:'refine'}`. |
| 3 (HARD-01) | Refine runs through the canonical graph INLINE (passthrough runner, NO Inngest, NO checkpointer); route is a thin wrapper; contract byte-stable | ✓ VERIFIED | `refine-graph.ts:33` `buildRefineGraph` START→ingest→refine→(finalize\|onError)→END, `.compile()` with NO persistence arg (47). Route (`route.ts:231-239`) builds adapter + graph + `graph.invoke` inline; no Inngest dispatch. Response `{success,refined,instruction}` (255-259); status 400 (131/141/156), 422 (193), 429 (72), demo-guard (66) preserved; `estimate_refine_proposed` log preserved (243-253). Inline transcribe/vision/getAIProvider REMOVED (grep: only comments remain). |
| 4 (HARD-01/Phase-99/100) | Refine inherits provider fallback + zod validation/retry via getAIProviderWithFallback (NOT getAIProvider); never throws; typed failure mapping | ✓ VERIFIED | `nodes/refine.ts:90` calls `getAIProviderWithFallback` (NOT `getAIProvider` — only appears in a comment at line 17). Never throws: try/catch maps `ProvidersUnavailableError`→`provider_unavailable` (107), `InvalidEstimateOutputError`→`invalid_output` (110), missing input→`no_usable_input` (38), else `generation_failed` (113). Adapter onError re-throws via `failureReasonToXtimatorError` (`adapters/refine.ts:40`). |
| 5 (UNIFY-03) | Refine accepts audio+image+text through the unified path with same fallbacks + validation; channel-neutral state | ✓ VERIFIED | Route ingests all 3 modalities via `ingestMultimodal` (`route.ts:169-178`), assembles single instruction. `state.ts:51-56` neutral `existingEstimate`/`instruction`/`refined` fields (type-only `EstimateOutput` import). graph-neutrality + never-throw invariants GREEN. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/estimate/ingest/multimodal.ts` | ingestMultimodal, per-item skip, channel-neutral | ✓ VERIFIED | 72 lines; exports `ingestMultimodal`/`MultimodalRawInput`/`MultimodalIngestResult`; wired into whatsapp + route |
| `lib/estimate/adapters/whatsapp.ts` | processMessage routes through ingestMultimodal; batch unchanged | ✓ VERIFIED | 459 lines; 2-call-site swap (lines 202, 255); Send[]/mediaResults preserved (Phase 102 boundary intact) |
| `lib/ai/prompt-builder.ts` | mode:'refine'; buildRefineUserContent; Security lists `<instruction>` | ✓ VERIFIED | 162 lines; generate no-opts path byte-identical (regression test GREEN) |
| `lib/ai/providers/openrouter.ts` | bespoke prompt deleted; shared builder | ✓ VERIFIED | 214 lines; imports + uses `buildSystemPrompt({mode:'refine'})` + `buildRefineUserContent` (lines 13,107,109) |
| `lib/ai/providers/gemini.ts` | bespoke prompt deleted; shared builder | ✓ VERIFIED | 247 lines; lines 6,174,176 |
| `lib/ai/providers/anthropic.ts` | bespoke prompt deleted; shared builder | ✓ VERIFIED | 205 lines; lines 6,114,116 |
| `lib/estimate/graph/state.ts` | neutral refined/existingEstimate/instruction | ✓ VERIFIED | 59 lines; lines 51-56; graph-neutrality GREEN |
| `lib/estimate/graph/nodes/refine.ts` | makeRefineNode via getAIProviderWithFallback; never throws; failure mapping | ✓ VERIFIED | 116 lines; exports `makeRefineNode`; line 90 fallback call |
| `lib/estimate/graph/refine-graph.ts` | buildRefineGraph compiled NO checkpointer | ✓ VERIFIED | 48 lines; exports `buildRefineGraph`; `.compile()` no-arg (47); no-checkpointer test GREEN |
| `lib/estimate/adapters/refine.ts` | finalize no-op; onError re-throws | ✓ VERIFIED | 46 lines; exports `makeRefineAdapter`; finalize `{}` (33-35), onError re-throw (39-44) |
| `app/api/estimates/[id]/refine/route.ts` | thin wrapper; contract byte-stable; inline ingestion removed | ✓ VERIFIED | 265 lines; ingestMultimodal + buildRefineGraph inline; no getAIProvider/transcribeRefineAudio remnants |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `nodes/refine.ts` | `provider-with-fallback.ts getAIProviderWithFallback` | refineEstimate (fallback + withSchemaRetry) | ✓ WIRED (line 90, not getAIProvider) |
| `route.ts` | `ingest/multimodal.ts` + `graph/refine-graph.ts` | ingestMultimodal then buildRefineGraph(adapter).invoke | ✓ WIRED (lines 169, 232-233) |
| `adapters/refine.ts onError` | `failure.ts failureReasonToXtimatorError` | re-throw mapped by asResponse | ✓ WIRED (line 40) |
| `refine-graph.ts` | `nodes/refine.ts makeRefineNode` | addNode('refine', makeRefineNode(runner)) | ✓ WIRED (line 39) |
| `providers/{openrouter,gemini,anthropic}.ts refineEstimate` | `prompt-builder.ts buildSystemPrompt({mode:'refine'})` + buildRefineUserContent | shared prompt builder | ✓ WIRED (all 3) |
| `whatsapp.ts processMessage` | `ingestMultimodal` | 2-call-site swap | ✓ WIRED (lines 202, 255) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `route.ts` response `refined` | `result.refined` | `graph.invoke(...)` → `makeRefineNode` → `provider.refineEstimate` (real AI via fallback seam) | Yes (validated EstimateOutput from provider) | ✓ FLOWING |
| `route.ts` `instruction` | assembled from `ingest.{texts,transcripts,photoDescriptions}` | `ingestMultimodal` → `transcribeAudioOR`/`analyzePhotoOR` (Phase-99 fallback-wrapped) | Yes (no static/empty return; 422 guard if genuinely empty) | ✓ FLOWING |
| `refine.ts` `priceBookItems`/`currencyCode`/`industry`/`language` | company row + `getPriceBookItems` | `requireServiceClient` DB query by companyId | Yes (best-effort enrichment; neutral defaults on lookup failure) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 5 Phase-101 contract suites | `vitest run multimodal-ingest refine-node generate-refine-equivalence refine-route-contract refine-shared-prompt` | 5 files / 25 tests passed | ✓ PASS |
| Estimate suite in isolation | `vitest run tests/unit/estimate` | 16 files / 82 passed | ✓ PASS |
| AI suite in isolation | `vitest run tests/unit/ai` | 11 files / 63 passed | ✓ PASS |
| Invariants | `vitest run graph-neutrality no-checkpointer never-throw` | 3 files / 15 passed | ✓ PASS |
| Generate byte-stability + refine error-surface | `vitest run prompt-builder refine-error-surface` | 2 files / 14 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| HARD-01 | 101-00, 101-03 | Refine through canonical graph reusing shared engine, inline | ✓ SATISFIED | buildRefineGraph invoked inline from route; REQUIREMENTS.md line 29 `[x]` + traceability "Complete" |
| HARD-02 | 101-00, 101-02 | Refine reuses single prompt source; no bespoke prompt | ✓ SATISFIED | All 3 providers use shared builder; bespoke marker deleted; REQUIREMENTS.md line 30 `[x]` |
| UNIFY-01 | 101-00, 101-01 | One multimodal ingestion path | ✓ SATISFIED | ingestMultimodal shared by refine + WhatsApp; REQUIREMENTS.md line 46 `[x]` |
| UNIFY-02 | 101-00, 101-02 | One prompt builder, equivalent prompts | ✓ SATISFIED | mode-aware builder; equivalence test GREEN; REQUIREMENTS.md line 47 `[x]` |
| UNIFY-03 | 101-00, 101-03 | Refine accepts audio+image+text via unified path, same fallbacks+validation | ✓ SATISFIED | Route ingests 3 modalities → graph via fallback provider; REQUIREMENTS.md line 48 `[x]` |

No orphaned requirements — all five declared in plan frontmatter and all marked Complete in REQUIREMENTS.md traceability table (lines 85-89).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No blocker/warning anti-patterns | — | finalize `{}` no-op and `ingest` `{}` no-op in `adapters/refine.ts` are INTENTIONAL (preview, no DB write) and documented; not stubs |

### Test-Harness Isolation Concern (pre-existing, NOT a Phase-101 regression)

Running `tests/unit/ai + tests/unit/estimate + tests/unit/api` together yields 12 timeout failures across 6 files: `channel-adapter`, `step-runner`, `generate-estimate-dispatch`, `generate-estimate-name-patch`, `generate-estimate-quota`, `jobs-status`.

**Assessed as genuinely pre-existing — NOT attributable to Phase 101:**
1. Each directory passes in isolation (estimate 82/82, ai 63/63) — independently reproduced this verification run.
2. The full Phase-101 diff (`git diff 1e672ef..HEAD`) touches NONE of the failing test files' production targets (`lib/estimate/graph/index.ts` buildEstimateGraph, the generate dispatch route, the jobs proxy were all untouched).
3. The one Phase-101 file showing a failing case in the combined run (`generate-refine-equivalence`) passes 100% in isolation — classic vitest worker-reuse / `vi.mock` cross-suite registry leakage, not a code defect.
4. `deferred-items.md` documents independent executor proof: base commit `3e0dc1b` reproduces the same pattern, and stashing 101-03 yields 14 failures (MORE, not fewer) — Phase-101 work slightly reduces the count by turning RED scaffolds GREEN.

All failures are uniform 5000ms timeouts — the signature of jsdom/Inngest module-mock bleed under worker reuse. **Recommendation:** Phase 103 (EVAL — CI regression gate) should own the fix (add `vi.resetModules()`/`vi.restoreAllMocks()` to the first-leaking suite, or set `poolOptions.isolate`/`pool:'forks'` in `vitest.config.ts`). This is a harness artifact, not a product regression.

### Human Verification Required

Two items require a running app + real provider/media (see frontmatter). Both are end-to-end concerns the unit layer mocks, so they do not block the automated goal verdict — flagged for completeness, not as gaps.

### Gaps Summary

No gaps. All 5 observable truths verified against actual source (not SUMMARY claims). All 11 artifacts exist, are substantive, wired, and carry real data flow. All 6 key links wired. All 5 requirements satisfied and marked Complete in traceability. The single open item is a pre-existing test-harness isolation artifact, confirmed independent of Phase-101 production changes and routed to Phase 103.

---

_Verified: 2026-06-21T15:22:00Z_
_Verifier: Claude (gsd-verifier)_
