---
phase: 60
slug: trial-automation-admin-tooling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 60 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit`
- **After every plan wave:** `npx vitest run tests/unit/`
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | TRIAL-01 | grep + tsc | `grep -c "tier_trial_ends_at" app/api/cron/expire-trials/route.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 60-01-02 | 01 | 1 | TRIAL-02 | grep + tsc | `grep -c "Resend" app/api/cron/trial-warning-emails/route.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 60-02-01 | 02 | 1 | ADMIN-BILLING-01, ADMIN-BILLING-02 | grep + tsc | `grep -c "forceTier\|grantBonusCredits" app/admin/billing/actions.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 60-02-02 | 02 | 1 | ADMIN-BILLING-01, ADMIN-BILLING-02, ADMIN-BILLING-03 | grep + tsc | `grep -c "MRR\|proCount\|bizCount" app/admin/billing/page.tsx && npx tsc --noEmit` | ❌ W0 | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Expired trial companies auto-downgraded | TRIAL-01 | Requires DB + cron trigger | Set `tier_trial_ends_at = now()-1h`, call GET /api/cron/expire-trials with CRON_SECRET header, verify column cleared |
| Warning email received at T-3 | TRIAL-02 | Requires live Resend + real email | Set `tier_trial_ends_at = now()+3d`, trigger cron, verify email in inbox |
| Admin force-tier updates DB immediately | ADMIN-BILLING-01 | Requires admin session | Navigate to /admin/billing, select a company, force to 'pro', verify companies.tier updated |
| Bonus credits reduce quota count | ADMIN-BILLING-02 | Requires quota check after grant | Grant -5 credits, run checkQuota, verify remaining increased |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
