# Phase 103: Eval/Test Harness + CI Regression Gate - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grounded in the live code map). Final phase of v4.5.

<domain>
## Phase Boundary

Prove the hardened, unified estimate engine (Phases 99-102) stays good. A golden multimodal dataset run against deterministic mocked providers scores objective quality metrics, and CI fails the build the moment those metrics or schema validity regress. A PREREQUISITE for a trustworthy gate: fix the pre-existing vitest cross-file test-isolation leak (otherwise the CI gate is flaky and worthless). Scope = EVAL-01, EVAL-02, EVAL-03, EVAL-04 (+ the isolation fix that makes EVAL-04 reliable).

**Requirements:** EVAL-01 (golden fixtures audio/photo/text), EVAL-02 (deterministic mocked providers), EVAL-03 (quality-metrics suite), EVAL-04 (CI regression gate). Plus: test-harness isolation remediation (carry-forward from Phases 101/102).
</domain>

<decisions>
## Implementation Decisions

### Test-isolation fix (prerequisite for EVAL-04)
- A recurring cross-file leak: `vitest run tests/unit/estimate tests/unit/whatsapp` yields ~11 failures (e.g. `never-reply-regression` Path B sees 2 replies instead of 1) because files sharing the `@/lib/whatsapp/estimate-graph` mock accumulate module-level spy/call-count state across files. Every file passes in isolation.
- `vitest.config.ts` today sets NO `clearMocks`/`mockReset`/`restoreMocks` and no explicit `pool`/`isolate`. Fix candidates (researcher picks the minimal robust one): (a) add `test.restoreMocks: true` + `test.clearMocks: true` + `test.mockReset: true` to the config so spies/mock state reset between tests; and/or (b) ensure the shared mock harness resets its counters in `beforeEach` (the real fix if a module-scope spy is shared); and/or (c) set `pool: 'forks'` with proper `isolate: true`. Diagnose the ACTUAL root cause first (is it config-level mock-reset, or a shared module-scope spy in a test helper?). The goal: `npx vitest run` (full suite) is GREEN and deterministic regardless of file order.
- Do NOT mask the leak by sharding the run — fix the isolation so the whole suite is reliable.

### EVAL-01 — golden multimodal fixtures
- Live audio/image binaries are NOT deterministic test inputs. Model fixtures at the POST-INGESTION boundary + a few raw small samples: a `tests/fixtures/estimates/` (or `tests/eval/fixtures/`) dataset of representative cases, each: `{ id, inputs: { transcripts[], photoDescriptions[], texts[] }, providerResponse: <estimate tool JSON>, expected: <quality thresholds> }`. Cover the three modalities (an audio-derived transcript case, a photo-description case, a text case) plus mixed + a deliberately-vague case (to exercise the vagueness gate / needs_details). Store as typed TS/JSON fixtures, referenced deterministically (no network).
- Optionally include 1-2 tiny real audio/image binaries to exercise `ingestMultimodal` itself with a mocked provider (so the ingestion path is covered end-to-end), but the estimate-quality scoring runs off the post-ingestion fixtures.

### EVAL-02 — deterministic mocked providers
- A reusable mock layer (e.g. `tests/eval/mock-providers.ts`): a mock `AIProvider` (`generateEstimate`/`refineEstimate`) and mock `transcribeAudioOR`/`analyzePhotoOR` that return fixture-driven deterministic outputs keyed by input. Wire via `vi.mock` so the REAL engine (the shared graph + `generateEstimateForProject` / the refine sub-graph + the Phase-100 normalize/schema/guardrails) runs against them — exercising the actual code paths, not a reimplementation. Mocks must be deterministic and reset per test (consistent with the isolation fix).
- Reuse the Phase-99/100 seams: the mock providers feed through `normalizeOutput`/`estimateOutputSchema` so schema validity is genuinely tested.

