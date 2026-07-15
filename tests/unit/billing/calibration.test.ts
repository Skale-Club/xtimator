import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 116-01 — calibration core (CALIB-02).
 *
 * Locks the contract of lib/billing/calibration.ts BEFORE its implementation
 * (Task 1 — RED). Four behaviour groups:
 *   - CORRECT-FAIL: validateMarginInvariant(DEFAULT_BILLING_CONFIG) FAILS on pro
 *     + business by design (the illustrative defaults are placeholders). The test
 *     ASSERTS the FAIL — the defaults are NOT edited to make it green.
 *   - PASSING FIXTURE: a hand-crafted calibrated config PASSES the invariant.
 *   - SKIP: zero-price tiers (free, trial) are skipped, not marked FAIL, and do
 *     NOT drag the overall pass to false.
 *   - AGGREGATOR: aggregateAiCostByOperation reads ai_cost_events via the service
 *     client, EXCLUDES NULL real_cost_usd rows, reports mean/median/p90/n per
 *     operation_type, and NEVER throws (returns [] on a read failure).
 *
 * The service client is mocked (mirrors credit-ledger.test.ts). NO DB, NO
 * network, NO secrets — pure deterministic unit tests.
 */

// ---- service-client mock (requireServiceClient) -----------------------------
// A mutable holder lets each test choose what requireServiceClient() returns:
// a chainable stub whose .from().select().not() resolves { data, error }, OR a
// thrower (to prove the never-throw guard).
let serviceClientImpl: () => unknown = () => makeServiceClient([])

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientImpl(),
}))

/**
 * Chainable supabase fake. The .not('real_cost_usd','is',null) filter is applied
 * IN the query, so this fake returns the ALREADY-FILTERED rows the caller passes.
 *
 * Phase 152 (CREDITUI-05): also supports an optional `.eq('company_id', id)`
 * link BEFORE `.not(...)`, matching the real Supabase chain shape
 * `.select().eq().not()` used when aggregateAiCostByOperation is called with a
 * companyId. `onEq` lets a test assert the exact companyId the chain received.
 */
function makeServiceClient(
  rows: Array<{ operation_type: string; real_cost_usd: number }>,
  onEq?: (col: string, val: unknown) => void
) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            not(_col: string, _op: string, _val: unknown) {
              return Promise.resolve({ data: rows, error: null })
            },
            eq(_col: string, _val: unknown) {
              onEq?.(_col, _val)
              return {
                not(_col2: string, _op: string, _val2: unknown) {
                  return Promise.resolve({ data: rows, error: null })
                },
              }
            },
          }
        },
      }
    },
  }
}

function makeThrowingClient() {
  return {
    from() {
      throw new Error('service client exploded')
    },
  }
}

// ---- imports under test (after the mock) ------------------------------------
import {
  validateMarginInvariant,
  aggregateAiCostByOperation,
  recommendFromAggregate,
  MARGIN_INVARIANT_MAX,
} from '@/lib/billing/calibration'
import { DEFAULT_BILLING_CONFIG } from '@/lib/billing/billing-config'

beforeEach(() => {
  serviceClientImpl = () => makeServiceClient([])
})

// =============================================================================
// CALIB-02 — the margin-invariant constant
// =============================================================================
describe('CALIB-02: MARGIN_INVARIANT_MAX', () => {
  it('is 0.30 (real cost of full grant ≤ 30% of price)', () => {
    expect(MARGIN_INVARIANT_MAX).toBe(0.3)
  })
})

// =============================================================================
// CALIB-02 — Billing v2: the shipped defaults SATISFY the invariant.
// Enforcement now defaults ON, so the default grants are sized margin-safe
// (grant real cost ≤ 30% of price) — otherwise the admin could never save the
// defaults with charging enabled. Still calibration placeholders.
// =============================================================================
describe('CALIB-02: validateMarginInvariant(DEFAULT_BILLING_CONFIG) — margin-safe defaults', () => {
  it('overall pass is TRUE (defaults are internally consistent with enforcement ON)', () => {
    const res = validateMarginInvariant(DEFAULT_BILLING_CONFIG)
    expect(res.pass).toBe(true)
  })

  it('pro passes: realCost $7.7778, ratio 7.7778/29 ≈ 0.268 ≤ 0.30', () => {
    const res = validateMarginInvariant(DEFAULT_BILLING_CONFIG)
    // 3500 × 0.01 / 4.5 = 7.7778
    expect(res.tiers.pro.realCostOfGrantUsd).toBeCloseTo(7.7778, 3)
    expect(res.tiers.pro.ratio).toBeCloseTo(0.2682, 3)
    expect(res.tiers.pro.pass).toBe(true)
    expect(res.tiers.pro.skipped).toBe(false)
  })

  it('business passes: realCost $26.6667, ratio 26.6667/99 ≈ 0.269 ≤ 0.30', () => {
    const res = validateMarginInvariant(DEFAULT_BILLING_CONFIG)
    // 12000 × 0.01 / 4.5 = 26.6667
    expect(res.tiers.business.realCostOfGrantUsd).toBeCloseTo(26.6667, 3)
    expect(res.tiers.business.ratio).toBeCloseTo(0.2694, 3)
    expect(res.tiers.business.pass).toBe(true)
    expect(res.tiers.business.skipped).toBe(false)
  })
})

