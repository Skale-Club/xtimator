import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * STRIPE-REFUND-01 Fix 2 — self-referral guard for attributeReferralFromCookie.
 *
 * Without this guard an affiliate can register a SECOND company, sign up
 * through their own referral link, and earn commission on their own
 * subscription forever. The guard compares the affiliate row's user_id
 * against the NEW company's owner (companies.user_id) and skips attribution
 * when they match — the signup itself must still succeed either way.
 */

const mockCookieGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: mockCookieGet }),
}))

const mockGetBillingConfig = vi.fn()
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: (...args: unknown[]) => mockGetBillingConfig(...args),
}))

// affiliates lookup + companies owner lookup + referral insert all go through
// the SAME svc.from(table) switch.
const mockAffiliateMaybeSingle = vi.fn()
const mockCompanyMaybeSingle = vi.fn()
const mockReferralInsert = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'affiliates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: mockAffiliateMaybeSingle,
        }
      }
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: mockCompanyMaybeSingle,
        }
      }
      if (table === 'affiliate_referrals') {
        return { insert: mockReferralInsert }
      }
      throw new Error(`unexpected table: ${table}`)
    }),
  }),
}))

const { serializeReferralCookie } = await import('@/lib/affiliates/attribution')
const { attributeReferralFromCookie } = await import('@/lib/affiliates/attribution-server')

const ENABLED_CONFIG = {
  affiliate: {
    enabled: true,
    attributionWindowDays: 30,
    commissionDurationMonths: 12,
    commissionPct: 0.2,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBillingConfig.mockResolvedValue(ENABLED_CONFIG)
  mockCookieGet.mockReturnValue({ value: serializeReferralCookie('joao2026', new Date()) })
  mockReferralInsert.mockResolvedValue({ error: null })
})

describe('attributeReferralFromCookie — self-referral guard (Fix 2)', () => {
  it('skips attribution when the affiliate is the SAME user as the new company owner', async () => {
    mockAffiliateMaybeSingle.mockResolvedValue({
      data: { id: 'aff-1', user_id: 'user-self' },
      error: null,
    })
    mockCompanyMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-self' },
      error: null,
    })

    await attributeReferralFromCookie('company-self')

    expect(mockReferralInsert).not.toHaveBeenCalled()
  })

  it('attributes normally when the affiliate and the company owner are DIFFERENT users', async () => {
    mockAffiliateMaybeSingle.mockResolvedValue({
      data: { id: 'aff-1', user_id: 'user-affiliate' },
      error: null,
    })
    mockCompanyMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-new-owner' },
      error: null,
    })

    await attributeReferralFromCookie('company-other')

    expect(mockReferralInsert).toHaveBeenCalledWith(
      expect.objectContaining({ affiliate_id: 'aff-1', company_id: 'company-other' })
    )
  })

  it('attributes normally when the affiliate row has no user_id (e.g. a legacy/manual affiliate)', async () => {
    mockAffiliateMaybeSingle.mockResolvedValue({
      data: { id: 'aff-2', user_id: null },
      error: null,
    })

    await attributeReferralFromCookie('company-legacy')

    // No self-referral check possible without a user_id — falls through to a
    // normal attribution rather than blocking on an absent comparison value.
    expect(mockReferralInsert).toHaveBeenCalledWith(
      expect.objectContaining({ affiliate_id: 'aff-2', company_id: 'company-legacy' })
    )
    expect(mockCompanyMaybeSingle).not.toHaveBeenCalled()
  })

  it('never throws when the company owner lookup errors — swallows and logs', async () => {
    mockAffiliateMaybeSingle.mockResolvedValue({
      data: { id: 'aff-3', user_id: 'user-affiliate' },
      error: null,
    })
    mockCompanyMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'db down' },
    })

    await expect(attributeReferralFromCookie('company-err')).resolves.toBeUndefined()
    expect(mockReferralInsert).not.toHaveBeenCalled()
  })
})
