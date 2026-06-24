---
phase: 110
slug: real-cost-capture-foundation-measure-only-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 110 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/ai tests/unit/observability` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched area.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** ~120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 110-cost-capture | TBD (planner) | 1 | COST-01 | unit | `npx vitest run tests/unit/ai` | ❌ W0 | ⬜ pending |
| 110-whisper-cost | TBD (planner) | 1 | COST-02 | unit | `npx vitest run tests/unit/ai` | ❌ W0 | ⬜ pending |
| 110-persist | TBD (planner) | 1 | COST-03 | unit | `npx vitest run tests/unit/observability` | ❌ W0 | ⬜ pending |
| 110-measure-only | TBD (planner) | 1 | CALIB-01 | unit (static) | `npx vitest run tests/unit/observability` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; each phase requirement (COST-01/02/03, CALIB-01) must have an automated verification per the map above.*

---

## Wave 0 Requirements

- [ ] `tests/unit/ai/openrouter-cost-capture.test.ts` — stubs for COST-01 (parse `usage.cost` from a mocked OpenRouter response; null on absent field)
- [ ] `tests/unit/ai/whisper-cost.test.ts` — stubs for COST-02 (computed cost = minutes × rate; null on Gemini fallback)
- [ ] `tests/unit/observability/ai-cost-events.test.ts` — stubs for COST-03 + CALIB-01 (recordAICost never-throws; measure-only: no credit/ledger import; migration static contract)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `usage.cost` returned by live OpenRouter | COST-01 | Requires a live API call with a real key (cannot run in CI/secret-free) | In staging, generate one estimate and confirm a row in `ai_cost_events` with a non-null `real_cost_usd` |
| Cost migration applied to remote | COST-03 | Deploy is CI→GHCR→Coolify, not applied from here | After deploy, verify the `ai_cost_events` table exists in the remote DB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
