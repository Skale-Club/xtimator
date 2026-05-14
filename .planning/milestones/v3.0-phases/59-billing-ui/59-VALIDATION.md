---
phase: 59
slug: billing-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 59 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/billing/billing-data.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/billing/billing-data.test.ts`
- **After every plan wave:** `npx vitest run tests/unit/`
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | BILLING-01 | unit + tsc | `npx vitest run tests/unit/billing/billing-data.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 59-01-02 | 01 | 1 | BILLING-01 | tsc + grep | `npx tsc --noEmit && grep -r "settings/billing" app/(app)/settings/page.tsx` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 2 | BILLING-02, BILLING-03, BILLING-04, BILLING-05 | tsc | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 59-02-02 | 02 | 2 | BILLING-04 | tsc + grep | `npx tsc --noEmit && grep "tier_trial_ends_at" app/(app)/layout.tsx` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/billing-data.test.ts` — stubs for `getBillingData()` (BILLING-01 data layer)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /settings/billing page renders plan card and usage meters | BILLING-01 | Requires browser + live data | Navigate to /settings/billing; verify plan card and meters visible |
| Upgrade button redirects to Stripe Checkout | BILLING-02 | Requires live Stripe test key | Click "Upgrade to Pro"; verify redirect to checkout.stripe.com |
| Trial banner appears < 3 days before expiry | BILLING-04 | Requires trial company data | Set tier_trial_ends_at to now+2days in DB; reload app; verify banner |
| 402 upgrade toast fires on quota exceeded | BILLING-05 | Requires triggered quota limit | Exhaust estimate quota; trigger generate-estimate; verify toast appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
