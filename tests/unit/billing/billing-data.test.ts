import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock requireServiceClient before importing the module under test.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { getBillingData } from '@/lib/queries/billing'
import { requireServiceClient } from '@/lib/supabase/service'

/** Build a chainable Supabase mock that resolves with the given response. */
function buildChain(response: { data: unknown; error: null | { message: string } }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
  }
  return chain
}

/** Supabase client that returns different responses for companies vs usage_events. */
function buildClient(companyResponse: unknown, eventsResponse: unknown) {
  let callIndex = 0
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue(companyResponse),
        }
      }
      // usage_events — chainable without .single()
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue(eventsResponse),
      }
    }),
  }
  return client
}

const MOCK_USER_ID = 'user-123'
const MOCK_COMPANY_ID = 'company-456'

const MOCK_COMPANY_ROW = {
  id: MOCK_COMPANY_ID,
  tier: 'pro',
  tier_trial_ends_at: null,
  tier_renews_at: '2026-06-14T00:00:00Z',
  stripe_subscription_id: 'sub_abc',
}

const MOCK_EVENTS = [
  { event_type: 'estimate_generated' },
  { event_type: 'estimate_generated' },
  { event_type: 'photo_analyzed' },
  { event_type: 'photo_analyzed' },
  { event_type: 'photo_analyzed' },
  { event_type: 'audio_transcribed' },
]

describe('getBillingData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tier and entitlements', async () => {
    const mockClient = buildClient(
      { data: MOCK_COMPANY_ROW, error: null },
      { data: MOCK_EVENTS, error: null }
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_USER_ID)

    expect(result).not.toBeNull()
    expect(result!.tier).toBe('pro')
    expect(result!.entitlements).toMatchObject({
      maxEstimatesPerMonth: 200,
      maxPhotosPerEstimate: 20,
      whatsappEnabled: true,
    })
  })

  it('counts estimate_generated events this month', async () => {
    const mockClient = buildClient(
      { data: MOCK_COMPANY_ROW, error: null },
      { data: MOCK_EVENTS, error: null }
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_USER_ID)

    expect(result).not.toBeNull()
    // MOCK_EVENTS has 2 'estimate_generated' events
    expect(result!.estimatesThisMonth).toBe(2)
  })

  it('counts photo_analyzed events this month', async () => {
    const mockClient = buildClient(
      { data: MOCK_COMPANY_ROW, error: null },
      { data: MOCK_EVENTS, error: null }
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_USER_ID)

    expect(result).not.toBeNull()
    // MOCK_EVENTS has 3 'photo_analyzed' events
    expect(result!.photosThisMonth).toBe(3)
  })

  it('passes through tierTrialEndsAt and tierRenewsAt', async () => {
    const trialCompany = {
      ...MOCK_COMPANY_ROW,
      tier: 'trial',
      tier_trial_ends_at: '2026-06-01T00:00:00Z',
      tier_renews_at: null,
      stripe_subscription_id: null,
    }
    const mockClient = buildClient(
      { data: trialCompany, error: null },
      { data: [], error: null }
    )
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    const result = await getBillingData(MOCK_USER_ID)

    expect(result).not.toBeNull()
    expect(result!.tierTrialEndsAt).toBe('2026-06-01T00:00:00Z')
    expect(result!.tierRenewsAt).toBeNull()
    expect(result!.stripeSubscriptionId).toBeNull()
  })
})
