---
phase: 101-unified-multimodal-refine-graph
plan: 02
subsystem: ai
tags: [prompt-builder, refine, prompt-injection, openrouter, gemini, anthropic, sanitizeField]

# Dependency graph
requires:
  - phase: 101-00
    provides: Wave-0 RED contracts (refine-shared-prompt.test.ts, extended prompt-builder.test.ts refine-mode cases, generate-refine-equivalence.test.ts)
  - phase: 99
    provides: shared provider fallback + InvalidEstimateOutputError typed error model the refine adapters inherit
  - phase: 100
    provides: estimateOutputSchema-backed normalizeOutput the refine adapters validate against
provides:
  - "buildSystemPrompt(input, { mode: 'refine' }) — single prompt source serving both generate and refine"
  - "buildRefineUserContent — existing estimate + sanitizeField-escaped, <instruction>-tagged refine instruction"
  - "RefineEstimateInput widened with optional industry/language/projectName (additive) for the 101-03 node to thread company context"
  - "lib/ai/providers/refine-input.ts — single RefineEstimateInput -> EstimateInput mapping shared by all adapters"
  - "openrouter + gemini + anthropic refineEstimate route through the shared builder; bespoke refine prompt deleted from all three"
affects: [101-03, refine-node, refine-graph, refine-route]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode-parameterized shared prompt builder (one function emits Language/PriceBook/Security blocks for generate AND refine)"
    - "Single RefineEstimateInput -> EstimateInput mapping helper reused by every live adapter (no per-adapter drift)"

key-files:
  created:
    - lib/ai/providers/refine-input.ts
  modified:
    - lib/ai/prompt-builder.ts
    - lib/ai/types.ts
    - lib/ai/providers/openrouter.ts
    - lib/ai/providers/gemini.ts
    - lib/ai/providers/anthropic.ts

key-decisions:
  - "Added the <instruction> untrusted-data clause to the Security block UNCONDITIONALLY (shared by both modes) rather than gating to refine — the refine-shared-blocks test requires the Security block byte-identical across modes; the generate regression test is self-relative (no-opts === mode:'generate'), so it still passes and generate gains a harmless extra clause."
  - "Introduced lib/ai/providers/refine-input.ts as the single RefineEstimateInput -> EstimateInput mapping so all three adapters build their builder input one way (DRY; avoids drift the plan's inline-per-adapter approach would risk)."
  - "Aligned lib/ai/providers/anthropic.ts too — it is a live AIProvider returned by getAIProvider() carrying the identical bespoke refine prompt; the plan note authorized aligning it for full all-adapters-share-one-prompt consistency."

patterns-established:
  - "Refine reuses the generate prompt machinery via a mode flag; the only per-mode difference is the opening role/task paragraph."

requirements-completed: [HARD-02, UNIFY-02]

# Metrics
duration: 18min
completed: 2026-06-21
---

# Phase 101 Plan 02: Refine-Aware Shared Prompt Builder Summary

**One refine-aware `buildSystemPrompt({ mode: 'refine' })` + `buildRefineUserContent` now power refine across all three live adapters (OpenRouter/Gemini/Anthropic); the bespoke refine prompt is deleted everywhere, closing the refine prompt-injection hole via `sanitizeField` + `<instruction>` tagging.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-21T14:40:00Z
- **Completed:** 2026-06-21T14:52:00Z
- **Tasks:** 2
- **Files modified:** 5 (4 modified + 1 created)

## Accomplishments
- `buildSystemPrompt` is now mode-parameterized: `{ mode: 'refine' }` swaps ONLY the opening role/task paragraph while the `## Language`, `## Your Company Price Book`, `## Additional Instructions`, and `## Security` blocks run verbatim for both modes (one source of truth — UNIFY-02). No-opts (generate) path is regression-guarded byte-stable.
- New `buildRefineUserContent` emits the existing estimate (JSON) + the refine instruction wrapped in `<instruction>` and escaped via the module-internal `sanitizeField` — closing the injection hole the bespoke adapter prompts left open by interpolating `${input.instruction}` raw.
- `## Security` block now enumerates `<instruction>` tags as untrusted data so the model is told to treat the refine instruction (which carries transcript/vision text) as untrusted.
- All three live adapters (`openrouter`, `gemini`, `anthropic`) deleted their bespoke `## Current Estimate` / `## Refinement Instruction` prompt and route refine through the shared builder; refine gains language, price-book, Additional-Instructions, Security, and sanitization on every provider path.
- `RefineEstimateInput` widened with optional `industry`/`language`/`projectName` (additive, non-breaking) for the 101-03 refine node to thread real company context.

