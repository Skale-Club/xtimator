import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock requireServiceClient before importing the module under test.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { getBillingData } from '@/lib/queries/billing'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Supabase client that returns the company row by id (.maybeSingle) and
 * head:true count queries per event_type for usage_events.
 */
function buildClient(
  companyResponse: { data: unknown; error: null | { message: string } },
  counts: Record<string, number>
) {
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(companyResponse),
        }
      }
      // usage_events — select('*', {count, head}).eq(company).eq(event_type).gte(date)
      let eventType: string | null = null
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (col === 'event_type') eventType = val
          return chain
        }),
        gte: vi.fn().mockImplementation(() =>
          Promise.resolve({ count: eventType ? counts[eventType] ?? 0 : 0, error: null })
        ),
      }
      return chain
    }),
  }
  return client
}

const MOCK_COMPANY_ID = 'company-456'

const MOCK_COMPANY_ROW = {
  id: MOCK_COMPANY_ID,
  tier: 'pro',
  tier_renews_at: '2026-06-14T00:00:00Z',
  tier_cancelled_at: null,
  stripe_subscription_id: 'sub_abc',
}

const MOCK_COUNTS = { estimate_generated: 2, photo_analyzed: 3 }

describe('getBillingData (company-scoped)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tier and entitlements for the given companyId', async () => {
    const mockClient = buildClient({ data: MOCK_COMPANY_ROW, error: null }, MOCK_COUNTS)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_COMPANY_ID)

    expect(result).not.toBeNull()
    expect(result!.tier).toBe('pro')
    expect(result!.entitlements).toMatchObject({
      maxEstimatesPerMonth: 200,
      maxPhotosPerEstimate: 20,
      whatsappEnabled: true,
    })
  })

  it('looks up the company by id (not user_id)', async () => {
    const mockClient = buildClient({ data: MOCK_COMPANY_ROW, error: null }, MOCK_COUNTS)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    await getBillingData(MOCK_COMPANY_ID)

    // The companies query chain's .eq was called with ('id', companyId).
    const companiesChain = mockClient.from.mock.results.find(
      (r) => typeof (r.value as { maybeSingle?: unknown }).maybeSingle === 'function'
    )!.value as { eq: ReturnType<typeof vi.fn> }
    expect(companiesChain.eq).toHaveBeenCalledWith('id', MOCK_COMPANY_ID)
  })

  it('counts estimate_generated events this month via count query', async () => {
    const mockClient = buildClient({ data: MOCK_COMPANY_ROW, error: null }, MOCK_COUNTS)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_COMPANY_ID)

    expect(result!.estimatesThisMonth).toBe(2)
  })

  it('counts photo_analyzed events this month via count query', async () => {
    const mockClient = buildClient({ data: MOCK_COMPANY_ROW, error: null }, MOCK_COUNTS)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_COMPANY_ID)

    expect(result!.photosThisMonth).toBe(3)
  })

  it('passes through tierRenewsAt, tierCancelledAt and stripeSubscriptionId', async () => {
    const paidCompany = {
      ...MOCK_COMPANY_ROW,
      tier_renews_at: '2026-08-01T00:00:00Z',
      tier_cancelled_at: '2026-07-20T00:00:00Z',
      stripe_subscription_id: 'sub_123',
    }
    const mockClient = buildClient({ data: paidCompany, error: null }, {})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_COMPANY_ID)

    expect(result!.tierRenewsAt).toBe('2026-08-01T00:00:00Z')
    expect(result!.tierCancelledAt).toBe('2026-07-20T00:00:00Z')
    expect(result!.stripeSubscriptionId).toBe('sub_123')
  })

  it('returns null when the company does not exist', async () => {
    const mockClient = buildClient({ data: null, error: null }, {})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData('missing-co')

    expect(result).toBeNull()
  })
})
