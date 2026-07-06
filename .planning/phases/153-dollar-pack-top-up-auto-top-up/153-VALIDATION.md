---
phase: 153
slug: dollar-pack-top-up-auto-top-up
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 153 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/billing/<file>.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/billing` |
| **Estimated runtime** | Fast (~10s) for scoped billing suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/billing/<touched-file>.test.ts`
- **After every plan wave:** Run `npx vitest run tests/unit/billing`
- **Before `/gsd:verify-work`:** Full billing suite green; also run full `npm test` given this phase touches the shared Stripe webhook handler
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 153-01-01 | 01 | 0 | CREDITUI-06 | unit | `npx vitest run tests/unit/billing/billing-config.test.ts` | ✅ extend | ⬜ pending |
| 153-01-02 | 01 | 0 | CREDITUI-06 | unit | `npx vitest run tests/unit/billing/topup-checkout.test.ts` | ✅ extend | ⬜ pending |
| 153-01-03 | 01 | 0 | CREDITUI-06 | unit | `npx vitest run tests/unit/billing/topup-pack-labels-no-hardcode.test.ts` | ❌ W0 | ⬜ pending |
| 153-02-01 | 02 | 0 | CREDITUI-07 | unit | `npx vitest run tests/unit/billing/auto-topup.test.ts` | ❌ W0 | ⬜ pending |
| 153-02-02 | 02 | 0 | CREDITUI-07 | unit | `npx vitest run tests/unit/billing/auto-topup-concurrency.test.ts` | ❌ W0 | ⬜ pending |
| 153-02-03 | 02 | 0 | CREDITUI-07 | unit | `npx vitest run tests/unit/billing/autotopup-setup-session.test.ts` | ❌ W0 | ⬜ pending |
| 153-02-04 | 02 | 0 | CREDITUI-07 | unit | `npx vitest run tests/unit/billing/auto-topup-settings.test.ts` | ❌ W0 | ⬜ pending |
| 153-02-05 | 02 | 0 | CREDITUI-07 | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/auto-topup.test.ts` — CREDITUI-07 trigger logic (fires only on `auto_topup_enabled && balance < threshold`, threshold-crossing independence per Pitfall 3, never-throws-on-failure convention mirroring `credit-low-notify.test.ts`)
- [ ] `tests/unit/billing/auto-topup-concurrency.test.ts` — the SINGLE RISKIEST test in this phase: two simultaneous calls to the in-flight-guarded charge function result in exactly ONE `paymentIntents.create` call
- [ ] `tests/unit/billing/autotopup-setup-session.test.ts` — the new `mode:'setup'` Checkout route, mirroring `topup-checkout.test.ts`'s structure, server-side company lookup only
- [ ] `tests/unit/billing/auto-topup-settings.test.ts` — settings-save endpoint rejects `auto_topup_enabled: true` with no payment method on file (Pitfall 2), pack-index range validation
- [ ] New migration test for the `companies` auto-top-up columns (defaults false/null), mirroring `credit-ledger-migration.test.ts`
- [ ] Extend `tests/unit/billing/stripe-webhook.test.ts` — new `autotopup_setup` describe block; verify it does NOT fall through into subscription-mode handling (Pitfall 1)
- [ ] Extend `tests/unit/billing/topup-checkout.test.ts`'s `TOPUP_PACKS` fixture from 2 to 3 packs + `packIndex: 2` case (regression for the config change)
- [ ] Extend `tests/unit/billing/billing-config.test.ts` with `autoTopupEnabled` default assertion + new 3-pack `topUpPacks` shape
- [ ] `tests/unit/billing/topup-pack-labels-no-hardcode.test.ts` — pack labels derived from `priceCents`, never a hardcoded `"$20"` literal, mirroring the existing `pricing-ui-no-hardcode.test.ts` convention
- No framework install needed — Vitest already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end auto-top-up charge against real Stripe test-mode card | CREDITUI-07 | Off-session charging against a real Stripe test clock/card is only meaningfully provable in a live Stripe test-mode environment, not a mocked unit test | After deploy: use a Stripe test card with a saved payment method, force balance below threshold, confirm the charge appears in the Stripe test dashboard and credits land in `credit_ledger` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (autonomous run)
