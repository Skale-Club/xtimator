import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 152 (CREDITUI-05) — getCompanyCostOverview.
 *
 * Locks the contract of lib/queries/admin-company-cost.ts: an admin-only,
 * per-company read combining the company's exact credit_balance with the
 * real USD cost aggregate (aggregateAiCostByOperation, mocked directly so
 * this test is isolated from Task 1's implementation details) and the
 * configured markup.
 *
 * The service client is mocked (mirrors calibration.test.ts). NO DB, NO
 * network, NO secrets — pure deterministic unit tests.
 */

let serviceClientImpl: () => unknown = () => makeServiceClient(0)

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientImpl(),
}))

vi.mock('@/lib/billing/calibration', () => ({
  aggregateAiCostByOperation: vi.fn(),
}))

/**
 * Chainable supabase fake for the `companies.credit_balance` read:
 * .from('companies').select('credit_balance').eq('id', companyId).single()
 */
function makeServiceClient(creditBalance: number | null, onEqId?: (id: unknown) => void) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, val: unknown) {
              onEqId?.(val)
              return {
                async single() {
                  if (creditBalance === null) return { data: null, error: null }
                  return { data: { credit_balance: creditBalance }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

import { getCompanyCostOverview } from '@/lib/queries/admin-company-cost'
import { aggregateAiCostByOperation } from '@/lib/billing/calibration'

const mockedAggregate = aggregateAiCostByOperation as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  serviceClientImpl = () => makeServiceClient(0)
  mockedAggregate.mockReset()
  mockedAggregate.mockResolvedValue([])
})

describe('CREDITUI-05: getCompanyCostOverview', () => {
  it('Test 1: returns creditBalance/totalRealCostUsd/markup/perOperation, balance scoped via .eq("id", companyId)', async () => {
    let receivedId: unknown
    serviceClientImpl = () => makeServiceClient(1500, (id) => (receivedId = id))
    mockedAggregate.mockResolvedValue([])

    const res = await getCompanyCostOverview('company-a', 4.5)

    expect(receivedId).toBe('company-a')
    expect(res.creditBalance).toBe(1500)
    expect(res.markup).toBe(4.5)
    expect(res.perOperation).toEqual([])
  })

  it('Test 2: totalRealCostUsd equals the sum of real_cost_usd across the per-operation rows (meanUsd * n reconstructs the sum)', async () => {
    serviceClientImpl = () => makeServiceClient(0)
    mockedAggregate.mockResolvedValue([
      { operationType: 'estimate', n: 2, meanUsd: 0.03, medianUsd: 0.03, p90Usd: 0.04 },
      { operationType: 'photo_batch', n: 4, meanUsd: 0.01, medianUsd: 0.01, p90Usd: 0.02 },
    ])

    const res = await getCompanyCostOverview('company-a', 4.5)

    // estimate: 0.03 * 2 = 0.06 ; photo_batch: 0.01 * 4 = 0.04 ; total = 0.10
    expect(res.totalRealCostUsd).toBeCloseTo(0.1, 6)
  })

  it('Test 3 (isolation): different company IDs produce different results, proving per-company scoping not global aggregation', async () => {
    const balances: Record<string, number> = { 'company-a': 1000, 'company-b': 9000 }
    const perOpByCompany: Record<string, Array<{ operationType: string; n: number; meanUsd: number; medianUsd: number; p90Usd: number }>> = {
      'company-a': [{ operationType: 'estimate', n: 1, meanUsd: 0.05, medianUsd: 0.05, p90Usd: 0.05 }],
      'company-b': [{ operationType: 'estimate', n: 10, meanUsd: 0.5, medianUsd: 0.5, p90Usd: 0.5 }],
    }

    serviceClientImpl = () =>
      makeServiceClient(balances['company-a'])
    mockedAggregate.mockImplementation(async (companyId: string) => perOpByCompany[companyId] ?? [])

    const resA = await getCompanyCostOverview('company-a', 4.5)

    serviceClientImpl = () => makeServiceClient(balances['company-b'])
    const resB = await getCompanyCostOverview('company-b', 4.5)

    expect(resA.creditBalance).toBe(1000)
    expect(resB.creditBalance).toBe(9000)
    expect(resA.totalRealCostUsd).toBeCloseTo(0.05, 6)
    expect(resB.totalRealCostUsd).toBeCloseTo(5, 6)
    expect(resA).not.toEqual(resB)
  })

  it('Test 4 (never-throw / null-safety): if the companies read returns no row, creditBalance defaults to 0', async () => {
    serviceClientImpl = () => makeServiceClient(null)
    mockedAggregate.mockResolvedValue([])

    const res = await getCompanyCostOverview('company-missing', 4.5)

    expect(res.creditBalance).toBe(0)
  })
})