// =============================================================================
// CALIB-02 — zero-price tiers are SKIPPED, never FAIL
// =============================================================================
describe('CALIB-02: zero-price tiers skipped', () => {
  it('free is skipped:true (price 0 → no margin promise to gate)', () => {
    const res = validateMarginInvariant(DEFAULT_BILLING_CONFIG)
    expect(res.tiers.free.skipped).toBe(true)
    // skipped tiers report a pass:true (excluded from the gate, not failed)
    expect(res.tiers.free.pass).toBe(true)
  })

  it('a config whose ONLY non-passing tier is zero-price still passes overall', () => {
    const cfg = {
      ...DEFAULT_BILLING_CONFIG,
      tiers: {
        // free carries a large grant at price 0 — it MUST NOT drag overall pass
        free: {
          ...DEFAULT_BILLING_CONFIG.tiers.free,
          monthlyCreditGrant: 5000,
          subscriptionPriceCents: 0,
        },
        // priced tiers calibrated to PASS
        pro: {
          ...DEFAULT_BILLING_CONFIG.tiers.pro,
          monthlyCreditGrant: 1000,
          subscriptionPriceCents: 2900,
        },
        business: {
          ...DEFAULT_BILLING_CONFIG.tiers.business,
          monthlyCreditGrant: 3000,
          subscriptionPriceCents: 9900,
        },
      },
    }
    const res = validateMarginInvariant(cfg)
    expect(res.pass).toBe(true)
    expect(res.tiers.free.skipped).toBe(true)
  })
})

// =============================================================================
// CALIB-02 — a calibrated PASSING fixture
// =============================================================================
describe('CALIB-02: validateMarginInvariant — passing fixture', () => {
  it('a hand-crafted calibrated config PASSES (low grants relative to price)', () => {
    const cfg = {
      ...DEFAULT_BILLING_CONFIG,
      tiers: {
        ...DEFAULT_BILLING_CONFIG.tiers,
        // pro: 1000 × 0.01 / 4.5 = 2.2222 ; 2.2222 / 29 = 0.0766 ≤ 0.30 PASS
        pro: {
          ...DEFAULT_BILLING_CONFIG.tiers.pro,
          monthlyCreditGrant: 1000,
          subscriptionPriceCents: 2900,
        },
        // business: 3000 × 0.01 / 4.5 = 6.6667 ; 6.6667 / 99 = 0.0673 ≤ 0.30 PASS
        business: {
          ...DEFAULT_BILLING_CONFIG.tiers.business,
          monthlyCreditGrant: 3000,
          subscriptionPriceCents: 9900,
        },
      },
    }
    const res = validateMarginInvariant(cfg)
    expect(res.pass).toBe(true)
    expect(res.tiers.pro.ratio).toBeCloseTo(0.0766, 3)
    expect(res.tiers.pro.pass).toBe(true)
    expect(res.tiers.business.ratio).toBeCloseTo(0.0673, 3)
    expect(res.tiers.business.pass).toBe(true)
  })
})

// =============================================================================
// CALIB-02 — aggregateAiCostByOperation: NULL exclusion + stats + never-throw
// =============================================================================
describe('CALIB-02: aggregateAiCostByOperation', () => {
  it('computes mean/median/p90/n per operation_type, EXCLUDING NULL-cost rows', async () => {
    // The .not('real_cost_usd','is',null) filter is applied in the query, so the
    // fake returns ONLY the non-null rows. The photo_batch null row is therefore
    // absent — its operation_type must NOT appear in the result.
    serviceClientImpl = () =>
      makeServiceClient([
        { operation_type: 'estimate', real_cost_usd: 0.02 },
        { operation_type: 'estimate', real_cost_usd: 0.04 },
      ])
    const res = await aggregateAiCostByOperation()
    const estimate = res.find((r) => r.operationType === 'estimate')
    expect(estimate).toBeDefined()
    expect(estimate!.n).toBe(2)
    expect(estimate!.meanUsd).toBeCloseTo(0.03, 6)
    // photo_batch had only a NULL row → excluded entirely
    expect(res.find((r) => r.operationType === 'photo_batch')).toBeUndefined()
  })

  it('reports median + p90 per operation_type', async () => {
    serviceClientImpl = () =>
      makeServiceClient([
        { operation_type: 'estimate', real_cost_usd: 0.01 },
        { operation_type: 'estimate', real_cost_usd: 0.02 },
        { operation_type: 'estimate', real_cost_usd: 0.03 },
        { operation_type: 'estimate', real_cost_usd: 0.04 },
        { operation_type: 'estimate', real_cost_usd: 0.05 },
      ])
    const res = await aggregateAiCostByOperation()
    const estimate = res.find((r) => r.operationType === 'estimate')!
    expect(estimate.n).toBe(5)
    expect(estimate.meanUsd).toBeCloseTo(0.03, 6)
    expect(estimate.medianUsd).toBeCloseTo(0.03, 6) // sorted[floor(0.5*5)] = sorted[2]
    expect(estimate.p90Usd).toBeCloseTo(0.05, 6) // sorted[floor(0.9*5)] = sorted[4]
  })

  it('NEVER throws on a service-read failure — returns []', async () => {
    serviceClientImpl = () => makeThrowingClient()
    const res = await aggregateAiCostByOperation()
    expect(res).toEqual([])
  })
})

