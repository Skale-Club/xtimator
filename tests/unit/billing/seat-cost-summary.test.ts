import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEAT-08 — buildSeatCostSummary (lib/billing/seat-cost-summary.ts).
 *
 * The server-side seat-cost summary builder. It reads getBillingConfig() (the
 * one configurable home for the seat price + per-tier includedSeats) plus the
 * company's tier, then REUSES the pure computeBillableSeats/computeSeatChargeCents
 * (NOT mocked — the whole point is the disclosed number reconciles to what the
 * Phase-139 sync would charge).
 *
 * Boundaries mocked: getBillingConfig (config) and requireServiceClient (the
 * company tier read). The pure seat math from @/lib/billing/seat-billing is REAL.
 *
 * Covers: single-owner-within-included → $0 (retrocompat), the multi-seat case
 * (4 members, included 1, price 1500 → billable 3, monthly 4500), and an
 * unknown/null tier → free-tier includedSeats fallback (never throws).
 */

// ─── billing config ──────────────────────────────────────────────────────────
const getBillingConfig = vi.fn()
vi.mock('@/lib/billing/billing-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/billing-config')>()
  return { ...actual, getBillingConfig: () => getBillingConfig() }
})

// ─── service client: .from('companies').select('tier').eq('id', x).single() ──
const companyRow = { data: null as { tier: string | null } | null, error: null as unknown }
const singleMock = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => singleMock(),
        }),
      }),
    }),
  }),
}))

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    seatPriceCents: 1500,
    enforcementEnabled: false,
    tiers: {
      free: { monthlyCreditGrant: 0, subscriptionPriceCents: 0, includedSeats: 1 },
      trial: { monthlyCreditGrant: 0, subscriptionPriceCents: 0, includedSeats: 1 },
      pro: { monthlyCreditGrant: 0, subscriptionPriceCents: 0, includedSeats: 1 },
      business: { monthlyCreditGrant: 0, subscriptionPriceCents: 0, includedSeats: 1 },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getBillingConfig.mockResolvedValue(makeConfig())
  companyRow.data = { tier: 'free' }
  companyRow.error = null
  singleMock.mockImplementation(async () => companyRow)
})

describe('SEAT-08: buildSeatCostSummary', () => {
  it('single owner within includedSeats → billable 0 / $0 (retrocompat, no alarm)', async () => {
    getBillingConfig.mockResolvedValue(makeConfig({ seatPriceCents: 1500, enforcementEnabled: false }))
    companyRow.data = { tier: 'free' } // free includedSeats: 1

    const { buildSeatCostSummary } = await import('@/lib/billing/seat-cost-summary')
    const summary = await buildSeatCostSummary('co-1', 1)

    expect(summary).toEqual({
      activeSeats: 1,
      includedSeats: 1,
      billableSeats: 0,
      perSeatCents: 1500,
      monthlyCents: 0,
      enforcementEnabled: false,
    })
  })

  it('multi-seat: 4 members, included 1, price 1500 → billable 3, monthly 4500', async () => {
    getBillingConfig.mockResolvedValue(makeConfig({ seatPriceCents: 1500, enforcementEnabled: true }))
    companyRow.data = { tier: 'free' }

    const { buildSeatCostSummary } = await import('@/lib/billing/seat-cost-summary')
    const summary = await buildSeatCostSummary('co-1', 4)

    expect(summary).toEqual({
      activeSeats: 4,
      includedSeats: 1,
      billableSeats: 3,
      perSeatCents: 1500,
      monthlyCents: 4500,
      enforcementEnabled: true,
    })
  })

  it('reconciles to the pure seat functions (NOT inline math)', async () => {
    const { computeBillableSeats, computeSeatChargeCents } = await import(
      '@/lib/billing/seat-billing'
    )
    getBillingConfig.mockResolvedValue(makeConfig({ seatPriceCents: 2000 }))
    companyRow.data = { tier: 'free' }

    const { buildSeatCostSummary } = await import('@/lib/billing/seat-cost-summary')
    const summary = await buildSeatCostSummary('co-1', 5)

    const expectedBillable = computeBillableSeats(5, 1)
    const expectedMonthly = computeSeatChargeCents(expectedBillable, 2000)
    expect(summary.billableSeats).toBe(expectedBillable)
    expect(summary.monthlyCents).toBe(expectedMonthly)
  })

  it('unknown/null tier → falls back to free includedSeats (never throws)', async () => {
    getBillingConfig.mockResolvedValue(makeConfig({ seatPriceCents: 1500 }))
    companyRow.data = { tier: 'enterprise-bogus' as unknown as string } // not in tiers

    const { buildSeatCostSummary } = await import('@/lib/billing/seat-cost-summary')
    const summary = await buildSeatCostSummary('co-1', 3)

    // free includedSeats is 1 → billable 2 → 3000
    expect(summary.includedSeats).toBe(1)
    expect(summary.billableSeats).toBe(2)
    expect(summary.monthlyCents).toBe(3000)
  })

  it('null tier row → free fallback, no throw', async () => {
    getBillingConfig.mockResolvedValue(makeConfig({ seatPriceCents: 1500 }))
    companyRow.data = null

    const { buildSeatCostSummary } = await import('@/lib/billing/seat-cost-summary')
    const summary = await buildSeatCostSummary('co-1', 2)

    expect(summary.includedSeats).toBe(1)
    expect(summary.billableSeats).toBe(1)
    expect(summary.monthlyCents).toBe(1500)
  })
})
