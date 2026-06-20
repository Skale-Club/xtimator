---
phase: 95
slug: migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 95 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 95-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (jsdom env, `globals: true`, `@`→repo root alias, `server-only` stubbed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/inngest/ tests/unit/estimate/ tests/unit/whatsapp/never-reply-regression.test.ts` |
| **Full suite command** | `npm test` (→ `vitest run`, `tests/unit/**`) |
| **Estimated runtime** | quick ~10s · full ~90s |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `npm test` (behavior-preserving gate — WhatsApp + existing Inngest tests stay green)
- **Before `/gsd:verify-work`:** Full suite green, PLUS D-02 audit: only source-text anchor strings changed in pre-existing tests (no assertion logic changes except documented renames)
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| CHAN-02 | `generate-estimate` Inngest job invokes `buildEstimateGraph(makeDefaultAdapter(...))` via `step.run('orchestrate-estimate', ...)` | unit (source-text anchor) | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` | ✅ exists (needs anchor update) | ⬜ pending |
| CHAN-03 | MCP inherits via `EVENT_ESTIMATE_GENERATE` dispatch — zero `lib/mcp/tools/write.ts` changes | static + suite green | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` + existing MCP tests | ✅ zero code change = zero new tests | ⬜ pending |
| CHAN-04 | All three channels produce equivalent output; no channel regresses; existing per-channel suites stay green | regression (suite green) | `npm test` | ✅ existing suites | ⬜ pending |
| QA-03 | Non-vague web happy path: exactly 1 AI call, zero `whatsapp_*` rows written, `graph.invoke` resolves | unit (new behavioral) | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` | ❌ Wave 0 gap (new test needed) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/inngest/generate-estimate-job.test.ts` — **update** existing anchor assertions:
  - Replace `step.run('call-ai-provider', ...)` assertion → `step.run('orchestrate-estimate', ...)`
  - Add assertions: `buildEstimateGraph(` and `makeDefaultAdapter(` present in source (CHAN-02)
  - Add QA-03 behavioral test: mock `generateEstimateForProject`, invoke the job step, assert called exactly once + no `from('whatsapp_sessions')` call

*All other required test infrastructure exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live web estimate from browser still produces equivalent estimate to pre-Phase-95 | CHAN-04 | Requires live Inngest worker + Anthropic keys + browser session | Optional post-merge smoke: create a project via capture UI, generate estimate, confirm estimate is created and estimate editor loads with correct content (non-blocking — covered structurally by the updated anchor test + green suite) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
