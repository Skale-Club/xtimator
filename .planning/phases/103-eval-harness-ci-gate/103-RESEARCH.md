# Phase 103: Eval/Test Harness + CI Regression Gate - Research

**Researched:** 2026-06-21
**Domain:** Vitest test-isolation, deterministic AI-provider mocking, golden-fixture eval harness, GitHub Actions CI gate
**Confidence:** HIGH (root cause reproduced and bisected empirically; all seams read from source; CI conventions read from the live workflow)

## Summary

Phase 103 has two halves. The **prerequisite half** is fixing a vitest cross-file test-isolation leak so the suite is deterministic-green; the **eval half** (EVAL-01..04) builds a golden-fixture harness, deterministic mocked providers, a reused-primitive metrics suite, and a CI gate. The eval half is straightforward and low-risk; the isolation half is the linchpin and was the focus of this research.

I reproduced the leak and bisected it. **The leak is real, non-deterministic (flaky), and BROADER than CONTEXT.md assumed.** CONTEXT describes "~11 failures" from the scoped run `vitest run tests/unit/estimate tests/unit/whatsapp`. I confirmed that scoped run fails — but the failure COUNT varies run-to-run (9, then 10), and the **full default `npx vitest run` (what `npm test` runs) currently fails 20–21 files / 34 tests, also non-deterministically** (21 then 20 files across two back-to-back runs). The whatsapp-dir-alone run is consistently green (208 passed, x3). So the failures only appear when files from different directories share a worker process — classic worker-reuse state contamination, not a logic bug. No production code is broken; every failing file passes in some isolation context.

**Root cause (HIGH confidence, bisected):** ~12 whatsapp test files (and several estimate/api/billing/component files) follow the pattern `const spy = vi.fn(); vi.mock('@/lib/...', () => ({ fn: (...a) => spy(...a) }))`, where `spy` is **module-scope mutable state**. The REAL consumer modules (`lib/estimate/adapters/whatsapp.ts`, `lib/services/generate-estimate.ts`) import those mocked symbols once and cache the binding inside a worker. Vitest 4's default `pool: 'forks'` reuses worker processes and collects multiple files into one worker; `vi.clearAllMocks()` in file B's `beforeEach` clears file B's spy object, but the real consumer module that file A loaded still references **file A's** module-scope spy — which is never cleared, so its call count (`sendWhatsAppMessage`, `sessionInserts`, `generateEstimateForProject`) accumulates across files. Whether two contaminating files land in the same worker depends on scheduling → flaky counts. I verified `--isolate`, `pool: 'forks'`, and the config flags `clearMocks`/`mockReset`/`restoreMocks` do **NOT** fix it (some make it worse, 32 failures). The fix is at the test-file authoring level, validated by a determinism gate, not a one-line config toggle.

**Primary recommendation:** Treat the isolation fix as its own wave (Wave 1), de-risked and merged GREEN before the eval harness lands. Fix = standardize teardown across all contaminating files (`vi.resetModules()` in `afterEach` consistently, plus a shared mock-reset helper that clears the module-scope spies), then add a **determinism gate** (run the full suite 2–3× in CI and require identical green) so a future leak can't silently return. Build the eval harness by mocking at the provider seam (`getAIProviderWithFallback` + `transcribeAudioOR`/`analyzePhotoOR`) so the REAL graph + Phase-100 guardrails run. Scope the CI typecheck to app/lib (`tsc` is already RED with 9 pre-existing **test-file-only** errors — a full-repo gate would be useless).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test-isolation fix (prerequisite for EVAL-04):**
- Recurring cross-file leak: `vitest run tests/unit/estimate tests/unit/whatsapp` yields failures (e.g. `never-reply-regression` Path B sees 2 replies instead of 1) because files sharing the mock accumulate module-level spy/call-count state across files. Every file passes in isolation.
- `vitest.config.ts` today sets NO `clearMocks`/`mockReset`/`restoreMocks` and no explicit `pool`/`isolate`. Researcher picks the minimal robust fix. **Goal: `npx vitest run` (full suite) is GREEN and deterministic regardless of file order.**
- Do NOT mask the leak by sharding the run — fix the isolation so the whole suite is reliable.

**EVAL-01 — golden multimodal fixtures:** Model fixtures at the POST-INGESTION boundary + a few raw small samples. `tests/fixtures/estimates/` (or `tests/eval/fixtures/`) dataset, each case: `{ id, inputs: { transcripts[], photoDescriptions[], texts[] }, providerResponse: <estimate tool JSON>, expected: <quality thresholds> }`. Cover three modalities (audio-derived transcript, photo-description, text) + mixed + a deliberately-vague case. Store as typed TS/JSON fixtures, referenced deterministically (no network). Optionally 1–2 tiny real audio/image binaries to exercise `ingestMultimodal` with a mocked provider.

**EVAL-02 — deterministic mocked providers:** A reusable mock layer (e.g. `tests/eval/mock-providers.ts`): a mock `AIProvider` (`generateEstimate`/`refineEstimate`) + mock `transcribeAudioOR`/`analyzePhotoOR` returning fixture-driven deterministic outputs keyed by input. Wire via `vi.mock` so the REAL engine (shared graph + `generateEstimateForProject` + refine sub-graph + Phase-100 normalize/schema/guardrails) runs against them. Mocks deterministic + reset per test. Reuse Phase-99/100 seams so the mock providers feed through `normalizeOutput`/`estimateOutputSchema`.

