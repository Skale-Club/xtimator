---
phase: 58
slug: stripe-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 58 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/billing/` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/billing/`
- **After every plan wave:** `npx vitest run tests/unit/`
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | STRIPE-01..04 | grep + tsc | migration + IntegrationProvider extension | ❌ W0 | ⬜ pending |
| 58-01-02 | 01 | 1 | STRIPE-01 | unit | `npx vitest run tests/unit/billing/checkout.test.ts` | ❌ W0 | ⬜ pending |
| 58-01-03 | 01 | 1 | STRIPE-03 | unit | `npx vitest run tests/unit/billing/portal.test.ts` | ❌ W0 | ⬜ pending |
| 58-02-01 | 02 | 2 | STRIPE-02, STRIPE-04 | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` | ❌ W0 | ⬜ pending |
| 58-02-02 | 02 | 2 | STRIPE-02, STRIPE-04 | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/checkout.test.ts` — stubs for STRIPE-01
- [ ] `tests/unit/billing/portal.test.ts` — stubs for STRIPE-03
- [ ] `tests/unit/billing/stripe-webhook.test.ts` — stubs for STRIPE-02, STRIPE-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checkout redirect opens Stripe Checkout page | STRIPE-01 | Requires live Stripe test key | Use Stripe test mode, click Upgrade, verify redirect to checkout.stripe.com |
| Webhook updates tier in DB | STRIPE-02 | Requires Stripe CLI `stripe listen` | Use `stripe trigger checkout.session.completed`, verify `companies.tier` updated |
| Customer Portal opens | STRIPE-03 | Requires live Stripe test subscription | Click "Manage Subscription", verify portal.stripe.com opens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
