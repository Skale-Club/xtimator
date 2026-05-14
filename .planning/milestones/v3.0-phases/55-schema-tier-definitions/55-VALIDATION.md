---
phase: 55
slug: schema-tier-definitions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 55 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/entitlements.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/entitlements.test.ts`
- **After every plan wave:** `npx vitest run tests/unit/`
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | TIER-01, TIER-02 | integration | `grep "tier" supabase/migrations/...sql` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 1 | TIER-03 | unit | `npx vitest run tests/unit/entitlements.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-03 | 01 | 2 | TIER-04 | unit | `npx vitest run tests/unit/entitlements.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/entitlements.test.ts` — stubs for TIER-03 (entitlements module shape) and TIER-04 (trial start in createOrUpdateCompany)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to live Supabase | TIER-01, TIER-02 | Requires live DB connection | Run `bunx supabase db push --db-url $DATABASE_URL`; verify no errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