**EVAL-03 — quality-metrics suite:** A metrics module scoring an estimate on: non-zero/positive grand total, minimum line-item count, vagueness verdict (REUSE `lib/estimate/quality/vagueness.ts:isVagueEstimate`), zod-schema validity (REUSE `lib/ai/schema.ts:estimateOutputSchema`). Each golden case asserts its `expected` thresholds. Suite reports per-case pass/fail + aggregate. Prefer reusing existing quality primitives.

**EVAL-04 — CI regression gate:** No CI job runs `npm test` today. Add a GitHub Actions workflow (`.github/workflows/test.yml` or an `eval` job): on push/PR, install deps, run `npx tsc --noEmit` (typecheck) + `npx vitest run` (full unit suite incl. eval harness). FAIL the build on any regression. Run green only AFTER the isolation fix. Keep it lean; align with `.github/workflows/build-deploy.yml`. No secrets (mocked providers, no live AI keys). Respect deploy memory: this is a TEST gate, not a deploy change. Add `npm run test:eval` for local iteration.

**Invariants to preserve:** Full unit suite stays GREEN and deterministic after the isolation fix — no test deleted to make the gate pass. No production behavior change (metrics module may live in lib/ but must be test/observability-only, NOT in the generation hot path). No secrets in fixtures or CI. Multi-tenant / server-only conventions unchanged.

### Claude's Discretion
- Pick the minimal robust isolation fix (config flags vs shared mock-reset helper vs `vi.resetModules()` discipline vs pool config). Diagnose the ACTUAL root cause first.
- Fixture storage location (`tests/fixtures/estimates/` vs `tests/eval/fixtures/`).
- Metrics module location (`lib/estimate/quality/metrics.ts` vs `tests/eval/metrics.ts`).
- Exact CI workflow filename and job shape.
- Whether `tsc --noEmit` is in-gate and how to scope it.

### Deferred Ideas (OUT OF SCOPE)
- LLM-as-judge qualitative scoring (EVAL-05).
- Live-provider smoke tests in CI (real OpenRouter/Gemini calls).
- Perf/load benchmarking of the engine.
- Full E2E (Playwright) in the regression gate — the e2e suite stays separate.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-01 | Golden-fixture dataset for audio/photo/text inputs, deterministic, no live AI | Fixture schema + 6 representative cases defined below (`## EVAL-01`). Store under `tests/eval/fixtures/`. |
| EVAL-02 | Deterministic mocked providers let the full engine run with stable outputs | Seam map below (`## EVAL-02`): `vi.mock` `getAIProviderWithFallback` (generate/refine) + `transcribeAudioOR`/`analyzePhotoOR`; keep `generateEstimateForProject` + graph REAL, with a chainable-Supabase mock for persistence. |
| EVAL-03 | Quality-metrics suite (total, item count, vagueness, schema validity) asserts thresholds | Metrics design below (`## EVAL-03`) reusing `isVagueEstimate` + `estimateOutputSchema`; per-case assertions + aggregate. |
| EVAL-04 | CI regression gate fails build on metric/schema/behavior regression | Workflow spec below (`## EVAL-04 + CI`) mirroring `build-deploy.yml`; scoped `tsc`; determinism gate. Blocked until the isolation fix lands GREEN. |
| (prereq) | Test-harness isolation remediation | Root cause diagnosed + bisected below (`## Isolation Leak: Diagnosis`); fix + determinism gate specified. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GSD workflow:** all file changes go through a GSD command. (Planner already inside `/gsd:plan-phase`.)
- **Secrets:** NEVER commit secrets — including in `.planning/`, fixtures, CI YAML. Use placeholders (`sk-ant-<...>`, `sk-proj-<...>`). The eval harness uses mocked providers → **CI needs ZERO AI keys.** gitleaks pre-commit blocks `sk-ant-*`, `sk-proj-*`, etc. Fixtures must contain only synthetic estimate JSON, no real keys/PII.
- **Deploy memory:** images build in GitHub Actions → GHCR → Coolify pulls; **never build on the VPS.** This phase adds a TEST workflow only — it must NOT touch `build-deploy.yml` and must NOT run `next build`.
- **Tech stack:** Next.js 16 / React 19 / TypeScript strict / zod 4. Tests run on vitest 4.1.4 + jsdom.
- **Server-only:** `vitest.config.ts` aliases `server-only` to its empty stub; server modules are exercised in isolation. Keep this — the eval harness imports server modules (`generate-estimate`, graph).

## Isolation Leak: Diagnosis (PREREQUISITE — the linchpin)

### What I reproduced (empirical, not theory)

