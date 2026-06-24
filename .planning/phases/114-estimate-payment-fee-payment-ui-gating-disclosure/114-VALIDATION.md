---
phase: 114
slug: estimate-payment-fee-payment-ui-gating-disclosure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 114 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/billing` |
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
| 114-fee-helper | TBD (planner) | 1 | FEE-03, FEE-04 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 114-fee-invoice | TBD (planner) | 1 | FEE-01, FEE-02 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 114-payments-gate | TBD (planner) | 2 | PAYGATE-01, PAYGATE-02 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 114-disclosure | TBD (planner) | 2 | DISCLOSE-01 | unit (component/static) | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; each phase requirement (FEE-01..04, PAYGATE-01/02, DISCLOSE-01) must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/application-fee.test.ts` — stubs for FEE-03/04 (computeApplicationFee floors at min, clamps below amount, never 0 when amount>0)
- [ ] `tests/unit/billing/invoice-fee.test.ts` — stubs for FEE-01 (createConnectInvoice passes application_fee_amount on the invoice)
- [ ] `tests/unit/billing/payments-enabled.test.ts` — stubs for PAYGATE-01/02 (paymentsEnabled true only when stripe_connect_status==='active'; disconnected → no forward pay affordance)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live 1% fee lands on the platform account | FEE-01 | Requires live Connect payment | In staging, pay a connected-account invoice; confirm the application fee in the platform Stripe dashboard |
| Disconnected company sees zero payment UI | PAYGATE-02 | Requires live auth session in both states | Log in as a company without Stripe; confirm no Pay button / fee mention anywhere |
| Disclosure shows live % | DISCLOSE-01 | Requires the connect screen rendered | Open /settings/payments; confirm the 1% disclosure reads from billing_config |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
