---
phase: 56
slug: usage-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 56 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/quota.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/quota.test.ts`
- **After every plan wave:** `npx vitest run tests/unit/`
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | QUOTA-02 | grep | `grep "idempotency_key" supabase/migrations/20260513000002_phase56_usage_idempotency.sql` | ❌ W0 | ⬜ pending |
| 56-01-02 | 01 | 1 | QUOTA-01, QUOTA-02 | unit | `npx vitest run tests/unit/quota.test.ts` | ❌ W0 | ⬜ pending |
| 56-01-03 | 01 | 1 | QUOTA-01, QUOTA-02 | unit + tsc | `npx vitest run tests/unit/quota.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/unit/quota.test.ts` — 7 test cases covering checkQuota (4 cases) and recordUsage (3 cases)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| idempotency_key migration applies to live Supabase | QUOTA-02 | Requires live DB | Run `bunx supabase db push --db-url $DATABASE_URL` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
