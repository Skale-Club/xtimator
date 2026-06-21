---
phase: 103
slug: eval-harness-ci-gate
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
---

# Phase 103 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 (jsdom, globals) |
| **Config file** | `vitest.config.ts` (alias `@`, server-only stub, setup `tests/setup/load-env.ts`) |
| **Quick run command** | `npx vitest run tests/eval` |
| **Full suite command** | `npx vitest run` (unit; exclude `tests/integration` in CI) |
| **Estimated runtime** | ~3 min full; ~10s eval-only |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/eval` (+ the files touched by an isolation task)
- **After every plan wave:** `npx vitest run` (full unit suite) — MUST be green
- **Before `/gsd:verify-work`:** `npx vitest run` run **3× consecutively, all green** (determinism gate), THEN scoped `npx tsc --noEmit -p tsconfig.ci.json` green
- **Max feedback latency:** ~10s (eval-only); ~3 min (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| isolation | 01 | 1 | prereq | meta | `npx vitest run && npx vitest run && npx vitest run` (3× green) | ❌ fix existing | ⬜ pending |
| fixtures | 02 | 2 | EVAL-01 | unit | `npx vitest run tests/eval/fixtures` | ❌ new | ⬜ pending |
| mocks | 02 | 2 | EVAL-02 | mocked-integration | `npx vitest run tests/eval/harness.test.ts` | ❌ new | ⬜ pending |
| metrics | 02 | 2 | EVAL-03 | unit | `npx vitest run tests/eval/harness.test.ts` | ❌ new | ⬜ pending |
| ci-gate | 03 | 3 | EVAL-04 | ci | GitHub Actions `test.yml` + `npx tsc --noEmit -p tsconfig.ci.json` | ❌ new | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 / Wave 1 Requirements

- [ ] **(Wave 1) Isolation remediation** — bisect the contaminating files (full `npx vitest run` fails ~20 files / ~34 tests non-deterministically; module-scope `vi.fn()` spies whose binding is cached in reused workers). Add per-file `afterEach(() => { vi.clearAllMocks(); vi.resetModules() })` discipline to the offending files. EXIT CRITERION: `npx vitest run` green 3× consecutively. Do NOT mask via sharding; do NOT use global clearMocks/mockReset config (empirically makes it worse).
- [ ] `tests/eval/fixtures/{types,cases}.ts` — 6 golden cases (3 modalities + mixed + vague + a schema-drift metric-teeth case) (EVAL-01)
- [ ] `tests/eval/mock-providers.ts` — deterministic `getAIProviderWithFallback` + `transcribeAudioOR`/`analyzePhotoOR` mocks keyed by fixture; engine runs REAL (EVAL-02)
- [ ] `tests/eval/metrics.ts` — reuse `isVagueEstimate` (lib/estimate/quality/vagueness.ts) + `estimateOutputSchema` (lib/ai/schema.ts) + total>0 + min item count (EVAL-03)
- [ ] `tests/eval/harness.test.ts` — per-case + aggregate threshold assertions
- [ ] `tsconfig.ci.json` (app/lib-scoped — verified green; the 9 pre-existing tsc errors are all in tests/**) + `.github/workflows/test.yml` + `npm run test:eval` script (EVAL-04)
- Framework install: none — vitest present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI gate actually fails a PR on a real regression | EVAL-04 | Requires a live GitHub Actions run on a PR | Open a throwaway PR that breaks a metric (e.g. force a $0 estimate fixture-expectation mismatch); confirm the Actions check goes red and blocks |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Isolation determinism gate: `npx vitest run` green 3× consecutively
- [ ] Scoped `tsc --noEmit -p tsconfig.ci.json` green
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
