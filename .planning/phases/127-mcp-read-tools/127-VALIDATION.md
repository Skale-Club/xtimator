---
phase: 127
slug: mcp-read-tools
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 127 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/mcp-tool-registry.test.ts tests/unit/mcp` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched area.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd:verify-work`:** Full suite must be green (the existing MCP suite is the parity guard).
- **Max feedback latency:** ~120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 127-knowledge-query-tools | TBD (planner) | 1 | MKB-01, MQRY-01 | unit | `npx vitest run tests/unit/mcp` | ❌ W0 | ⬜ pending |
| 127-security-annotations | TBD (planner) | 1 | MSEC-01, MSEC-02 | unit | `npx vitest run tests/unit/mcp` | ❌ W0 | ⬜ pending |
| 127-registry-wire | TBD (planner) | 2 | MKB-01, MQRY-01 | unit | `npx vitest run tests/unit/mcp-tool-registry.test.ts` | ✅ existing (update 6→12) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; MKB-01/MQRY-01/MSEC-01/MSEC-02 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/mcp/knowledge-query-tools.test.ts` — stubs for MKB-01/MQRY-01/MSEC-01/MSEC-02 (each tool wraps the neutral fn; companyId from auth, NOT inputSchema; readOnlyHint:true; ask_knowledge resolves industries)

*The existing `tests/unit/mcp-tool-registry.test.ts` count assertions (6 → 12) are updated in the registry-wire task (in-scope, not a regression).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A connected MCP client calls ask_knowledge / a query tool | MKB-01/MQRY-01 | Requires a live OAuth-connected MCP client + seeded data | In Claude.ai, connect the MCP, ask a trade how-to (ask_knowledge) + "latest estimate for João" (query tool), confirm answers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
