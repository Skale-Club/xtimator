# Phase 116: Calibration & Charge-On Validation - Research

**Researched:** 2026-06-24
**Domain:** Billing calibration — margin-invariant math, cost-data aggregation over `ai_cost_events`, charge-on gating
**Confidence:** HIGH (everything here is verified against the actual repo code read this session; no external library surface is new)

## Summary

Phase 116 is the FINAL phase of v4.7 and is unusual: it ships a **mechanism**, not final numbers, because the data it would calibrate from (`ai_cost_events.real_cost_usd`) does not exist in production yet — the table ships in this milestone and has never run with traffic. The phase therefore delivers four artifacts: (1) a **calibration analysis helper** that aggregates `real_cost_usd` per `operation_type` and recommends grant/markup/price; (2) a **pure `validateMarginInvariant(config)` validator** that is testable NOW against the existing `BillingConfig`; (3) a **charge-on gate** that prevents `enforcementEnabled` from being flipped to `true` unless the validator passes against the config being saved; and (4) a **calibration runbook** documenting the collect→analyze→set→validate→flip sequence.

Everything is composable from primitives already in the repo. The validator is pure arithmetic over `BillingConfig` (no I/O, fully deterministic, unit-testable). The aggregation reads `ai_cost_events` via the service-role client (the table's only reader; super-admin SELECT-only RLS otherwise). The gate is a guard inside the EXISTING `saveBillingConfig` server action (`app/admin/integrations/actions.ts`) — the single write path for `enforcementEnabled`. No migration is required: `ai_cost_events`, `billing_config`, and the ledger all already exist.

**Primary recommendation:** Add `lib/billing/calibration.ts` with two pure functions (`validateMarginInvariant`, `recommendFromAggregate`) + one service-role reader (`aggregateAiCostByOperation`), wire a `validateMarginInvariant` guard into `saveBillingConfig` that rejects a `false→true` enforcement flip when any priced tier fails, ship a Node analysis script mirroring `scripts/check-pipeline-events-table.mjs`, and write a runbook. Do NOT flip `enforcementEnabled` (no production data). Scope-fence: no change to debit/credit math.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALIB-02 | Grant/markup/price are derived from measured real cost and satisfy the margin invariant (real cost of the full monthly grant ≤ ~30% of the subscription price), documented. | The margin-invariant formula + pure `validateMarginInvariant` validator (testable now), the `ai_cost_events` aggregation query (the derivation source), the `saveBillingConfig` charge-on gate (ties the validator to the enforcement flip), and the runbook (documents the numbers + the collect→analyze→set→validate→flip transition) together satisfy CALIB-02's "derived + invariant + documented" three parts. |
</phase_requirements>

## User Constraints (from locked decisions — REQUIREMENTS.md + SEED-035)

> No CONTEXT.md exists for Phase 116 (no discuss-phase run). These constraints are copied from the milestone-locked decisions and the seed's margin invariant, which bind this phase verbatim.

### Locked Decisions
- **Calibrate before charging** — measure real cost in production with billing OFF; derive grant/markup/price from data, not guesses. (REQUIREMENTS.md locked decisions; SEED-035 §"Não cobrar antes de calibrar").
- **Margin invariant (non-negotiable):** the real OpenRouter/Whisper cost of a FULL monthly grant must be ≤ ~30% of that tier's subscription price, so a power-user at 100% grant usage still profits. (SEED-035 §5 + Notas "Margem é protegida em três camadas".)
- **Markup target 4.5x** (~75–80% margin) as the starting multiplier; tune markup/grant until the invariant holds.
- **Everything super-admin-configurable** via `billing_config` — no hard-coded billing numbers, no env vars. The calibrated numbers are SAVED into `billing_config`, never committed as constants. (BILLCFG-01/03.)
- **`enforcementEnabled` defaults FALSE** and stays OFF through this phase. The milestone completes safely with enforcement still OFF (no production cost data exists to calibrate against).
- **Stripe is the rail; the credit ledger is OURS.** Calibration touches only OUR ledger/config — never Stripe metered billing.

### Claude's Discretion
- Where the validator + aggregation live (recommendation: `lib/billing/calibration.ts`).
- The exact statistic used for the recommendation (mean vs median vs p90 — recommend reporting all three; the runbook picks).
- How the gate is implemented (recommendation: an in-action guard in `saveBillingConfig`, plus a wiring test).
- Analysis tool shape (Node `.mjs` script mirroring `scripts/check-pipeline-events-table.mjs`, OR a one-shot server action/route — recommend the script for parity with existing ops tooling).
- Runbook location (`.planning/` or `docs/`).

### Deferred Ideas (OUT OF SCOPE)
- Per-operation-type markup (GRAN-01) — v2.
- Per-tier fee differentiation (GRAN-02) — v2.
- Credit rollover (GRAN-03) — v2 (current decision: no rollover).
- Actually flipping `enforcementEnabled` to true — requires real production data this phase does not have.
- Any change to the debit/credit/grant math (Phase 112 is locked).

## Standard Stack

No new libraries. Everything is in-repo primitives — this is a pure-arithmetic + existing-query phase.

### Core
| Primitive | Where | Purpose | Why Standard |
|-----------|-------|---------|--------------|
| `BillingConfig` / `DEFAULT_BILLING_CONFIG` / `getBillingConfig` | `lib/billing/billing-config.ts` | The config the validator reads (markup, creditUnitUsd, tiers{monthlyCreditGrant, subscriptionPriceCents}) | The single source of truth for every billing number; the validator is pure over this type |
| `requireServiceClient` | `lib/supabase/service.ts` | Service-role read of `ai_cost_events` (super-admin SELECT-only RLS) | Same client `record-ai-cost.ts`/`credit-ledger.ts` use; the table's only reader path |
| `saveBillingConfig` | `app/admin/integrations/actions.ts` | The SINGLE write path that can flip `enforcementEnabled` — where the gate lives | All `billing_config` writes (incl. the enforcement checkbox) go through here |
| `billingConfigSchema` | `lib/schemas/admin.ts` | zod shape already validated in `saveBillingConfig` | The gate runs AFTER `safeParse`, on `parsed.data` |
| pg + dotenv ops-script pattern | `scripts/check-pipeline-events-table.mjs` | The analysis script's skeleton (load `.env.local`, session-pooler `:5432`, query, exit code) | Established Windows-safe ops-script convention in this repo |
| vitest | `tests/unit/billing/*` | Deterministic unit tests for the validator (fixture configs, no DB) | The whole billing suite is vitest; `nyquist_validation` is ON |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node `.mjs` analysis script (direct pg) | A super-admin route/server action calling `aggregateAiCostByOperation` | The route surfaces results in the panel (nicer UX) but adds UI scope; the script matches existing ops tooling and is lower-risk for a final phase. Recommend the script; a route is an optional stretch. |
| In-action gate in `saveBillingConfig` | A separate `confirmEnableEnforcement` action + a DB migration adding a `enforcement_unlocked` flag | The separate-action route is heavier and adds a migration; the in-action guard is the smallest correct change and keeps the single-write-path invariant. Recommend the guard. |
| Reporting mean only | Reporting mean + median + p90 + count | p90 protects against under-pricing on heavy jobs; count guards against calibrating off a tiny sample. Recommend reporting all four; runbook picks the statistic. |

**Installation:** none. No `npm install`.

## The Margin-Invariant Formula (the heart of CALIB-02)

For each tier `t` with `{ monthlyCreditGrant, subscriptionPriceCents }` and global `{ markup, creditUnitUsd }`:

```
chargedValueOfGrantUsd = monthlyCreditGrant × creditUnitUsd     // what the grant is "worth" at the charged rate
realCostOfGrantUsd      = chargedValueOfGrantUsd / markup        // the actual OpenRouter/Whisper cost of the full grant
subscriptionPriceUsd    = subscriptionPriceCents / 100
ratio                   = realCostOfGrantUsd / subscriptionPriceUsd
PASS  ⟺  ratio ≤ MARGIN_INVARIANT_MAX     (default 0.30)
```

**Why this is the right formula:** a debit is `realCost × markup / creditUnitUsd` credits (see `recordCreditDebit` in `credit-ledger.ts`). Inverting: `credits × creditUnitUsd / markup = realCost`. So `monthlyCreditGrant × creditUnitUsd / markup` is exactly the real cost a tenant incurs by spending the WHOLE grant. The invariant caps that at 30% of the subscription price → the other 70% is gross AI margin even for a power-user at 100% usage.

**Worked check against the current illustrative defaults** (DEFAULT_BILLING_CONFIG, `markup 4.5`, `creditUnitUsd 0.01`):

| Tier | grant | priceCents | realCostOfGrant | 30% of price | ratio | PASS? |
|------|-------|-----------|-----------------|--------------|-------|-------|
| free | 0 | 0 | $0 | $0 | 0/0 → treat as PASS (skip: price 0) | N/A |
| trial | 2000 | 0 | $4.44 | $0 | ∞ → skip (price 0) | N/A |
| pro | 9000 | 2900 | 9000×0.01/4.5 = **$20.00** | $8.70 | **2.30** | **FAIL** |
| business | 30000 | 9900 | 30000×0.01/4.5 = **$66.67** | $29.70 | **2.24** | **FAIL** |

The illustrative defaults FAIL the invariant by design — they are placeholders. This is the proof the validator works: it must flag these as not-yet-passing, which is *correct* and is exactly why `enforcementEnabled` must stay OFF until real numbers replace them. (Matches SEED-035's own worked example, which notes $20/$49 = 41% > 30% and says "subir markup OU reduzir grant".)

**Free-tier / zero-price handling (decide in the plan):** a tier with `subscriptionPriceCents === 0` (free, trial) has no subscription revenue, so the ratio is `cost/0`. Recommend: **skip zero-price tiers** from the PASS/FAIL gate (a free tier's grant is a CAC/marketing cost, not a margin promise) but still REPORT their `realCostOfGrant` so the operator sees the free-tier burn. Document this explicitly in both the validator and the runbook. The validator should return per-tier results including a `skipped: true` marker for zero-price tiers, and the overall `pass` should be the AND over priced tiers only.

## The Aggregation Query (the derivation source)

Aggregate `ai_cost_events.real_cost_usd` per `operation_type`, **excluding NULLs** (the null-vs-0 discipline from Phase 110 — NULL means the provider returned no cost; including it as 0 would bias the mean low).

```sql
-- service-role only (super-admin SELECT RLS); run from the analysis script via pg
SELECT
  operation_type,
  COUNT(*)                                  AS n,            -- only non-null rows counted
  AVG(real_cost_usd)                        AS mean_usd,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY real_cost_usd) AS median_usd,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY real_cost_usd) AS p90_usd
FROM public.ai_cost_events
WHERE real_cost_usd IS NOT NULL            -- CRITICAL: NULL excluded, never coerced to 0
GROUP BY operation_type
ORDER BY operation_type;
```

Notes:
- `real_cost_usd IS NOT NULL` is the load-bearing clause. `AVG`/`PERCENTILE_CONT` already ignore NULLs in Postgres, but the explicit `WHERE` makes `COUNT(*)` honest (count of *measured* rows, so a tiny sample is visible) and documents the discipline.
- `operation_type` values are CHECK-constrained to `'estimate' | 'photo_batch' | 'audio_minutes' | 'price_research' | 'translation' | 'vision'` (see the migration). The four billed ops are the first four (mirrors `DebitOperationType` in `credit-ledger.ts`).
- The Supabase JS client cannot express `PERCENTILE_CONT` directly; if the aggregation lives in TS (`aggregateAiCostByOperation` reading rows via `requireServiceClient` and computing stats in JS), select `operation_type, real_cost_usd` with `.not('real_cost_usd', 'is', null)` and compute mean/median/p90 in TS (mirrors `reconcileBalance`'s "sum TS-side for testability" decision in `credit-ledger.ts`). The raw-SQL `PERCENTILE_CONT` version is for the ops `.mjs` script (direct pg). Recommend BOTH: TS aggregator for testability/reuse, SQL for the one-shot script.

**Recommendation math** (`recommendFromAggregate`, pure): given the per-op aggregate + a target tier usage profile (how many of each op a tier's grant should cover) → estimate the real cost of a representative month → derive `monthlyCreditGrant` and validate against the invariant. Keep this pure and well-documented; the operator supplies the usage profile in the runbook (e.g. "Pro = 40 estimates + 200 photos + 120 audio-min/mo"). This is the part that is genuinely illustrative until real data + a real usage profile exist — flag it LOUDLY.

## Architecture Patterns

### Recommended file layout
```
lib/billing/
├── calibration.ts                 # NEW: validateMarginInvariant (pure), recommendFromAggregate (pure),
│                                   #      aggregateAiCostByOperation (service-role read)
├── billing-config.ts              # unchanged (the config the validator reads)
└── credit-ledger.ts               # unchanged (DO NOT touch debit math)
app/admin/integrations/
└── actions.ts                     # MODIFIED: saveBillingConfig gains the charge-on gate
scripts/
└── analyze-ai-cost.mjs            # NEW: ops script (pg + dotenv), mirrors check-pipeline-events-table.mjs
tests/unit/billing/
├── calibration.test.ts            # NEW: validator + recommend math (fixture configs, deterministic)
└── billing-config-enforcement-gate.test.ts  # NEW: asserts saveBillingConfig rejects a failing flip
.planning/phases/116-.../ or docs/
└── CALIBRATION-RUNBOOK.md         # NEW: collect → analyze → set → validate → flip
```

### Pattern 1: Pure validator over BillingConfig (testable NOW, no I/O)
**What:** `validateMarginInvariant(cfg: BillingConfig, max = 0.30)` returns `{ pass: boolean; tiers: Record<BillingTier, { ratio: number; realCostOfGrantUsd: number; pass: boolean; skipped: boolean }> }`. No `import 'server-only'`, no DB — pure arithmetic so a vitest fixture can prove every branch deterministically.
**When to use:** both the gate (server) and the panel (could surface a pass/fail badge) call the same pure function. One source of truth for the invariant.
**Example (shape — verify final field names against the plan):**
```typescript
// lib/billing/calibration.ts  (NO 'server-only' — pure, reused server + client)
import type { BillingConfig, BillingTier } from '@/lib/billing/billing-config'

export const MARGIN_INVARIANT_MAX = 0.30 // SEED-035 §5: real cost of full grant ≤ ~30% of price

export type TierMarginResult = {
  realCostOfGrantUsd: number
  ratio: number          // realCostOfGrant / subscriptionPriceUsd (Infinity if price 0)
  pass: boolean
  skipped: boolean       // true for zero-price tiers (excluded from the gate)
}

export function validateMarginInvariant(
  cfg: Pick<BillingConfig, 'markup' | 'creditUnitUsd' | 'tiers'>,
  max = MARGIN_INVARIANT_MAX
): { pass: boolean; tiers: Record<BillingTier, TierMarginResult> } {
  const tierNames = Object.keys(cfg.tiers) as BillingTier[]
  const tiers = {} as Record<BillingTier, TierMarginResult>
  let overall = true
  for (const name of tierNames) {
    const t = cfg.tiers[name]
    const realCostOfGrantUsd = (t.monthlyCreditGrant * cfg.creditUnitUsd) / cfg.markup
    const priceUsd = t.subscriptionPriceCents / 100
    const skipped = priceUsd <= 0
    const ratio = skipped ? Infinity : realCostOfGrantUsd / priceUsd
    const pass = skipped ? true : ratio <= max
    if (!skipped && !pass) overall = false
    tiers[name] = { realCostOfGrantUsd, ratio, pass, skipped }
  }
  return { pass: overall, tiers }
}
```

### Pattern 2: In-action charge-on gate (the smallest correct change)
**What:** inside `saveBillingConfig`, AFTER `safeParse` succeeds and BEFORE the upsert, if the incoming config sets `enforcementEnabled: true`, run `validateMarginInvariant(parsed.data)` and reject the save (`return { ok: false, message: ... }`) when `pass === false`. A save that leaves enforcement OFF is never gated (you can always save illustrative numbers while OFF).
**Why this placement:** `saveBillingConfig` is the *only* write path for `enforcementEnabled` (the checkbox in `billing-config-form.tsx` posts the full config through it). Gating here means there is no way to persist `enforcementEnabled: true` against a failing config — the invariant is enforced at the single chokepoint, not by convention.
**Example:**
```typescript
// app/admin/integrations/actions.ts — inside saveBillingConfig, after safeParse:
if (parsed.data.enforcementEnabled) {
  const check = validateMarginInvariant(parsed.data)
  if (!check.pass) {
    const failing = (Object.entries(check.tiers) as [string, TierMarginResult][])
      .filter(([, r]) => !r.skipped && !r.pass)
      .map(([name, r]) => `${name} (${(r.ratio * 100).toFixed(0)}% > 30%)`)
      .join(', ')
    return {
      ok: false,
      message: `Cannot enable charging: margin invariant fails for ${failing}. Lower the grant or raise the markup until the real cost of each tier's full grant is ≤ 30% of its price.`,
    }
  }
}
```
**Wiring test (the assertion CALIB-02 needs):** a unit test that calls `saveBillingConfig` with a known-FAILING config + `enforcementEnabled: true` and asserts (a) `ok: false`, (b) NO upsert happened (the mock service client's `.upsert` was not called). Plus the inverse: a PASSING config + `enforcementEnabled: true` upserts successfully. This proves the validator is *wired to* the enforcement decision, not merely present.

### Pattern 3: TS aggregator + ops script (two consumers of one query)
**What:** `aggregateAiCostByOperation()` (in `calibration.ts`, `import 'server-only'`, never-throw) reads non-null cost rows via `requireServiceClient`, computes mean/median/p90/count per op in TS. The `.mjs` script either calls into the built code or runs the raw `PERCENTILE_CONT` SQL via pg and prints a table + the derived recommendation.
**When to use:** the script is the operator's tool during the calibration window; the TS aggregator is the testable, reusable core (and a future panel surface).

### Anti-Patterns to Avoid
- **Coercing NULL cost to 0 in the aggregate** (`?? 0`). Phase 110's entire null-vs-0 discipline exists to keep these out of the mean. Use `WHERE real_cost_usd IS NOT NULL` / `.not('real_cost_usd','is',null)`.
- **Hard-coding the calibrated numbers as constants.** The output of calibration is SAVED into `billing_config` via the panel/`saveBillingConfig`, never committed to `DEFAULT_BILLING_CONFIG`. The defaults stay illustrative.
- **Touching `recordCreditDebit` / debit math.** Locked. Phase 116 reads config + cost; it does not change how credits are computed.
- **Flipping `enforcementEnabled` to true in this phase.** No production data exists. The gate makes a failing flip impossible; the runbook documents the real flip for later.
- **Putting `'server-only'` on the pure validator.** It must be importable by a client panel badge AND the server gate; keep it pure (the aggregator is the server-only part).
- **Gating the free/trial (zero-price) tiers as FAIL.** A zero subscription price makes the ratio infinite by arithmetic, not by a margin failure — skip priced-at-0 tiers from the gate but report their burn.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service-role DB access | A new Supabase client | `requireServiceClient` (`lib/supabase/service.ts`) | Same path the ledger + cost capture use; respects the super-admin RLS posture |
| Config read/merge | A bespoke metadata reader | `getBillingConfig()` / `DEFAULT_BILLING_CONFIG` | Already null-safe, cached, deep-merges tiers (Pitfall-6 handled) |
| `enforcementEnabled` write path | A new action/route | The existing `saveBillingConfig` | It is the single write path; gate there |
| Ops DB script skeleton | A new connection/env loader | `scripts/check-pipeline-events-table.mjs` pattern (pg + dotenv + `:5432` session pooler) | Windows-safe, proven, no psql dependency |
| zod validation of the saved config | A second validator | `billingConfigSchema` (already run in `saveBillingConfig`) | The gate runs on `parsed.data` AFTER it |

**Key insight:** this phase is 90% pure arithmetic + one read query + one guard. The temptation is to over-build (new tables, new actions, a migration). The correct shape is one new pure module, one guard line-block in an existing action, one ops script, and a doc.

## Common Pitfalls

### Pitfall 1: Including NULL costs in the mean
**What goes wrong:** the recommended grant comes out too low because NULL (unknown provider cost) rows were counted as $0.
**Why it happens:** habitual `?? 0`.
**How to avoid:** `WHERE real_cost_usd IS NOT NULL`; in TS use `.not('real_cost_usd','is',null)` and filter before averaging. Assert in a test that a NULL-cost fixture row is excluded from `n` and the mean.
**Warning signs:** `n` in the aggregate is much larger than the number of rows that actually carried a cost; mean trending toward 0.

### Pitfall 2: Division-by-zero on free/trial tiers
**What goes wrong:** `realCostOfGrant / (0/100)` = `Infinity` or `NaN`; the gate either crashes or marks free as FAIL and blocks every save.
**Why it happens:** free/trial have `subscriptionPriceCents: 0`.
**How to avoid:** branch on `priceUsd <= 0` → `skipped: true`, excluded from the overall `pass`. Test both a zero-price tier (skipped) and a priced tier (gated).
**Warning signs:** enabling enforcement is impossible even with sane pro/business numbers because free dragged `pass` to false.

### Pitfall 3: Gate placed where enforcement can still be flipped around it
**What goes wrong:** a future code path sets `enforcementEnabled` without going through the guard.
**Why it happens:** the guard lives in the form, or in a helper that not every writer calls.
**How to avoid:** put the guard in `saveBillingConfig` (the single server write path) and add a test asserting the upsert does NOT fire on a failing flip. Optionally add a static guard test (grep) that no other production module writes `provider: 'billing_config'` with enforcement true.
**Warning signs:** a second `from('platform_integrations').upsert({ provider: 'billing_config' ...})` appears anywhere outside `saveBillingConfig`.

### Pitfall 4: Money/percentage unit confusion
**What goes wrong:** treating `subscriptionPriceCents` as dollars, or `markup`/`estimateFeePct` inconsistently.
**Why it happens:** the config mixes integer cents (`subscriptionPriceCents`, `priceCents`, `estimateFeeMinCents`) with 0..1 decimals (`estimateFeePct`) and a bare multiplier (`markup`) and USD floats (`creditUnitUsd`, `whisperUsdPerMinute`). `lib/schemas/admin.ts` documents "MONEY is INTEGER CENTS; PERCENTAGES are 0..1 decimals."
**How to avoid:** divide `subscriptionPriceCents` by 100 once, name the variable `...Usd`, and unit-test the ratio against the worked example ($20/$8.70 = 2.30 for the default pro tier).
**Warning signs:** a ratio off by 100×.

### Pitfall 5: Calibrating off a tiny / non-representative sample
**What goes wrong:** the recommendation is derived from 12 estimates during a staging smoke test and is wildly wrong at scale.
**Why it happens:** there is no production data yet; whoever runs the script early gets noise.
**How to avoid:** the aggregate MUST report `n` per op; the runbook sets a minimum sample threshold (e.g. ≥ N weeks AND ≥ M rows per billed op) before the numbers are trusted. Report p90 alongside mean so heavy jobs aren't averaged away.
**Warning signs:** low `n`; mean and median far apart; p90 ≫ mean.

### Pitfall 6: The illustrative defaults FAIL the invariant — that's expected, don't "fix" them
**What goes wrong:** someone sees pro/business FAIL with the default numbers and edits `DEFAULT_BILLING_CONFIG` to make the test green.
**Why it happens:** misreading a correct FAIL as a bug.
**How to avoid:** the validator test should ASSERT the current defaults FAIL (locking the behavior) and assert a hand-crafted passing fixture PASSES. The defaults stay illustrative until real calibration replaces them in `billing_config` (not in code).
**Warning signs:** a PR changing `DEFAULT_BILLING_CONFIG` grant/markup numbers "to pass calibration."

## Code Examples

### Service-role aggregation (TS, testable, never-throw)
```typescript
// lib/billing/calibration.ts (the server-only aggregator portion)
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

export type OpCostStat = { operationType: string; n: number; meanUsd: number; medianUsd: number; p90Usd: number }

export async function aggregateAiCostByOperation(): Promise<OpCostStat[]> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('ai_cost_events')
      .select('operation_type, real_cost_usd')
      .not('real_cost_usd', 'is', null)   // Pitfall 1: NULL excluded, never coerced to 0
    const rows = (data as Array<{ operation_type: string; real_cost_usd: number }> | null) ?? []
    const byOp = new Map<string, number[]>()
    for (const r of rows) {
      const arr = byOp.get(r.operation_type) ?? []
      arr.push(Number(r.real_cost_usd))
      byOp.set(r.operation_type, arr)
    }
    return [...byOp.entries()].map(([operationType, costs]) => {
      const sorted = [...costs].sort((a, b) => a - b)
      const mean = sorted.reduce((s, c) => s + c, 0) / sorted.length
      const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
      return { operationType, n: sorted.length, meanUsd: mean, medianUsd: pct(0.5), p90Usd: pct(0.9) }
    }).sort((a, b) => a.operationType.localeCompare(b.operationType))
  } catch {
    return []  // never-throw: a calibration read failure must not break anything
  }
}
```
*(Source: composed from the read patterns in `lib/billing/credit-ledger.ts` `reconcileBalance` + the `ai_cost_events` shape in `supabase/migrations/20260624000003_phase110_ai_cost_events.sql`.)*

### Raw-SQL variant for the ops script
```javascript
// scripts/analyze-ai-cost.mjs — skeleton from scripts/check-pipeline-events-table.mjs
// (pg.Client over the :5432 session pooler, DATABASE_URL from .env.local)
const { rows } = await client.query(`
  SELECT operation_type,
         COUNT(*) AS n,
         AVG(real_cost_usd) AS mean_usd,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY real_cost_usd) AS median_usd,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY real_cost_usd) AS p90_usd
  FROM public.ai_cost_events
  WHERE real_cost_usd IS NOT NULL
  GROUP BY operation_type
  ORDER BY operation_type
`)
console.table(rows)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (in-repo; whole `tests/unit/billing/` suite) |
| Config file | `vitest.config.ts` (existing; not read this session but the suite runs via `npx vitest run`) |
| Quick run command | `npx vitest run tests/unit/billing/calibration.test.ts tests/unit/billing/billing-config-enforcement-gate.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALIB-02 | `validateMarginInvariant` computes ratio per tier; PASS ⟺ ≤0.30 | unit | `npx vitest run tests/unit/billing/calibration.test.ts` | ❌ Wave 0 |
| CALIB-02 | Default illustrative config FAILS pro/business (locks the correct-FAIL) | unit | same file | ❌ Wave 0 |
| CALIB-02 | A hand-crafted passing fixture PASSES; zero-price tiers `skipped` | unit | same file | ❌ Wave 0 |
| CALIB-02 | `aggregateAiCostByOperation` excludes NULL cost rows; mean/median/p90/n | unit (mocked service client) | same file | ❌ Wave 0 |
| CALIB-02 | `saveBillingConfig` REJECTS `enforcementEnabled:true` on a failing config (no upsert) | unit | `npx vitest run tests/unit/billing/billing-config-enforcement-gate.test.ts` | ❌ Wave 0 |
| CALIB-02 | `saveBillingConfig` ALLOWS the flip on a passing config (upsert fires) | unit | same file | ❌ Wave 0 |
| CALIB-02 | Saving with enforcement OFF is never gated (illustrative numbers OK) | unit | same file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/calibration.test.ts tests/unit/billing/billing-config-enforcement-gate.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/billing` (+ confirm `measure-only-invariant.test.ts` + `billing-config.test.ts` still green — the calibration module is a NEW `getBillingConfig`/service consumer; expect to extend the Phase-111 dormancy allowlist as every prior v4.7 plan did)
- **Phase gate:** full `npx vitest run` green + `tsc --noEmit -p tsconfig.json` clean before `/gsd:verify-work 116`