### EVAL-03 — quality-metrics suite
- A metrics module (e.g. `lib/estimate/quality/metrics.ts` or `tests/eval/metrics.ts`) scoring a generated estimate on objective signals: non-zero/positive grand total, minimum line-item count, vagueness verdict (REUSE `lib/estimate/quality/vagueness.ts:isVagueEstimate`), and zod-schema validity (REUSE `lib/ai/schema.ts:estimateOutputSchema`). Each golden case asserts its `expected` thresholds. The suite reports per-case pass/fail + an aggregate.
- Prefer reusing existing quality primitives over inventing new scoring, so metrics match production gates.

### EVAL-04 — CI regression gate
- NO CI job runs `npm test` today (only build-deploy, gitleaks, cron, supabase-keepalive). Add a GitHub Actions workflow (e.g. `.github/workflows/test.yml` or an `eval` job): on push/PR, install deps, run `npx tsc --noEmit` (typecheck) + `npx vitest run` (full unit suite incl. the eval harness). The job FAILS the build when any test (quality metric / schema validity / engine behavior) regresses. Must run green only AFTER the isolation fix.
- Keep it lean (Node setup + install + test); align with the project's existing CI conventions (see `.github/workflows/build-deploy.yml`). No secrets required (the eval harness uses mocked providers — no live AI keys). Respect the project's deploy memory: this is a TEST gate, not a deploy change.
- The eval harness should be runnable locally too (e.g. an `npm run test:eval` script scoping the eval files) for fast iteration.

### Invariants to preserve
- The full unit suite (existing ~285+ tests across all prior phases) stays GREEN and deterministic after the isolation fix — no test deleted to make the gate pass.
- No production behavior change — this phase adds tests, fixtures, a metrics module, and CI; it does not alter the engine. (The metrics module may live in lib/ but must be test/observability-only, not in the generation hot path.)
- No secrets in fixtures or CI (placeholders only); mocked providers mean no live AI keys in CI.
- Multi-tenant / server-only conventions unchanged.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vitest.config.ts` — jsdom, globals, setupFiles `tests/setup/load-env.ts`; NO mock-reset/isolate config (the fix target).
- `tests/fixtures/` — existing fixture dir (price-book CSV, encryption key) — extend with the estimate golden dataset.
- `lib/ai/schema.ts` `estimateOutputSchema` + `lib/ai/normalize.ts` (Phase 100) — schema validity metric.
- `lib/estimate/quality/vagueness.ts` `isVagueEstimate` (Phase 96) — vagueness metric.
- `lib/estimate/graph/*` + `lib/services/generate-estimate.ts` + the refine sub-graph (Phase 101) — the engine the harness exercises.
- `tests/unit/whatsapp/never-reply-regression.test.ts` + the shared `@/lib/whatsapp/estimate-graph` mock harness — the leak source to diagnose.
- `.github/workflows/build-deploy.yml` — CI conventions to mirror for the test workflow.
- `package.json` scripts — add `test:eval` (+ maybe `typecheck`).

### Established Patterns
- `vi.mock` module mocking; the existing chainable-Supabase mock harness.
- Best-effort quality primitives already used in production (vagueness, schema) — reuse for metrics.

### Integration Points
- vitest config (isolation), tests/eval/ (harness + fixtures + mocks + metrics), .github/workflows (CI gate), package.json (scripts).
</code_context>

<specifics>
## Specific Ideas

- The isolation fix is the linchpin — without it EVAL-04 is flaky. Diagnose the real root cause (config mock-reset vs a shared module-scope spy in a test helper) before adding the CI job.
- Reuse production quality primitives (vagueness, zod schema) for the metrics so "regression" means the same thing in tests and prod.
- Mock at the provider/primitive boundary so the REAL graph/guardrails/refine code runs — the harness validates the engine, not a stand-in.
- Keep CI lean and secret-free (mocked providers).
</specifics>

<deferred>
## Deferred Ideas

- LLM-as-judge qualitative scoring of estimate prose/tone (EVAL-05) — deferred per REQUIREMENTS (needs a stable judge prompt + budget).
- Live-provider smoke tests in CI (real OpenRouter/Gemini calls) — out of scope; the gate uses mocked providers for determinism.
- Perf/load benchmarking of the engine — not part of this phase.
- Full E2E (Playwright) in the regression gate — the existing e2e suite stays separate; this gate is the unit/eval suite.
</deferred>