| Run | Result | Notes |
|-----|--------|-------|
| `tests/unit/whatsapp/never-reply-regression.test.ts` alone | PASS (3/3) | every file passes alone |
| `tests/unit/whatsapp` (full dir) alone, x3 | PASS (208/208) every time | dir-alone is deterministic-green |
| `tests/unit/estimate tests/unit/whatsapp` (scoped, CONTEXT's repro) run #1 | **9 failed** | flaky count |
| same scoped run #2 | **10 failed** | **count differs → non-deterministic** |
| `npx vitest run` (FULL default) run #1 | **21 files / ~34 tests failed** | far broader than CONTEXT's "11" |
| `npx vitest run` (FULL default) run #2 | **20 files failed** | **count differs → flaky** |

The canonical failing assertion is `expected "vi.fn()" to be called 1 times, but got 2 times` (e.g. `never-reply-regression.test.ts:181` `sendWhatsAppMessage`; `replay-safe-ttl.test.ts:203` `sessionInserts.length` is 2 not 1). The extra call is a **prior file's invocation leaking forward**.

### The leaking state (named)

Every contaminating file declares **module-scope mutable spies/arrays** and wires the real module to them:

```ts
// tests/unit/whatsapp/never-reply-regression.test.ts (and ~11 siblings)
const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined)        // <-- module-scope
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...args) => sendWhatsAppMessage(...args),       // arrow indirection
}))
const generateEstimateForProject = vi.fn()                              // <-- module-scope
vi.mock('@/lib/services/generate-estimate', () => ({ generateEstimateForProject: (...a) => generateEstimateForProject(...a) }))
// replay-safe-ttl.test.ts additionally:
const sessionInserts: Array<Record<string, unknown>> = []              // <-- module-scope ARRAY
```

The REAL consumer is `lib/estimate/adapters/whatsapp.ts`, which does `import { sendWhatsAppMessage } from '@/lib/whatsapp/client'` ONCE. The graph (`buildEstimateGraph` → `makeWhatsAppAdapter`) runs that real code. When two files that both `vi.mock('@/lib/whatsapp/client')` are collected into the **same worker process**, vitest's hoisted `vi.mock` registry binds the real adapter to **one file's** factory closure (→ that file's module-scope `sendWhatsAppMessage` spy). The OTHER file's `beforeEach(() => vi.clearAllMocks())` clears ITS OWN spy object — not the one the adapter is actually calling. So the bound spy's call count carries forward across `it`s in different files → `got 2 times`.

### Why it's flaky (the killer for a CI gate)

Vitest 4 default `pool: 'forks'` reuses a small pool of worker processes and assigns files to them by a scheduling heuristic. Whether two contaminating files share a worker (and in what order) varies run-to-run → the failure set and count vary (9 vs 10, 20 vs 21). **A naive `npx vitest run` CI gate on today's suite would be red-sometimes, green-sometimes — worthless as a regression gate.** This is exactly why EVAL-04 is blocked on the fix.

### What does NOT fix it (verified — do not waste a plan on these)

| Attempt | Result |
|---------|--------|
| `clearMocks: true` + `mockReset: true` + `restoreMocks: true` in config | **WORSE — 32 failed** (resets module-scope `.mockResolvedValue(...)` defaults to `undefined`, breaking files that rely on a default impl) |
| `restoreMocks: true` alone | WORSE (7 failed in whatsapp dir vs 6) |
| `pool: 'forks'` + `isolate: true` (explicit) | NO CHANGE (still 11 scoped / 20–21 full) |
| `--isolate` flag | NO CHANGE — registry reset per file does NOT clear the *other file's* module-scope spy object |
| `--no-file-parallelism` (single worker, sequential) | Fixes the whatsapp dir (208 green) but EXPOSES a DIFFERENT 10-file set (api/billing/capture/components/landing) → trades one leak for another. Also slow. **Rejected: masking, not fixing.** |
| Removing `vi.resetModules()` from the 2 files that have it | NO CHANGE (still 6) |

**Conclusion:** there is NO single config flag. The fix is at the test-file authoring level + a determinism gate.

### The fix (recommended, minimal-robust)

Two complementary moves; do both:

1. **Standardize teardown in every contaminating file.** For each file using the `const spy = vi.fn()` + `vi.mock(realPath)` + real-consumer pattern, add a consistent `afterEach`:
   ```ts
   afterEach(() => {
     vi.clearAllMocks()   // resets call counts on the module-scope spies
     vi.resetModules()    // drops the cached real-consumer binding so the next file rebinds to ITS OWN mocks
   })
   ```
   `vi.resetModules()` is the load-bearing line: it evicts the cached real module (the adapter / service) from the worker registry so the next file's `await import('@/lib/whatsapp/estimate-graph')` re-imports it fresh against the next file's hoisted mocks. Combined with the `await import(...)` already used in `invoke()` helpers (lazy import inside the test), this makes each file bind to its own spies.

   **Files confirmed needing it (whatsapp dir, mock `@/lib/whatsapp/client`):** `never-reply-regression`, `confirm`, `intent-router`, `welcome-first-contact`, `webhook-route`, `normalize`, `handler-intent-routing`, `handler`, `handler-inngest-dispatch`, `cleanup-sessions-cron` (10 lack consistent `resetModules`); `batch-reporting` + `replay-safe-ttl` already have it. **Plus the full-suite contaminators** surfaced in the default run: `tests/unit/api/generate-estimate-*`, `tests/unit/api/jobs-status`, `tests/unit/services/generate-estimate`, `tests/unit/inngest/generate-estimate-job`, `tests/unit/estimate/{auto-refine-isolation,channel-adapter,generate-refine-equivalence,step-runner}`, `tests/unit/billing/stripe-webhook`, `tests/unit/capture/capture-attempt-lineage`, `tests/unit/components/{onboarding-survey,theme-toggle}`, `tests/unit/landing-actions`, `tests/unit/phase83-server-action-sweep`. (Wave 1 must enumerate the actual contaminating set by running the suite and bisecting; do NOT assume only whatsapp.)

2. **Add a determinism gate** (Wave 1 acceptance + permanent CI step): run the full suite **2–3 times back-to-back** and require **identical green** each time. A single green run is insufficient given the flakiness — only repeated-green proves the leak is gone:
   ```bash
   npx vitest run && npx vitest run && npx vitest run   # all three must be green
   ```

**Alternative considered (LOW preference):** Migrate the module-scope-spy pattern to `vi.hoisted(() => ({ spy: vi.fn() }))` and reference via `mocks.spy`, which makes the binding explicit and lets `vi.clearAllMocks()` reach it. This is the "textbook clean" fix but touches ~20 files invasively. The `resetModules()` discipline (move 1) is lower-churn and was the pattern the 2 already-correct files used.

### Confidence the fix makes the full suite deterministic-green

**MEDIUM-HIGH.** `vi.resetModules()` directly addresses the named mechanism (cached real-consumer binding), and the 2 files that already use it are not the *source* of their own leak. The risk: the full-suite contaminators include component tests (`theme-toggle`, `onboarding-survey`) that fail via a slightly different mechanism (mock-hoisting of `next-themes` returning stale values even when run ALONE — see Pitfall 4). Those may need a per-file `vi.resetModules()` in `beforeEach` (not just afterEach) or a `vi.doMock`/explicit re-import. **Wave 1 MUST end with the 3× determinism gate GREEN before the eval harness is built** — this is the empirical proof, and the planner should treat "3× green" as the wave's exit criterion, iterating file-by-file until met.

## EVAL-02: Mocked-Provider Injection (do this design first — the harness depends on it)

### The seam map (mock these, keep everything else REAL)

The engine call chain the harness must exercise:

```
buildEstimateGraph(adapter)            [lib/estimate/graph/index.ts]        REAL
  → ingest (adapter)                   [lib/estimate/adapters/whatsapp.ts]  REAL graph node
      → ingestMultimodal               [lib/estimate/ingest/multimodal.ts]  REAL
          → transcribeAudioOR / analyzePhotoOR  [lib/ai/openrouter-client]  ◄── MOCK (audio/photo)
  → generate (makeGenerateNode)        [lib/estimate/graph/nodes/generate]  REAL
      → generateEstimateForProject     [lib/services/generate-estimate.ts]  REAL (DB-bound)
          → getAIProviderWithFallback  [lib/ai/provider-with-fallback.ts]   ◄── MOCK (generate/refine)
              → normalizeOutput / estimateOutputSchema  [lib/ai/*]          REAL (Phase-100 guardrails)
          → anchorAndClampSections, totals math, persistence                REAL
  → assess (assessNode)                [lib/estimate/graph/nodes/assess]    REAL → isVagueEstimate
  → autoRefine (cap=1) / finalize / onError                                 REAL
```

**Recommended approach — mock at the PROVIDER seam, not the service seam.** Mock exactly two module paths:

1. `vi.mock('@/lib/ai/provider-with-fallback', ...)` → `getAIProviderWithFallback` returns a deterministic `AIProvider` whose `generateEstimate(input)`/`refineEstimate(input)` return the fixture's `providerResponse` (a raw estimate-tool JSON object). This keeps `generateEstimateForProject` REAL → the Phase-100 normalize/schema, GUARD-02 anchoring, GUARD-03 totals math, version/persist logic all run.
2. `vi.mock('@/lib/ai/openrouter-client', ...)` → `transcribeAudioOR`/`analyzePhotoOR` return the fixture's transcript/description strings (only needed for cases that exercise `ingestMultimodal` from raw binaries; the post-ingestion cases can skip this).

**Why provider seam, not `generateEstimateForProject`:** Mocking `generateEstimateForProject` (as the whatsapp regression tests do) bypasses ALL the Phase-99/100 guardrails — exactly what EVAL must validate. The provider seam runs `normalizeOutput(estimateOutputSchema.safeParse(...))`, anchoring, and totals, so a regression in those is caught.

**Important nuance — provider returns `EstimateOutput`, schema runs INSIDE the adapter, not the provider boundary.** Read `provider-with-fallback.ts`: `withSchemaRetry` + `callWithFallback` validate inside the OpenRouter/Gemini adapters (`lib/ai/with-fallback.ts`), and `getAIProviderWithFallback` returns an already-`EstimateOutput`-typed result. So to genuinely test schema validity through the engine, the harness should ALSO run the fixture's `providerResponse` through `estimateOutputSchema`/`normalizeOutput` directly in the metrics layer (EVAL-03) — that is the authoritative schema-validity metric. Mocking at `getAIProviderWithFallback` means the harness supplies a *valid* `EstimateOutput`; the schema-validity metric is asserted by the metrics module against the raw fixture JSON, which is the right place (it catches a fixture that drifts AND documents the contract).

**Persistence:** `generateEstimateForProject` is heavily Supabase-bound (projects/companies/price_book reads; estimates/sections/items writes; `revalidatePath`). The harness needs a **chainable-Supabase service mock** (`vi.mock('@/lib/supabase/service')`) returning fixture-shaped rows — reuse the existing chainable pattern from `tests/unit/whatsapp/*` and `tests/unit/services/generate-estimate.test.ts`. Also mock `next/cache` `revalidatePath` (no-op). This is the bulk of the harness wiring effort.

**Determinism + reset:** because the harness itself uses module-scope mocks, it MUST follow the Wave-1 isolation discipline (`afterEach(() => { vi.clearAllMocks(); vi.resetModules() })`, lazy `await import` of the graph inside the per-case runner). Otherwise the eval files become new contaminators.

### Alternative (simpler, less coverage) — score the pure service in isolation
If full-graph wiring proves too DB-heavy, a fallback is to call `generateEstimateForProject` directly (provider + supabase mocked) per fixture and score the persisted estimate. This still exercises Phase-100 guardrails + totals but skips the graph topology (ingest/assess/autoRefine/finalize). **Recommended only if the graph wiring blows the time budget;** the full-graph approach is preferred per CONTEXT ("exercise the actual code paths").

## EVAL-01: Golden-Fixture Schema + Cases

### Storage location (recommendation)
`tests/eval/` (new dir): `tests/eval/fixtures/*.ts`, `tests/eval/mock-providers.ts`, `tests/eval/metrics.ts`, `tests/eval/harness.test.ts`. Rationale: keeps the eval harness self-contained and lets `test:eval` scope to `tests/eval/**`. `tests/fixtures/` today holds cross-cutting fixtures (price-book CSV, encryption key, stripe) — leave those; the estimate golden dataset is eval-specific.

### Fixture schema (typed TS)
```ts
// tests/eval/fixtures/types.ts
import type { EstimateOutput } from '@/lib/ai/schema'

export interface EvalCase {
  id: string
  modality: 'audio' | 'photo' | 'text' | 'mixed'
  description: string
  inputs: {
    transcripts?: string[]        // audio-derived (post-Whisper)
    photoDescriptions?: string[]  // vision-derived (post-analyzePhotoOR)
    texts?: string[]              // raw text / prompts
  }
  /** The raw create_estimate tool JSON the mocked provider returns (pre-normalize). */
  providerResponse: Record<string, unknown>  // intentionally loose → schema metric validates it
  expected: {
    schemaValid: boolean          // estimateOutputSchema.safeParse succeeds
    minLineItems: number          // >= N items across sections
    positiveTotal: boolean        // server grandTotal > 0
    isVague: boolean              // isVagueEstimate verdict
  }
}
```
Store cases as plain typed arrays (`export const CASES: EvalCase[] = [...]`) — no JSON-import indirection needed, and types catch drift. Synthetic data only (no real PII/keys → gitleaks-safe).

### The 6 representative cases
| id | modality | inputs | providerResponse shape | expected |
|----|----------|--------|------------------------|----------|
| `audio-deck-rebuild` | audio | 1 transcript ("rebuild 200 sqft deck, pressure-treated...") | 2 sections, ~6 items, total > 0 | schemaValid, minLineItems 4, positiveTotal, isVague false |
| `photo-roof-repair` | photo | 1 photoDescription ("missing shingles, flashing damage...") | 1–2 sections, ~4 items | schemaValid, minLineItems 3, positiveTotal, isVague false |
| `text-fence-paint` | text | 1 text ("paint 80ft cedar fence two coats") | 1 section, ~3 items | schemaValid, minLineItems 2, positiveTotal, isVague false |
| `mixed-kitchen-reno` | mixed | transcript + photoDescription + text | 3 sections, ~10 items | schemaValid, minLineItems 6, positiveTotal, isVague false |
| `vague-do-some-work` | text | 1 text ("do some work when you can") | empty sections / total 0 (provider returns a thin estimate) | minLineItems 0, positiveTotal **false**, **isVague true** (exercises vagueness gate + autoRefine cap=1) |
| `schema-drift-guard` | text | 1 text | providerResponse with a malformed field (e.g. `unit_price: "ten"`) | **schemaValid false** (asserts the schema metric actually fails on bad output; this case asserts the METRIC, not the engine — keep it as a metrics-unit case, not a full-graph run) |

Cases 1–5 run through the full graph; case 6 is a metrics-unit assertion that `estimateOutputSchema.safeParse` rejects drift (proves the metric has teeth). Optionally add 1 tiny synthetic audio/image binary fixture to exercise `ingestMultimodal` end-to-end with mocked `transcribeAudioOR`/`analyzePhotoOR` (CONTEXT "optionally" — keep to 1 to limit binary churn).

## EVAL-03: Quality-Metrics Design (reuse production primitives)

### Metrics module location (recommendation)
`tests/eval/metrics.ts` — keep it OUT of `lib/`. CONTEXT allows `lib/estimate/quality/metrics.ts` but warns it must be test/observability-only and NOT in the hot path. Putting it in `tests/eval/` guarantees it can never be imported by production code (and avoids a tree-shaking/bundle concern). It REUSES the production primitives, which is what makes "regression" mean the same in tests and prod.

### The four metrics (reusing existing primitives)
```ts
// tests/eval/metrics.ts
import { estimateOutputSchema } from '@/lib/ai/schema'        // REUSE (GUARD-01)
import { isVagueEstimate } from '@/lib/estimate/quality/vagueness'  // REUSE (Phase 96)

export interface MetricResult { schemaValid: boolean; lineItemCount: number; grandTotal: number; isVague: boolean }

export function scoreProviderResponse(raw: Record<string, unknown>): { schemaValid: boolean } {
  return { schemaValid: estimateOutputSchema.safeParse(raw).success }  // authoritative schema gate
}

export function scorePersistedEstimate(est: { total: number | null; sections: Array<{ items?: unknown[] | null }> | null }): MetricResult {
  const lineItemCount = (est.sections ?? []).reduce((n, s) => n + (s.items?.length ?? 0), 0)
  return {
    schemaValid: true, // n/a here; provider-response variant covers schema
    lineItemCount,
    grandTotal: est.total ?? 0,
    isVague: isVagueEstimate(est as never),  // REUSE — same gate as production assess node
  }
}
```
- **Schema validity** = `estimateOutputSchema.safeParse(providerResponse).success` — the SAME schema the GUARD-01 boundary uses. (`normalizeOutput` wraps this; calling the schema directly is equivalent and clearer for a metric.)
- **Vagueness** = `isVagueEstimate({ total, sections })` — byte-identical to the production `assessNode` gate. A case's `expected.isVague` is asserted against this.
- **Positive total / min item count** = derived from the persisted estimate (server-recalculated `total`, item rows) — these are the post-guardrail authoritative values, so a regression in anchoring/totals math shows up here.

### Per-case assertion shape
```ts
// tests/eval/harness.test.ts
describe.each(CASES.filter(c => c.modality !== undefined))('eval case %s', (c) => {
  it(`${c.id} meets quality thresholds`, async () => {
    // run full graph with provider mocked to c.providerResponse, supabase mocked to fixture rows
    // read back the persisted estimate from the supabase mock capture
    const m = scorePersistedEstimate(capturedEstimate)
    expect(scoreProviderResponse(c.providerResponse).schemaValid).toBe(c.expected.schemaValid)
    expect(m.grandTotal > 0).toBe(c.expected.positiveTotal)
    expect(m.lineItemCount).toBeGreaterThanOrEqual(c.expected.minLineItems)
    expect(m.isVague).toBe(c.expected.isVague)
  })
})
// + one aggregate test: all non-vague cases pass; report a summary table.
```
The suite reports per-case pass/fail (each `it`) + an aggregate `it` that fails if any case regressed.

## EVAL-04 + CI Workflow Spec

### What's already there (mirror these conventions)
`.github/workflows/build-deploy.yml`: `runs-on: ubuntu-latest`, `actions/checkout@v4`, `timeout-minutes`, triggers `on: push: branches: [main]` + `workflow_dispatch`. It does NOT set up Node (it builds in Docker) — so the test workflow adds `actions/setup-node@v4`. No `npm ci`/install pattern exists in any workflow yet (build happens in Dockerfile) → the test workflow defines its own.

### Recommended workflow (new file `.github/workflows/test.yml`)
```yaml
name: Test
on:
  push:
    branches: [main, dev]
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  unit:
    name: Typecheck + unit/eval suite
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24          # matches local node-v24.13.0; confirm CI parity
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit -p tsconfig.ci.json   # SCOPED typecheck (see below)
      - run: npx vitest run                          # full unit + eval suite (mocked providers → no keys)
      # Determinism gate — proves the isolation fix held (Wave-1 invariant):
      - run: npx vitest run                          # second pass must also be green
```
- **No secrets:** mocked providers mean no `ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`/Supabase keys needed. The eval/unit suite must not hit live services. (Integration tests under `tests/integration/**` DO need real Supabase — they are in the vitest `include` today; **the CI gate should EXCLUDE `tests/integration/**`** to stay secret-free. Recommend `npx vitest run tests/unit` OR a vitest project/config that excludes integration. Flag for the planner: decide explicitly.)
- **Use `dev` branch trigger too:** repo's active branch is `dev`; gate PRs into `main` AND pushes to `dev`.
- **Node version:** local is node 24; pin `node-version: 24` (or read from `.nvmrc` if added). Confirm vitest 4 + Next 16 run clean on 24 in CI (HIGH confidence — that's the dev env).
- **Do NOT add a deploy step or `next build`** (deploy memory: builds happen in `build-deploy.yml` → GHCR only).
- **Add `npm run test:eval`** to package.json: `"test:eval": "vitest run tests/eval"` for local iteration; and keep `"test": "vitest run"` (already present).

### The tsc-gate problem (CRITICAL — read this before wiring `tsc --noEmit`)
`npx tsc --noEmit` is **ALREADY RED**: 9 pre-existing errors, **ALL in `tests/**`**, **0 in app/lib**:
- `tests/unit/ai/refine-shared-prompt.test.ts`, `tests/unit/estimate/observability.test.ts` (×3) — `error TS1501: regex flag only available targeting 'es2018' or later` (tsconfig `target: ES2017` vs a `/.../d` or `/.../s`+`v` flag).
- `tests/unit/inngest/generate-estimate-job.test.ts` — `TS2348` Mock not callable.
- `tests/unit/notifications/account-emails.test.ts` (×3) — `TS2345` `Branding` missing `metaDescription/ogImageUrl/canonicalBaseUrl/faviconUrl` (the test stub drifted from the type).
- `tests/unit/xphere-client.test.ts` — `TS2741` missing `pipeline` (the Xphere-integration type the memory references).

A full-repo `tsc --noEmit` gate would fail on day one → **useless** (CONTEXT's exact warning). **Two viable options for the planner (recommend Option A):**

- **Option A (scope the typecheck):** add `tsconfig.ci.json` that `extends: ./tsconfig.json` and narrows `include` to app/lib (`app/**`, `lib/**`, `components/**`, etc.) excluding `tests/**`. Gate `tsc --noEmit -p tsconfig.ci.json` → already GREEN (0 non-test errors verified). Low-risk, immediate. Downside: test files aren't type-gated (acceptable — vitest runs them; type errors there don't ship).
- **Option B (fix the 9 errors):** bump `target`/`lib` to `es2018`+ (fixes the 4 regex ones) and repair the 4 `Branding`/`pipeline`/Mock stubs, then gate full `tsc --noEmit`. More thorough but touches the global tsconfig (risk: `ES2017` was chosen deliberately?) and drags in unrelated test fixes. **Only if the planner wants test files type-gated.**

**Recommendation: Option A** — scoped `tsconfig.ci.json`, app/lib only. Verified GREEN today. Keeps the gate meaningful and the change minimal. Optionally add Option B's es2018 bump later as a separate quick task.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vagueness scoring | A new "is this estimate good" heuristic | `lib/estimate/quality/vagueness.ts:isVagueEstimate` | Same gate prod uses → test/prod parity; CONTEXT-mandated reuse |
| Schema validity | A custom JSON validator | `lib/ai/schema.ts:estimateOutputSchema` (`.safeParse`) | The authoritative GUARD-01 schema; `normalizeOutput` already wraps it |
| Provider determinism | A live OpenRouter/Gemini call with temperature 0 | `vi.mock('@/lib/ai/provider-with-fallback')` returning fixtures | No keys in CI, fully deterministic, exercises real downstream |
| Supabase in tests | A real DB or in-memory pg | The existing chainable `from()` mock pattern (`tests/unit/whatsapp/*`, `tests/unit/services/generate-estimate.test.ts`) | Established convention; no network |
| Test isolation | A custom run-sharding script | `vi.resetModules()` discipline + determinism gate | CONTEXT forbids sharding-as-mask; resetModules is the actual fix |
| Typecheck gate | Full-repo `tsc` | Scoped `tsconfig.ci.json` (app/lib) | Repo `tsc` is already red on 9 test-file errors |

**Key insight:** every quality primitive the harness needs already exists and is used in production. The harness is wiring + fixtures, not new scoring logic. The only genuinely novel work is the isolation remediation.

## Common Pitfalls

### Pitfall 1: Masking the leak by sharding or `--no-file-parallelism`
**What goes wrong:** `--no-file-parallelism` makes the whatsapp dir green but exposes a different 10-file set (api/billing/components). Sharding hides it entirely. **Avoid:** fix the module-scope-spy teardown; prove with the 3× determinism gate. (CONTEXT explicitly forbids sharding-as-mask.)

### Pitfall 2: Config-flag "fix" that breaks more than it fixes
**What goes wrong:** `mockReset`/`restoreMocks: true` globally resets module-scope `.mockResolvedValue(...)` defaults → 32 failures (verified). **Avoid:** do NOT reach for `clearMocks/mockReset/restoreMocks` in config as the fix. Per-file `vi.resetModules()` + existing `beforeEach` clears is the safe lever.

### Pitfall 3: Mocking too high (bypassing the guardrails the eval exists to protect)
**What goes wrong:** mocking `generateEstimateForProject` (like the regression tests do) skips normalize/schema/anchoring/totals → the eval validates a stub. **Avoid:** mock at `getAIProviderWithFallback` so the real service + Phase-100 guardrails run.

### Pitfall 4: Component-test mock-hoisting (fails even ALONE)
**What goes wrong:** `theme-toggle.test.tsx` fails ALONE (`expected 'moon' to contain 'monitor'`) — its `vi.mock('next-themes')` return isn't applied deterministically. This is a sibling of the same class but may need `vi.resetModules()` in `beforeEach` or `vi.mocked(useTheme).mockReturnValue(...)` per test. **Avoid:** when Wave 1 hits these, fix the mock binding, don't just add afterEach.

### Pitfall 5: New eval files becoming new contaminators
**What goes wrong:** the harness uses the same module-scope-spy pattern → adds itself to the leak. **Avoid:** the eval files MUST follow the Wave-1 discipline (`afterEach(() => { vi.clearAllMocks(); vi.resetModules() })`, lazy `await import` of the graph inside the per-case runner).

### Pitfall 6: Integration tests in the CI gate require live Supabase
**What goes wrong:** `vitest.config.ts` `include` covers `tests/integration/**` which hit real Supabase (`load-env.ts` loads `.env.local`). Running them in CI needs secrets → contradicts the secret-free gate. **Avoid:** gate `tests/unit` (+ `tests/eval`) only; exclude `tests/integration`.

### Pitfall 7: tsc gate red from pre-existing test errors
**What goes wrong:** full `tsc --noEmit` is already red (9 test-file errors) → a green-requiring gate never passes. **Avoid:** scoped `tsconfig.ci.json` (app/lib). Verified 0 non-test errors.

### Pitfall 8: Metrics module leaking into the hot path
**What goes wrong:** a `lib/estimate/quality/metrics.ts` gets imported by generation code. **Avoid:** put metrics in `tests/eval/metrics.ts` so production can't import it; it still REUSES the prod primitives.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vi.mock` + module-scope `const spy` + `vi.clearAllMocks()` | Same, BUT must pair with `vi.resetModules()` when the real consumer is imported in a shared worker | vitest 4 default `pool: forks` reuses workers | Without resetModules, cross-file spy bleed (this phase's bug) |
| Global `clearMocks/mockReset` config | Per-file teardown discipline | — | Global resets break module-scope mock defaults |

**Deprecated/outdated:** none relevant — vitest 4.1.4, zod 4, Next 16 are current.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| vitest | whole harness | ✓ | 4.1.4 | — |
| node | CI + local | ✓ | 24.13.0 (local) | pin CI to 24 |
| tsc / typescript | CI typecheck | ✓ | ^5 (target ES2017) | scope via tsconfig.ci.json |
| GitHub Actions | CI gate | ✓ | (build-deploy.yml exists) | — |
| Live AI keys (OpenRouter/Gemini/Anthropic) | NOT needed (mocked) | n/a | — | mocked providers → none required |
| Supabase (live) | integration tests only — EXCLUDE from gate | n/a for gate | — | mock service client in unit/eval |

**Missing dependencies with no fallback:** none. **With fallback:** live AI + Supabase are intentionally avoided via mocks.

## Validation Architecture

> `.planning/config.json` not inspected for `nyquist_validation`; assuming enabled (default). Test framework is vitest.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 (jsdom, globals) |
| Config file | `vitest.config.ts` (alias `@`, `server-only` stub, setup `tests/setup/load-env.ts`) |
| Quick run command | `npx vitest run tests/eval` (`npm run test:eval` to be added) |
| Full suite command | `npx vitest run` (unit; exclude `tests/integration` in CI) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (prereq) | Full suite deterministic-green across 3 runs | meta/isolation | `npx vitest run && npx vitest run && npx vitest run` | ❌ Wave 1 (fix existing files) |
| EVAL-01 | 6 golden fixtures load + typecheck, no network | unit | `npx vitest run tests/eval/fixtures` | ❌ Wave 2 |
| EVAL-02 | Mocked providers drive the real graph deterministically | integration(mocked) | `npx vitest run tests/eval/harness.test.ts` | ❌ Wave 2 |
| EVAL-03 | Each case asserts schema/total/items/vagueness thresholds | unit | `npx vitest run tests/eval/harness.test.ts` | ❌ Wave 2 |
| EVAL-04 | CI runs scoped tsc + full unit/eval suite, fails on regression | ci | (GitHub Actions `test.yml`) | ❌ Wave 3 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/eval` (fast — eval files only)
- **Per wave merge:** `npx vitest run` (full unit suite) — MUST be green
- **Phase gate:** `npx vitest run` run **3× consecutively, all green** (determinism), then scoped `tsc --noEmit -p tsconfig.ci.json` green, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/eval/fixtures/types.ts` + `cases.ts` — the 6 golden cases (EVAL-01)
- [ ] `tests/eval/mock-providers.ts` — deterministic `getAIProviderWithFallback` + `transcribeAudioOR`/`analyzePhotoOR` mocks (EVAL-02)
- [ ] `tests/eval/metrics.ts` — reuse `isVagueEstimate` + `estimateOutputSchema` (EVAL-03)
- [ ] `tests/eval/harness.test.ts` — per-case + aggregate assertions
- [ ] Isolation remediation across the contaminating files (Wave 1) — enumerate by bisect, add `afterEach(resetModules)` discipline
- [ ] `tsconfig.ci.json` (app/lib-scoped) + `.github/workflows/test.yml` + `test:eval` script (EVAL-04)
- [ ] Framework install: already present (vitest 4.1.4)

## Open Questions

1. **Exact contaminating-file set for the full suite.**
   - What we know: 20–21 files fail in the default run, flakily; whatsapp dir alone is green; the named mechanism is module-scope-spy + cached real consumer.
   - What's unclear: whether `vi.resetModules()` afterEach alone clears ALL of them, especially the component tests that fail ALONE (next-themes mock-hoisting, Pitfall 4).
   - Recommendation: Wave 1 is iterative — apply the discipline, run 3×, bisect any remaining red, fix file-by-file until the determinism gate passes. Budget for component-test mock fixes being a distinct sub-pattern.

2. **Integration tests in the gate.**
   - What we know: `tests/integration/**` is in the vitest `include` and needs live Supabase.
   - What's unclear: whether the team wants them in CI (they'd need secrets).
   - Recommendation: gate `tests/unit` + `tests/eval` only; leave integration out of the secret-free gate (or a separate keyed job, out of scope here).

3. **tsc gate scope.**
   - What we know: full `tsc` red on 9 test-file errors; app/lib clean.
   - Recommendation: Option A (scoped `tsconfig.ci.json`). Decided unless the planner wants test files type-gated (then Option B: es2018 bump + 4 stub fixes).

4. **CI node version source.**
   - What we know: local node 24; no `.nvmrc` confirmed.
   - Recommendation: pin `node-version: 24`; optionally add `.nvmrc`.

## Sources

### Primary (HIGH confidence) — read from the live repo
- `vitest.config.ts`, `package.json`, `tsconfig.json`, `tests/setup/load-env.ts`
- `tests/unit/whatsapp/{never-reply-regression,handler,confirm,batch-reporting,replay-safe-ttl}.test.ts` (leak pattern)
- `lib/whatsapp/estimate-graph.ts`, `lib/estimate/adapters/whatsapp.ts`, `lib/estimate/graph/index.ts`, `lib/estimate/graph/nodes/{generate,assess,auto-refine}.ts`
- `lib/services/generate-estimate.ts`, `lib/ai/provider-with-fallback.ts`, `lib/ai/{schema,normalize}.ts`, `lib/estimate/quality/vagueness.ts`
- `.github/workflows/build-deploy.yml`, `.planning/REQUIREMENTS.md` (EVAL-01..04), `.planning/phases/103-eval-harness-ci-gate/103-CONTEXT.md`
- **Empirical runs (this session):** reproduced + bisected the leak; confirmed flakiness (9→10, 20→21); confirmed config flags worsen (32) / don't help; confirmed `tsc` 9 errors all in `tests/**`, 0 in app/lib; confirmed `--no-file-parallelism` trades one leak set for another.

### Secondary (MEDIUM)
- Vitest 4 `pool: 'forks'` worker-reuse + `vi.resetModules()` semantics — inferred from observed behavior, consistent with vitest docs on module isolation.

## Metadata

**Confidence breakdown:**
- Isolation root cause: HIGH — reproduced, bisected, named the leaking state, ruled out config fixes empirically.
- Isolation fix landing fully green: MEDIUM-HIGH — `resetModules` addresses the mechanism; component-test sub-pattern (Pitfall 4) is a residual risk; the 3× determinism gate is the proof.
- Mocked-provider seam (EVAL-02): HIGH — read every module in the chain; seams confirmed.
- Fixture + metrics design (EVAL-01/03): HIGH — primitives read and reused verbatim.
- CI workflow + tsc scoping (EVAL-04): HIGH — conventions read from build-deploy.yml; tsc error inventory verified (9 errors, all test-file, 0 app/lib).

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable; vitest/zod/Next versions current). Re-verify the failing-file set at Wave-1 start since the suite is actively changing.
