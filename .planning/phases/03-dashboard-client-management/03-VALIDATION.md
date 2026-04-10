---
phase: 03
slug: dashboard-client-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | UX-01, UX-02, UX-03, UX-04 | integration | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | DASH-01, CLIENT-01 | unit | `npx vitest run tests/unit/queries` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | DASH-01, DASH-02, DASH-06 | unit | `npx vitest run tests/unit/dashboard` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | DASH-03, DASH-04, DASH-05, DASH-07, DASH-08 | unit | `npx vitest run tests/unit/project-list` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | CLIENT-01, CLIENT-06 | unit | `npx vitest run tests/unit/clients` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | CLIENT-02, CLIENT-03, CLIENT-04, UX-06 | unit | `npx vitest run tests/unit/clients` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/queries/dashboard.test.ts` — stubs for getDashboardStats, getProjects queries
- [ ] `tests/unit/queries/clients.test.ts` — stubs for getClients, getClient queries
- [ ] `tests/unit/components/status-badge.test.tsx` — status badge color mapping
- [ ] `tests/unit/schemas/client.test.ts` — client form zod schema validation

*Existing vitest infrastructure from Phase 1 covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bottom nav renders at 375px | UX-02, UX-03 | Requires visual viewport check | Resize to 375px, verify bottom nav visible with 44px targets |
| Sidebar collapse/expand | UX-01 | Requires visual breakpoint test | Resize across breakpoints, verify sidebar toggle |
| Skeleton loaders display | UX-04 | Requires slow network simulation | Throttle network, verify skeletons show during load |
| Toast notifications | UX-05 | Requires user interaction flow | Create/delete client, verify toast appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
