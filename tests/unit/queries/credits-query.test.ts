import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock requireServiceClient + getBillingConfig before importing the module under test.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn(),
}))

import { getCreditOverview, getLiveGrantedCredits } from '@/lib/queries/credits'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'

const COMPANY_ID = 'company-456'

const LEDGER_ROWS = [
  { operation_type: 'estimate', delta_credits: -9, reason: 'debit', created_at: '2026-06-24T10:00:00Z' },
  { operation_type: 'photo_batch', delta_credits: -3, reason: 'debit', created_at: '2026-06-23T10:00:00Z' },
  { operation_type: null, delta_credits: 9000, reason: 'grant', created_at: '2026-06-01T00:00:00Z' },
]

/**
 * Build a Supabase client whose `companies` and `credit_ledger` branches resolve
 * with the supplied responses. The `credit_ledger` branch exposes its `.select`
 * spy (ledgerSelect) so a test can assert the EXACT projection string.
 */
function buildClient(opts: {
  companyResponse: { data: unknown; error: null | { message: string } }
  ledgerResponse: { data: unknown; error: null | { message: string } }
  ledgerSelect: ReturnType<typeof vi.fn>
}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue(opts.companyResponse),
        }
      }
      // credit_ledger — .select().eq().order().limit()
      return {
        select: opts.ledgerSelect,
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(opts.ledgerResponse),
      }
    }),
  }
}

function mockConfig(lowBalanceThresholds: number[]) {
  ;(getBillingConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
    lowBalanceThresholds,
  })
}

describe('getCreditOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns balance from companies.credit_balance', async () => {
    const ledgerSelect = vi.fn().mockReturnThis()
    const client = buildClient({
      companyResponse: { data: { credit_balance: 1240 }, error: null },
      ledgerResponse: { data: LEDGER_ROWS, error: null },
      ledgerSelect,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    mockConfig([200, 50])

    const result = await getCreditOverview(COMPANY_ID)
    expect(result.balance).toBe(1240)
  })

  it('returns history rows mapped from the credit_ledger rows', async () => {
    const ledgerSelect = vi.fn().mockReturnThis()
    const client = buildClient({
      companyResponse: { data: { credit_balance: 1240 }, error: null },
      ledgerResponse: { data: LEDGER_ROWS, error: null },
      ledgerSelect,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    mockConfig([200, 50])

    const result = await getCreditOverview(COMPANY_ID)
    expect(result.history).toHaveLength(3)
    expect(result.history[0]).toMatchObject({
      operation_type: 'estimate',
      delta_credits: -9,
      reason: 'debit',
      created_at: '2026-06-24T10:00:00Z',
    })
  })

  it('the credit_ledger SELECT is owner-safe (no cost/markup columns)', async () => {
    const ledgerSelect = vi.fn().mockReturnThis()
    const client = buildClient({
      companyResponse: { data: { credit_balance: 1240 }, error: null },
      ledgerResponse: { data: LEDGER_ROWS, error: null },
      ledgerSelect,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    mockConfig([200, 50])

    await getCreditOverview(COMPANY_ID)

    // The cardinal rule: the projection contains ONLY the owner-safe columns and
    // NEVER the cost/markup columns (proven by the SELECT string, not by hiding).
    expect(ledgerSelect).toHaveBeenCalledWith(expect.stringContaining('operation_type'))
    const selectArg = ledgerSelect.mock.calls[0][0] as string
    expect(selectArg).toContain('delta_credits')
    expect(selectArg).toContain('reason')
    expect(selectArg).toContain('created_at')
    expect(selectArg).not.toContain('real_cost_usd')
    expect(selectArg).not.toContain('markup')
  })

  it('returns lowBalanceThresholds from the billing config', async () => {
    const ledgerSelect = vi.fn().mockReturnThis()
    const client = buildClient({
      companyResponse: { data: { credit_balance: 1240 }, error: null },
      ledgerResponse: { data: LEDGER_ROWS, error: null },
      ledgerSelect,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    mockConfig([200, 50])

    const result = await getCreditOverview(COMPANY_ID)
    expect(result.lowBalanceThresholds).toEqual([200, 50])
  })

  it('defaults balance to 0 when the company row is missing (never throws)', async () => {
    const ledgerSelect = vi.fn().mockReturnThis()
    const client = buildClient({
      companyResponse: { data: null, error: null },
      ledgerResponse: { data: [], error: null },
      ledgerSelect,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    mockConfig([200, 50])

    const result = await getCreditOverview(COMPANY_ID)
    expect(result.balance).toBe(0)
    expect(result.history).toEqual([])
  })
})

/**
 * getLiveGrantedCredits sums `granted` over every live credit lot (expires_at
 * NULL or in the future), whatever its source. It is the chip / usage-bar
 * denominator, so a company living on signup/adjust credits still gets a bar.
 */
describe('getLiveGrantedCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function buildLotsClient(response: { data: unknown; error: null | { message: string } }) {
    const fromSpy = vi.fn()
    const selectSpy = vi.fn().mockReturnThis()
    const eqSpy = vi.fn().mockResolvedValue(response)
    const client = {
      from: fromSpy.mockImplementation(() => ({
        select: selectSpy,
        eq: eqSpy,
      })),
    }
    return { client, fromSpy, selectSpy, eqSpy }
  }

  const future = () => new Date(Date.now() + 86_400_000).toISOString()
  const past = () => new Date(Date.now() - 86_400_000).toISOString()

  it('sums granted across every live lot, never-expiring ones included', async () => {
    const { client } = buildLotsClient({
      data: [
        { granted: 3500, expires_at: future() },
        { granted: 5000, expires_at: future() },
        { granted: 1500, expires_at: null },
      ],
      error: null,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    expect(await getLiveGrantedCredits(COMPANY_ID)).toBe(10000)
  })

  it('reads credit_lots for the company, all sources', async () => {
    const { client, fromSpy, selectSpy, eqSpy } = buildLotsClient({ data: [], error: null })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    await getLiveGrantedCredits(COMPANY_ID)
    expect(fromSpy).toHaveBeenCalledWith('credit_lots')
    expect(selectSpy).toHaveBeenCalledWith('granted, expires_at')
    expect(eqSpy).toHaveBeenCalledWith('company_id', COMPANY_ID)
  })

  it('skips expired lots', async () => {
    const { client } = buildLotsClient({
      data: [
        { granted: 3500, expires_at: past() },
        { granted: 1397, expires_at: null },
      ],
      error: null,
    })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    expect(await getLiveGrantedCredits(COMPANY_ID)).toBe(1397)
  })

  it('returns 0 when the query errors (never throws)', async () => {
    const { client } = buildLotsClient({ data: null, error: { message: 'boom' } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    expect(await getLiveGrantedCredits(COMPANY_ID)).toBe(0)
  })

  it('returns 0 when requireServiceClient throws (never throws)', async () => {
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('no service client')
    })

    expect(await getLiveGrantedCredits(COMPANY_ID)).toBe(0)
  })

  it('returns 0 with no live lot (chip falls back to the raw balance)', async () => {
    const { client } = buildLotsClient({ data: [], error: null })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    expect(await getLiveGrantedCredits(COMPANY_ID)).toBe(0)
  })
})