## Task Commits

1. **Task 1: Add refine mode to buildSystemPrompt + buildRefineUserContent** — `d9c4953` (feat)
2. **Task 2: Delete bespoke refine prompt in all adapters; route through shared builder** — `d634ad7` (feat)

## Files Created/Modified
- `lib/ai/prompt-builder.ts` — `buildSystemPrompt` gains `opts?: { mode }`; new exported `buildRefineUserContent`; Security block lists `<instruction>` as untrusted.
- `lib/ai/types.ts` — `RefineEstimateInput` widened with optional `industry`/`language`/`projectName`.
- `lib/ai/providers/refine-input.ts` (NEW) — `toRefineEstimateInput`: single RefineEstimateInput -> EstimateInput mapping shared by all adapters.
- `lib/ai/providers/openrouter.ts` — `refineEstimate` calls shared builder; bespoke prompt deleted; unused `formatMoney`/`normalizeCurrencyCode` imports removed.
- `lib/ai/providers/gemini.ts` — `refineEstimate` calls shared builder; bespoke prompt deleted; fixed a double-`appendRetryHint` (user content already wraps the hint).
- `lib/ai/providers/anthropic.ts` — same alignment (live AIProvider with the identical bespoke prompt).

## Decisions Made
- **Security clause unconditional, not mode-gated.** The `refine REUSES ... Security blocks verbatim` test asserts the Security block is byte-identical between generate and refine, so the `<instruction>` untrusted-data clause must appear in both. The generate-unchanged regression test is self-relative (`buildSystemPrompt(input)` === `buildSystemPrompt(input, { mode: 'generate' })`), so it still passes; generate simply gains a harmless extra enumerated tag it never emits. The plan offered both options and recommended gating "to keep generate byte-stable" but the test contract forced the shared-string choice.
- **Shared mapping helper** (`refine-input.ts`) instead of inlining the RefineEstimateInput -> EstimateInput object in each adapter — three identical copies would drift; one helper is the cleaner UNIFY-02 expression.
- **Aligned anthropic.ts** per the plan note (it is a live `AIProvider` returned by `getAIProvider()` with the same bespoke prompt).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed double retry-hint append on the Gemini/Anthropic refine paths**
- **Found during:** Task 2 (adapter rewrite)
- **Issue:** `buildRefineUserContent` is wrapped in `appendRetryHint(...)` to produce the user content; the Gemini and Anthropic refine methods then re-wrapped that result in `appendRetryHint(userContent, input.retryHint)` at the model-call site, which would have appended the hint twice on a retry.
- **Fix:** Pass the already-hinted `userContent`/`contents` straight to the model call (the openrouter path was already structured to wrap once).
- **Files modified:** lib/ai/providers/gemini.ts, lib/ai/providers/anthropic.ts
- **Verification:** gemini-adapter.test.ts + anthropic-adapter.test.ts green.
- **Committed in:** d634ad7

**2. [Rule 2 - Missing Critical] Aligned lib/ai/providers/anthropic.ts to the shared builder**
- **Found during:** Task 2
- **Issue:** anthropic.ts is a live AIProvider (returned by `getAIProvider()`) carrying the identical bespoke `## Refinement Instruction` prompt — leaving it would mean a provider path that still injects the raw instruction and lacks the Language/Security blocks (silent UNIFY-02 hole, same class as Pitfall 4).
- **Fix:** Routed its `refineEstimate` through the shared builder, identical to openrouter/gemini.
- **Files modified:** lib/ai/providers/anthropic.ts
- **Verification:** anthropic-adapter.test.ts green; `## Refinement Instruction` absent from all three adapter sources.
- **Committed in:** d634ad7

