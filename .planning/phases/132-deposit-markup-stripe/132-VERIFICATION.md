---
phase: 132-deposit-markup-stripe
verified: 2026-06-25T09:13:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 132: Deposit + Markup + Stripe Contract Verification Report

**Phase Goal:** Activate the dormant deposit/balance_due scaffold (DEP-01), thread the server-computed deposit into the Stripe 1%-fee charge contract (DEP-02), and add server-derived cost/markup pricing (MARK-01) — all server-side/deterministic, AI never computes, byte-identical retrocompat.

**Verified:** 2026-06-25T09:13:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | DEP-01: `compute-totals.ts` computes deposit + balanceDue AFTER grandTotal per LOCKED sequence; engine persists `deposit_type/deposit_value/balance_due` (replacing dormant null/null/null); `deposit_type='none'` byte-identical; deposit golden (percent + amount) passes | ✓ VERIFIED | compute-totals.ts L177-190 LOCKED sequence after grandTotal; generate-estimate.ts L441-443 persists `deposit_type:'none' / deposit_value:null / balance_due:safeBalanceDue`; deposit-totals.test.ts goldens 275/825, 400/700, 0/1100, -400 all green |
| 2 | DEP-02: pure `resolveChargeAmount` resolves deposit-aware charge; 1% fee computes on charged amount via EXISTING `computeApplicationFee`; wired into `invoice.ts` generateInvoice; charge-amount golden passes | ✓ VERIFIED | charge-amount.ts pure helper (no server-only/DB); invoice.ts L121 calls resolveChargeAmount, L149 unchanged computeApplicationFee on amountCents; charge-amount.test.ts: deposit→1% of deposit (250/400), none→1% of grandTotal (1000), clamp green |
| 3 | MARK-01: optional `cost`+`markup_pct` AI inputs in schema/types/both providers; server derives `unit_price = round2(cost×(1+markup_pct/100))` with locked precedence (explicit unit_price>0 wins); persists cost+markup_pct; AI never computes (ENG-01 green) | ✓ VERIFIED | schema.ts L42-43, types.ts L26-27, anthropic.ts (4), gemini.ts (4); compute-totals.ts L99-105 derivation with explicit-wins guard; generate-estimate.ts L501-502 persistence; markup-totals.test.ts derive 100→200, explicit-wins 500, retrocompat green; no-ai-calculator ENG-01 green |
| 4 | RETROCOMPAT: ALL goldens byte-identical when deposit=none & no markup; GUARD-03 totals-authority green | ✓ VERIFIED | pricing-retrocompat 850.99/85.1/936.09, per-category-tax 40/1540, discount-totals 1440/1890/1296, deposit-totals, charge-amount, totals-authority (7/7) all green |
| 5 | SECRETS: no real Stripe keys anywhere (placeholders only) | ✓ VERIFIED | grep for `sk_(live\|test)_`, `whsec_`, `sk-ant-` across all touched lib + test files → 0 matches |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/estimate/compute-totals.ts` | deposit + balanceDue + markup resolution | ✓ VERIFIED | LOCKED deposit sequence L182-188; markup resolution L99-105; returns deposit/balanceDue L190 |
| `lib/services/generate-estimate.ts` | persists deposit_type/deposit_value/balance_due + cost/markup_pct | ✓ VERIFIED | L441-443 deposit cols; L501-502 cost/markup_pct per item |
| `lib/billing/charge-amount.ts` | pure resolveChargeAmount | ✓ VERIFIED | Pure module, percent/amount/none + clamp |
| `lib/actions/invoice.ts` | deposit kind reads deposit_type/deposit_value | ✓ VERIFIED | select extended L82; resolveChargeAmount wired L121; fee unchanged L149 |
| `lib/ai/schema.ts` + `types.ts` + both providers | optional cost + markup_pct inputs | ✓ VERIFIED | All carry markup_pct (no .default) |
| deposit/markup/charge-amount test files | hand-computed goldens | ✓ VERIFIED | All 4 test files exist, assertions hand-computed |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| compute-totals.ts | generate-estimate.ts | deposit/balanceDue destructured + balance_due persisted | ✓ WIRED | L344-345 destructure, L443 persist |
| compute-totals.ts | generate-estimate.ts | resolved unit_price + markup_pct persisted | ✓ WIRED | L501-502 |
| charge-amount.ts | invoice.ts | resolveChargeAmount supplies amountCents; computeApplicationFee on it | ✓ WIRED | L121 + L149 |
| schema.ts | types.ts | markup_pct mirror | ✓ WIRED | Both present |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Deposit golden (percent + amount + none + edge) | vitest deposit-totals | 275/825, 400/700, 0/1100, -400 | ✓ PASS |
| Charge-amount + 1% fee golden | vitest charge-amount | 25000/250, 40000/400, 100000/1000, clamp | ✓ PASS |
| Markup golden | vitest markup-totals | derive 100→200, explicit-wins 500, retrocompat | ✓ PASS |
| ENG-01 AI-never-computes fence | vitest no-ai-calculator | green | ✓ PASS |
| GUARD-03 totals authority | vitest totals-authority | 7/7 | ✓ PASS |
| Retrocompat goldens | vitest pricing-retrocompat/per-category-tax/discount-totals | byte-identical | ✓ PASS |
| Full suite | npx vitest run | 2408 passed, 1 known flake (passes in isolation) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DEP-01 | 132-01 | deposit_type/value → server-computed balance_due | ✓ SATISFIED | Truth 1 |
| DEP-02 | 132-03 | deposit is Stripe-charged amount; 1% fee on charged amount | ✓ SATISFIED | Truth 2 |
| MARK-01 | 132-02 | server-derived unit_price from cost × (1+markup) | ✓ SATISFIED | Truth 3 |

### Anti-Patterns Found

None blocking. `void deposit` in generate-estimate.ts L359 is an intentional, documented binding kept to honor the LOCKED return contract while deposit_value persists null at generation (no deposit input exists until Phase 133). Not a stub — balance_due persists the real computed value.

### Full Suite Result

`npx vitest run`: **2408 passed, 1 failed, 2 skipped, 33 todo** (2444 tests / 352 files).

The single failure — `tests/unit/mcp-route-contract.test.ts` "GET returns 405" — is the documented KNOWN non-blocking parallel-only flake (timeout under parallel load). Re-run in isolation: **8/8 passed**. It is the ONLY failure and is unrelated to phase 132. Per the established protocol, the suite is treated as GREEN.

### Human Verification Required

None. All goal-backward checks are deterministically verifiable (server-side math + persistence shape + unit goldens). Deposit-setting UI and PDF rendering are explicitly deferred to Phases 133/134.

### Gaps Summary

No gaps. All three requirements (DEP-01, DEP-02, MARK-01) are implemented per the LOCKED sequence, wired end-to-end (compute → persist → charge), proven by hand-computed goldens, retrocompat byte-identical, ENG-01/GUARD-03 fences green, and no secrets present.

---

_Verified: 2026-06-25T09:13:00Z_
_Verifier: Claude (gsd-verifier)_
