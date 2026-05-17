---
phase: 72
slug: admin-menu-performance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler + Next.js build |
| **Config file** | tsconfig.json, next.config.mjs |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && npx next build 2>&1 | tail -20` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 72-01-01 | 01 | 1 | PERF-ADMIN-01 | build | `npx tsc --noEmit` | ⬜ pending |
| 72-01-02 | 01 | 1 | PERF-ADMIN-01 | grep | `grep -r "loading.tsx" app/admin/` | ⬜ pending |
| 72-02-01 | 02 | 1 | PERF-ADMIN-02 | grep | `grep -r "revalidate" app/admin/` | ⬜ pending |
| 72-03-01 | 03 | 2 | PERF-ADMIN-03 | grep | `grep -n "getUserById" lib/admin/integrations-providers.ts` | ⬜ pending |
| 72-04-01 | 04 | 2 | PERF-ADMIN-04 | grep | `grep -n "perPage: 1000\|listUsers" app/admin/admins/page.tsx` | ⬜ pending |
| 72-05-01 | 05 | 3 | PERF-ADMIN-05 | build | `npx tsc --noEmit && npx next build` | ⬜ pending |
| 72-05-02 | 05 | 3 | PERF-ADMIN-06 | manual | No regressions in admin CRUD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no new test framework needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin nav renders within 100ms of click | PERF-ADMIN-05 | Browser timing required | Open /admin, click nav items, observe instant skeleton then content |
| No regressions in admin CRUD | PERF-ADMIN-06 | Integration test requires live Supabase | Invite admin, suspend/reactivate, update branding, view billing — all must work |
| App shell nav renders immediately | PERF-ADMIN-01 | Browser observation | Login, navigate between /dashboard /clients /projects — no blank flash |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
