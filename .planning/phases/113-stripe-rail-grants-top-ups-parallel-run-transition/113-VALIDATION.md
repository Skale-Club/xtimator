---
phase: 113
slug: stripe-rail-grants-top-ups-parallel-run-transition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/billing tests/unit/webhooks` |
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
| 113-grant-on-invoice | TBD (planner) | 1 | TOPUP-01 | unit (webhook) | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |
| 113-topup-route | TBD (planner) | 1 | TOPUP-02 | unit (route) | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |
| 113-topup-webhook | TBD (planner) | 2 | TOPUP-02 | unit (webhook) | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |
| 113-overage-affordance | TBD (planner) | 2 | TOPUP-03 | unit | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |
| 113-parallel-run | TBD (planner) | 2 | MIG-01 | static (regression) | `npx vitest run tests/unit/quota tests/unit/entitlements` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; each phase requirement (TOPUP-01/02/03, MIG-01) must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/webhooks/stripe-credit-grant.test.ts` — stubs for TOPUP-01 (invoice.paid → grantCredits with event.id idempotency; redelivery no double-grant) + TOPUP-02 webhook arm (checkout.session.completed type=credit_topup → grantCredits reason topup, before the subscription early-break)
- [ ] `tests/unit/billing/topup-checkout.test.ts` — stubs for TOPUP-02 (mode:'payment' session, pack from billing_config, metadata round-trip)
- [ ] `tests/unit/billing/overage-affordance.test.ts` — stubs for TOPUP-03 (402 response enriched with topUpUrl; no hard block while enforcement off)

*MIG-01 reuses the existing quota/entitlements regression tests (count-based path unchanged).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live invoice.paid grants credits | TOPUP-01 | Requires live Stripe webhook + applied migrations | In staging, trigger a test subscription renewal, confirm a `grant` ledger row with delta = tier grant |
| Top-up checkout end-to-end | TOPUP-02 | Requires live Stripe Checkout | In staging, buy a top-up pack with a test card, confirm a `topup` ledger row |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
