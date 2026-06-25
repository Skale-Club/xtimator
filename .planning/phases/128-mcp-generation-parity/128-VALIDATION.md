---
phase: 128
slug: mcp-generation-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 128 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/mcp tests/unit/agent-tools` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched area.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd:verify-work`:** Full suite must be green (the existing MCP create_estimate suite is the parity guard).
- **Max feedback latency:** ~120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 128-channel-id | TBD (planner) | 1 | MGEN-01 | unit | `npx vitest run tests/unit/agent-tools` | ✅ existing (extend) | ⬜ pending |
| 128-reconcile | TBD (planner) | 1 | MGEN-01 | unit | `npx vitest run tests/unit/mcp` | ✅ existing (parity guard) | ⬜ pending |
| 128-parity-test | TBD (planner) | 2 | MPAR-01 | unit (static binding) | `npx vitest run tests/unit/mcp` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; MGEN-01/MPAR-01 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/mcp/mcp-generation-parity.test.ts` — static binding test for MPAR-01 (lib/mcp/tools/write.ts imports createEstimate from @/lib/agent-tools/create-estimate; the inline inngest.send block is gone; all 3 channels route generation through the neutral fn / generateEstimateForProject)

*MGEN-01 is guarded by the EXISTING MCP create_estimate behavior test (must stay green — same event, payload, {job_id} return); the channel-namespaced idempotency id keeps it green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP create_estimate end-to-end still generates | MGEN-01 | Requires a live OAuth MCP client + Inngest | In Claude.ai, connect the MCP, call create_estimate, poll check_job_status, confirm the estimate is produced (identical to before) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
