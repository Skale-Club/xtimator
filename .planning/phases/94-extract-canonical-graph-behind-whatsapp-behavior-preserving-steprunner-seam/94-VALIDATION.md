---
phase: 94
slug: extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 94-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (jsdom env, `globals: true`, `@`→repo root alias, `server-only` stubbed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/estimate tests/unit/whatsapp` |
| **Full suite command** | `npm test` (→ `vitest run`, `tests/unit/**` + `tests/integration/**`) |
| **Estimated runtime** | quick ~15s · full ~90s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/estimate tests/unit/whatsapp` (new module + WhatsApp safety net)
- **After every plan wave:** Run `npm test` (the behavior-preserving gate — every pre-existing WhatsApp + Inngest test green with NO assertion changes)
- **Before `/gsd:verify-work`:** Full suite green, PLUS the D-13 audit: only `readFileSync` paths changed in pre-existing source-text tests, never assertions
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner; rows below are keyed by requirement and become the per-task `<automated>` verify targets.

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| ENGINE-01 | Shared core is channel-neutral — imports NO `lib/whatsapp/*`, no `ownerPhone`/`whatsapp_*`/`sendWhatsAppMessage`/`WhatsAppMessage` | static (source-grep) | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ❌ W0 | ⬜ pending |
| ENGINE-02 | `buildEstimateGraph(adapter)` accepts a `ChannelAdapter`; WhatsApp adapter is a closure-factory capturing trusted `companyId` (no tenant input field) | unit | `npx vitest run tests/unit/estimate/channel-adapter.test.ts` | ❌ W0 | ⬜ pending |
| ENGINE-03 | `isVagueEstimate` from `lib/estimate/quality/vagueness.ts` (identical truth table); old `@/lib/whatsapp/ask-details` import still works (re-export) | unit | `npx vitest run tests/unit/estimate/vagueness.test.ts tests/unit/whatsapp/ask-details.test.ts` | ⚠️ partial | ⬜ pending |
| ENGINE-04 | Core nodes never throw; `generate` failure sets `failure?` (not throw); `decide` routes failure to adapter terminal | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` | ❌ W0 | ⬜ pending |
| CHAN-01 | WhatsApp runs on the shared graph; `buildEstimateGraph()` signature stable; `whatsapp-process.ts` still calls it via `orchestrate-estimate` step | static + unit | `npx vitest run tests/unit/inngest/whatsapp-process-job.test.ts` (paths updated, assertions unchanged) | ✅ path-update | ⬜ pending |
| DURABLE-01 | `StepRunner` defined; default `passthroughRunner.run(name, fn)` returns `fn()` unchanged; builder accepts injected runner | unit | `npx vitest run tests/unit/estimate/step-runner.test.ts` | ❌ W0 | ⬜ pending |
| DURABLE-02 | Decision artifact states "no LangGraph checkpointer; Inngest sole durability"; graph `.compile()` has no saver arg | static (source-grep) | `npx vitest run tests/unit/estimate/no-checkpointer.test.ts` | ❌ W0 | ⬜ pending |
| QA-01 | Frozen: each WhatsApp failure path (no input / generation throw / vague) → owner gets EXACTLY ONE reply; `graph.invoke` never rejects | unit (behavioral) | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/graph-neutrality.test.ts` — source-grep core has zero WhatsApp imports (ENGINE-01)
- [ ] `tests/unit/estimate/channel-adapter.test.ts` — adapter is a closure-factory; no tenant input field (ENGINE-02, mirrors `query-tools` T-lrf-01 pattern)
- [ ] `tests/unit/estimate/vagueness.test.ts` — `isVagueEstimate` truth table at new path (ENGINE-03)
- [ ] `tests/unit/estimate/never-throw.test.ts` — core nodes never throw; failure-as-state (ENGINE-04)
- [ ] `tests/unit/estimate/step-runner.test.ts` — `passthroughRunner` + injection (DURABLE-01)
- [ ] `tests/unit/estimate/no-checkpointer.test.ts` — artifact present + no saver on `.compile()` (DURABLE-02)
- [ ] `tests/unit/whatsapp/never-reply-regression.test.ts` — QA-01 frozen behavioral test (3 failure paths → 1 reply)
- [ ] **Path updates (NOT assertion changes)** in `tests/unit/inngest/whatsapp-process-job.test.ts` — update `readFileSync` targets only (D-13)
- [ ] Re-export wiring so `tests/unit/whatsapp/ask-details.test.ts` passes unchanged (ENGINE-03 / D-03)
- Framework install: none — Vitest already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live WhatsApp inbound still produces the same reply end-to-end | CHAN-01 | Requires Meta webhook + live Inngest + provider keys | Optional post-merge smoke: send an audio message to the connected WhatsApp number, confirm estimate-ready or ask-details reply arrives (non-blocking — covered structurally by the frozen test + green suite) |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