// =============================================================================
// CREDITUI-05: aggregateAiCostByOperation company scope
// =============================================================================
describe('CREDITUI-05: aggregateAiCostByOperation company scope', () => {
  it('Test 1 (regression): called with NO argument, behaves platform-wide — no .eq() filter applied', async () => {
    let eqCalled = false
    serviceClientImpl = () =>
      makeServiceClient(
        [
          { operation_type: 'estimate', real_cost_usd: 0.02 },
          { operation_type: 'estimate', real_cost_usd: 0.04 },
        ],
        () => {
          eqCalled = true
        }
      )
    const res = await aggregateAiCostByOperation()
    expect(eqCalled).toBe(false)
    const estimate = res.find((r) => r.operationType === 'estimate')
    expect(estimate).toBeDefined()
    expect(estimate!.n).toBe(2)
  })

  it('Test 2: called with a companyId, applies .eq("company_id", companyId) BEFORE .not(...)', async () => {
    let receivedCol: string | undefined
    let receivedVal: unknown
    serviceClientImpl = () =>
      makeServiceClient(
        [{ operation_type: 'estimate', real_cost_usd: 0.05 }],
        (col, val) => {
          receivedCol = col
          receivedVal = val
        }
      )
    const res = await aggregateAiCostByOperation('company-a-id')
    expect(receivedCol).toBe('company_id')
    expect(receivedVal).toBe('company-a-id')
    expect(res.find((r) => r.operationType === 'estimate')?.n).toBe(1)
  })

  it('Test 3 (isolation): the mock .eq() receives the EXACT companyId argument passed in, proving scoping not global aggregation', async () => {
    const receivedIds: unknown[] = []
    serviceClientImpl = () =>
      makeServiceClient([{ operation_type: 'estimate', real_cost_usd: 0.01 }], (_col, val) => {
        receivedIds.push(val)
      })
    await aggregateAiCostByOperation('company-a-id')
    await aggregateAiCostByOperation('company-b-id')
    expect(receivedIds).toEqual(['company-a-id', 'company-b-id'])
  })

  it('Test 4 (regression): never-throw guard still holds when scoped — a throwing client with a companyId still returns []', async () => {
    serviceClientImpl = () => makeThrowingClient()
    const res = await aggregateAiCostByOperation('company-a-id')
    expect(res).toEqual([])
  })
})

// =============================================================================
// CALIB-02 — recommendFromAggregate (pure, illustrative)
// =============================================================================
describe('CALIB-02: recommendFromAggregate', () => {
  it('is pure: estimatedMonthlyRealCostUsd = Σ (mean × usageProfile[op])', () => {
    const perOp = [
      { operationType: 'estimate', n: 2, meanUsd: 0.03, medianUsd: 0.03, p90Usd: 0.04 },
      { operationType: 'photo_batch', n: 4, meanUsd: 0.01, medianUsd: 0.01, p90Usd: 0.02 },
    ]
    // 40 estimates × 0.03 + 200 photo_batch × 0.01 = 1.2 + 2.0 = 3.2
    const rec = recommendFromAggregate(perOp, { estimate: 40, photo_batch: 200 })
    expect(rec.estimatedMonthlyRealCostUsd).toBeCloseTo(3.2, 6)
    expect(Number.isFinite(rec.estimatedMonthlyRealCostUsd)).toBe(true)
  })

  it('an op missing from the usage profile contributes 0 (no NaN)', () => {
    const perOp = [
      { operationType: 'estimate', n: 1, meanUsd: 0.03, medianUsd: 0.03, p90Usd: 0.03 },
    ]
    const rec = recommendFromAggregate(perOp, {})
    expect(rec.estimatedMonthlyRealCostUsd).toBe(0)
  })
})