### Wave 0 Gaps
- [ ] `tests/unit/billing/calibration.test.ts` — covers CALIB-02 validator + aggregator
- [ ] `tests/unit/billing/billing-config-enforcement-gate.test.ts` — covers CALIB-02 gate wiring (the assertion that the validator is wired to the enforcement decision)
- [ ] No framework install needed (vitest present)
- [ ] **Heads-up (not a test gap):** adding a `getBillingConfig`/service-role consumer in `calibration.ts` will trip the Phase-111 `BILLCFG-03` dormancy guard in `billing-config.test.ts` (ALLOWLIST). Every v4.7 plan extended this allowlist; do the same (the guard still fails on any OTHER consumer). This is the documented expected RED→GREEN.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ai_cost_events` table (remote) | The aggregation query / analysis script | Authored, NOT yet confirmed applied to remote | — | The validator + gate + tests need NO DB (pure/mocked); the script simply returns empty until the migration is applied + traffic flows. Phase ships regardless. |
| Production cost data (`real_cost_usd` rows) | FINAL calibrated numbers | ✗ (no prod traffic yet) | — | Ship the MECHANISM; numbers stay illustrative; runbook documents collecting data later. |
| `DATABASE_URL` in `.env.local` | The `.mjs` analysis script (local run) | ✓ assumed (used by all `apply-migration-*.mjs`) | — | Script is operator-run, not CI; not on the build path |
| vitest | Unit tests | ✓ | in-repo | — |
| pg + dotenv | Analysis script | ✓ (used by `scripts/check-pipeline-events-table.mjs`) | in-repo | — |

**Missing dependencies with no fallback:** none that block this phase. The phase is explicitly designed to ship the mechanism WITHOUT production data.

**Missing dependencies with fallback:** production cost data → fall back to illustrative numbers + the runbook (the entire point of the phase).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Count-based tiers (`maxEstimatesPerMonth`) as the limit | Credit ledger (`real cost × markup`) with count as secondary guard-rail | v4.7 (phases 110–115, MIG-01) | Calibration sets the credit numbers; counts degrade to anti-abuse rails |
| Guessed billing numbers in the seed | Numbers DERIVED from measured `ai_cost_events` + validated against the 30% invariant | This phase (CALIB-02) | The seed's $49/4.5x/9000 are explicitly illustrative; real numbers come from data |

**Deprecated/outdated:** none. `enforcementEnabled` stays `false`; nothing is being turned on.

## Open Questions

1. **What usage profile defines "a representative month" per tier for `recommendFromAggregate`?**
   - What we know: the aggregate gives per-op real cost; the grant must cover a tier's expected monthly mix of ops.
   - What's unclear: the op-count mix per tier (e.g. how many estimates/photos/audio-min a Pro user does/month) — unknown without production usage data.
   - Recommendation: make `recommendFromAggregate` take the usage profile as an explicit parameter; the runbook supplies it (initially a documented guess, later from `usage_events` analysis). Flag the recommendation as illustrative until both cost data AND a measured usage profile exist.

2. **Should the analysis be a Node `.mjs` script, a super-admin route, or both?**
   - What we know: the script matches existing ops tooling and is lowest-risk; a route would surface results in the panel.
   - What's unclear: whether the operator wants in-panel calibration UX now.
   - Recommendation: ship the `.mjs` script (parity, low risk) + the pure `aggregateAiCostByOperation` TS function. A panel "Calibration" tab is an optional stretch / v2.

3. **Runbook location: `.planning/` vs `docs/`?**
   - What we know: planning artifacts live in `.planning/`; a runbook is operational.
   - Recommendation: `.planning/phases/116-.../CALIBRATION-RUNBOOK.md` (co-located with the phase) OR `docs/` if the repo has a docs dir. Either is fine; decide in the plan. NO SECRETS in it (CLAUDE.md) — use placeholders if any connection string is referenced.

## Project Constraints (from CLAUDE.md)

- **No secrets in any file, including `.planning/` docs and the runbook.** Use placeholders (`whsec_<...>`, `sk_live_<...>`). The runbook must reference `DATABASE_URL` from `.env.local`, never a literal value. gitleaks pre-commit hook will block leaks.
- **GSD workflow enforcement:** all edits go through the phase execution flow (no ad-hoc edits).
- **Deploy is CI→GHCR→Coolify**, never build on the VPS. The `ai_cost_events` migration (already authored, Phase 110) reaches remote via that pipeline; this phase authors NO new migration.
- **Service role key never in the browser; all DB-mutating/reading of restricted tables server-side.** The aggregator is `server-only`; the validator is pure (no secrets, safe to share with a client badge).
- **Never-throw on runtime side effects** — the aggregator catches and returns `[]`; the gate returns `{ ok: false, message }` (a controlled rejection, not a throw, matching `saveBillingConfig`'s style).
- **TypeScript strict.** Type the validator result fully; no `any`.

## Sources

### Primary (HIGH confidence — all read this session from the repo)
- `lib/billing/billing-config.ts` — `BillingConfig` shape, `DEFAULT_BILLING_CONFIG`, `getBillingConfig`, `enforcementEnabled` default false, tier `{monthlyCreditGrant, subscriptionPriceCents}`.
- `lib/billing/credit-ledger.ts` — the debit formula `round(realCostUsd × markup / creditUnitUsd)` that the invariant inverts; `checkCredits` gated by `enforcementEnabled`; never-throw + reconcile patterns.
- `supabase/migrations/20260624000003_phase110_ai_cost_events.sql` — `ai_cost_events` columns, NULLABLE `real_cost_usd`, operation_type CHECK, super-admin SELECT RLS, indexes.
- `app/admin/integrations/actions.ts` — `saveBillingConfig` (the single write path / gate site) + the metadata-only upsert pattern.
- `lib/schemas/admin.ts` — `billingConfigSchema`, "MONEY is INTEGER CENTS; PERCENTAGES are 0..1 decimals."
- `app/admin/integrations/billing-config-form.tsx` — the `enforcementEnabled` checkbox + full-config POST through `saveBillingConfig`.
- `.planning/REQUIREMENTS.md` — CALIB-02, locked decisions, "calibrate before charging."
- `.planning/seeds/SEED-035-credit-based-subscription-billing.md` — the 30% margin invariant, three-layer margin protection, the worked example, "não cobrar antes de calibrar."
- `.planning/phases/110-.../110-01-SUMMARY.md` + `112-02/112-03-SUMMARY.md` — null-vs-0 discipline, measure-only guard, `enforcementEnabled` history.
- `scripts/check-pipeline-events-table.mjs` — the ops-script skeleton (pg + dotenv + `:5432` session pooler, Windows-safe).

### Secondary (MEDIUM)
- `.planning/STATE.md` Accumulated Context — the dormancy-allowlist pattern every v4.7 plan applied (expect to apply again for the new `getBillingConfig` consumer).

### Tertiary (LOW)
- None. This phase needed no external/web sources — it is entirely in-repo arithmetic + existing queries.

## Metadata

**Confidence breakdown:**
- Margin-invariant formula: HIGH — derived directly from `recordCreditDebit`'s debit math (inverse) and cross-checked against SEED-035's own worked example.
- Aggregation query: HIGH — `ai_cost_events` shape + null-vs-0 discipline both read from source.
- Gate placement: HIGH — `saveBillingConfig` confirmed as the single write path for `enforcementEnabled`.
- Recommendation math (`recommendFromAggregate` usage profile): MEDIUM — the per-op aggregation is certain, but the tier usage profile is genuinely unknown without production data (Open Question 1).
- Test strategy: HIGH — mirrors the existing `tests/unit/billing/*` conventions (pure-function + mocked-service-client).

**Research date:** 2026-06-24
**Valid until:** 30 days (stable — pure in-repo arithmetic; only invalidated if the `BillingConfig`/`ai_cost_events`/`credit-ledger` shapes change)
