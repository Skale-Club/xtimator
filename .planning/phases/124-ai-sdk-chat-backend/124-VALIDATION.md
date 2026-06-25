---
phase: 124
slug: ai-sdk-chat-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 124 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/chat` |
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
| 124-provider | TBD (planner) | 1 | CHATBE-01 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 124-tools | TBD (planner) | 1 | CHATBE-02, CHATBE-03 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 124-route | TBD (planner) | 2 | CHATBE-02 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 124-credit-reuse | TBD (planner) | 2 | CHATMETER-01 | unit (static) | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; CHATBE-01/02/03 + CHATMETER-01 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/chat/provider.test.ts` — stub for CHATBE-01 (slot model id → OpenRouter provider; reuses getIntegrationKey)
- [ ] `tests/unit/chat/tools.test.ts` — stubs for CHATBE-02/03 (createEstimate tool dispatches async {jobId} without awaiting; queryCompanyData/askKnowledge wrap the neutral fns; companyId is a closure, NOT an inputSchema field)
- [ ] `tests/unit/chat/route.test.ts` — stub for CHATBE-02 (streamText with tools; persists via onFinish; owner auth) using MockLanguageModelV3
- [ ] `tests/unit/chat/credit-reuse.test.ts` — static for CHATMETER-01 (the route adds NO recordCreditDebit — no double-debit; generation debits in the existing Inngest step)

*The Vercel AI SDK (`ai` + `@openrouter/ai-sdk-provider`) is a new dependency added this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live chat streams + calls a tool | CHATBE-02 | Requires a live OpenRouter key + the UI (Phase 125) | In staging, send "generate an estimate for project X" and confirm the createEstimate tool dispatches + the stream renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
