import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock requireServiceClient + getBillingConfig before importing the module under test.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn(),
}))

import { getCreditOverview } from '@/lib/queries/credits'
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
