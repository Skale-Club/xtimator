# Calibration Runbook — Charge-On Validation (CALIB-02)

The operator procedure for turning real credit charging ON safely: measure real
cost in production, derive grant/markup/price from data, validate the margin
invariant, then flip `enforcementEnabled`. This is the "documented" half of
CALIB-02; the charge-on gate inside `saveBillingConfig` is the enforced half.

> Phase 116 ships the MECHANISM only. It does NOT flip `enforcementEnabled`. No
> production cost data exists yet. The milestone completes SAFELY with enforcement
> OFF. Execute this runbook later, against real data, to flip charging on.

---

## Status: ILLUSTRATIVE, enforcement OFF

The current `DEFAULT_BILLING_CONFIG` numbers (`lib/billing/billing-config.ts`)
are **illustrative placeholders, not final numbers**. They intentionally FAIL the
margin invariant by design:

- `pro` — grant 9000 credits @ $29: real cost of grant ≈ $20 → ratio ≈ 0.69 (FAIL)
- `business` — grant 30000 credits @ $99: real cost of grant ≈ $67 → ratio ≈ 0.67 (FAIL)

`enforcementEnabled` is `false` and **stays false** until this runbook is executed
against real measured cost. Because the charge-on gate rejects any `false→true`
flip while the invariant fails, the illustrative defaults can be saved (and edited)
freely while enforcement is OFF, but charging can never be turned on against them.

The calibrated numbers are SAVED into `billing_config` via the super-admin Billing
panel (`saveBillingConfig`) — they are NEVER committed back into
`DEFAULT_BILLING_CONFIG`. The defaults remain illustrative.

---

## The margin invariant

For each PRICED tier, the real OpenRouter/Whisper cost of spending the entire
monthly credit grant must be ≤ 30% of the subscription price:

```
realCostOfGrantUsd = (monthlyCreditGrant × creditUnitUsd) / markup
ratio              = realCostOfGrantUsd / (subscriptionPriceCents / 100)
PASS iff ratio ≤ 0.30   (per priced tier)
```

`realCostOfGrant` is the exact inverse of the credit-ledger debit math
(`credits = round(realCost × markup / creditUnitUsd)`). Zero-price tiers
(`free`, `trial`) have no subscription revenue to measure a margin against and
are SKIPPED (their grant burn is still reported, but they never gate the flip).
The overall pass is the AND over priced tiers only.

The validator is `validateMarginInvariant` (`lib/billing/calibration.ts`), a pure
function. The Billing panel save action (`saveBillingConfig`) calls it as the
charge-on gate — a config that fails the invariant CANNOT enable charging.

---

## Step 1 — COLLECT

Run measure-only (enforcement OFF) in production for ≥ N weeks until each billed
operation has a representative sample. The billed ops are:

- `estimate`
- `photo_batch`
- `audio_minutes`
- `price_research`

Set a minimum sample threshold per op (e.g. n ≥ 200 measured rows) before trusting
the aggregate. Keep collecting if any of these hold for an op:

- low `n` (small sample — noisy mean)
- `mean ≠ median` (skewed distribution — the mean is dragged by outliers)
- `p90 ≫ mean` (bursty / heavy-tail cost — a usage profile built on the mean will
  under-provision the margin for heavy users)

Cost is captured per AI call into `ai_cost_events.real_cost_usd`. NULL means the
provider returned no cost (e.g. Gemini, or an unknown Whisper rate) — those rows
are excluded from the aggregate, never coerced to 0.

## Step 2 — ANALYZE

Run the operator analysis script:

```
node scripts/analyze-ai-cost.mjs
```

It reads `DATABASE_URL` from `.env.local` (NEVER paste the connection string into
this runbook or the script) and prints, per `operation_type`, the count `n` plus
mean / median / p90 real cost over MEASURED (non-null) rows. Use the mean (and
watch the p90 for skew) as the per-operation cost input to Step 3.

## Step 3 — SET

In the super-admin Billing panel, set, from the measured cost × a documented
per-tier usage profile:

- `markup` (global multiplier)
- per-tier `monthlyCreditGrant`
- per-tier `subscriptionPriceCents`

The usage profile is a per-tier estimate of monthly op counts (e.g. "Pro = 40
estimates + 200 photo_batch + 120 audio_minutes / mo"). It is a documented GUESS
until a `usage_events` per-tier analysis exists — **record the assumed profile
here** when you run this so the chosen grants are reproducible:

| Tier | estimates/mo | photo_batch/mo | audio_minutes/mo | price_research/mo | (record actual values when set) |
| ---- | ------------ | -------------- | ---------------- | ----------------- | ------------------------------- |
| pro  | _TBD_        | _TBD_          | _TBD_            | _TBD_             |                                 |
| business | _TBD_    | _TBD_          | _TBD_            | _TBD_             |                                 |

`recommendFromAggregate` (`lib/billing/calibration.ts`) computes an estimated
monthly real cost from the per-op aggregate × this profile to help size the grant.

## Step 4 — VALIDATE

Confirm `validateMarginInvariant` passes for `pro` AND `business`. The Billing
panel's charge-on gate enforces this: a config whose priced tiers exceed the 30%
ratio CANNOT enable charging — `saveBillingConfig` returns `ok:false` with the
failing tier(s) and does not persist the flip. Adjust grant ↓ or markup ↑ (or
price ↑) until both priced tiers pass.

## Step 5 — FLIP

Only after Step 4 passes, set `enforcementEnabled: true` via the Billing panel.
The gate rejects the flip if the invariant fails, so this step can only succeed
against a calibrated config.

> DO NOT flip in Phase 116 — no production data exists. Run Steps 1–5 later,
> against real measured cost, to turn charging on.