**3. [Rule 3 - Blocking] Introduced lib/ai/providers/refine-input.ts**
- **Found during:** Task 2
- **Issue:** All three adapters need the same RefineEstimateInput -> EstimateInput object to feed the shared builder; inlining three copies invites drift.
- **Fix:** Single `toRefineEstimateInput` helper imported by each adapter.
- **Files modified:** lib/ai/providers/refine-input.ts (new), all three adapters
- **Verification:** tsc clean on all touched source files; refine-shared-prompt + equivalence tests green.
- **Committed in:** d634ad7

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing-critical, 1 blocking)
**Impact on plan:** All within the plan's explicit guidance (anthropic alignment authorized by the plan note; helper is a DRY expression of the plan's inline mapping). No scope creep — only `lib/ai/` files touched; 101-01's and 101-03's files untouched; xphere untouched.

## Issues Encountered

- **Cross-suite test-isolation leakage (worker reuse) — investigated, attributed, deferred.** Running `tests/unit/estimate` + `tests/unit/whatsapp` together fails 4 suites (`channel-adapter`, `step-runner`, `whatsapp/confirm`, `whatsapp/never-reply-regression`). Proven PRE-EXISTING and independent of the refine scaffolds: with ALL refine RED scaffolds excluded AND 101-02 source changes stashed, the same four suites still fail. The 101-01 deferral's attribution (blaming refine-node/equivalence) was incomplete. The plan's stated gate — `tests/unit/ai` + `tests/unit/estimate` together — is **133/133 GREEN** (excluding only the two 101-03-owned RED scaffolds whose target modules do not exist yet); the 101-02 suites do not leak into ai/estimate siblings. All six affected suites pass 26/26 in isolation. Logged to `deferred-items.md` (re-attribution note). The whatsapp combo is out of scope for 101-02 (only `lib/ai/` was touched).

## Verification Results

- `npx vitest run tests/unit/ai` — **63/63 GREEN** (11 files): refine-mode + generate-unchanged regression, refine-shared-prompt (both adapters drop bespoke prompt + call shared builder mode:'refine'), gemini/anthropic adapter suites.
- `npx vitest run tests/unit/ai tests/unit/estimate` (excl. 101-03 RED `refine-node` + `no-checkpointer`) — **133/133 GREEN**; no vi.mock leakage between ai + estimate.
- `npx tsc --noEmit` — clean on all five touched source files (`lib/ai/prompt-builder.ts`, `types.ts`, `providers/{openrouter,gemini,anthropic,refine-input}.ts`). Remaining repo-wide tsc errors are all pre-existing in unrelated test files (es2018 regex flag, Branding type, xphere) — logged in deferred-items.md.
- grep — `## Refinement Instruction` absent from `openrouter.ts`, `gemini.ts`, AND `anthropic.ts`.

## Remaining RED (owned by 101-03 — expected, not a regression)

- `tests/unit/estimate/refine-node.test.ts` — needs `lib/estimate/graph/nodes/refine.ts` (`makeRefineNode`).
- `tests/unit/estimate/no-checkpointer.test.ts` (`buildRefineGraph` cases) — needs `lib/estimate/graph/refine-graph.ts`.
- `tests/unit/api/refine-route-contract.test.ts` — needs the thin refine route wrapper.
Both refine-node and no-checkpointer fail purely on missing-module (`Cannot find package` / `existsSync` false) — genuine RED for the next plan, not mock leakage.

## Next Phase Readiness
- The shared refine prompt source + the widened `RefineEstimateInput` are in place for 101-03's `makeRefineNode` to resolve company language/industry/price-book from `companyId` and thread them through `toRefineEstimateInput` to the builder — the strongest UNIFY-02 equivalence.
- No blockers introduced. xphere files untouched.

## Self-Check: PASSED

---
*Phase: 101-unified-multimodal-refine-graph*
*Completed: 2026-06-21*
