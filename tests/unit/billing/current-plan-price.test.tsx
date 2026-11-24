import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const state = vi.hoisted(() => ({
  tier: 'business',
  interval: 'month',
  businessMonth: 10950 as number | null,
  businessYear: 109500 as number | null,
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: async () => ({ sub: 'owner' }) }))
vi.mock('@/lib/pwa/twa-context', () => ({ isTwaRequest: async () => false }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: async () => ({ role: 'owner' }) }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompany: async () => ({ id: 'company', currency_code: 'USD' }) }))
vi.mock('@/lib/demo/config', () => ({ isDemoCompany: () => false }))
vi.mock('@/lib/queries/billing', () => ({
  getBillingData: async () => ({
    tier: state.tier,
    stripeSubscriptionInterval: state.interval,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    stripeSubscriptionStatus: null,
    tierCancelledAt: null,
    tierRenewsAt: null,
  }),
}))
vi.mock('@/lib/queries/credits', () => ({
  getCreditOverview: async () => ({ balance: 100, history: [] }),
  getLiveGrantedCredits: async () => 100,
  getLiveCreditLots: async () => [],
}))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => ({
    autoTopupEnabled: false,
    brlPricingEnabled: false,
    tiers: {
      pro: { subscriptionPriceCents: 2900, subscriptionPriceAnnualCents: 29000, featureBullets: [] },
      business: { subscriptionPriceCents: 9900, subscriptionPriceAnnualCents: 99000, featureBullets: [] },
    },
  }),
}))
vi.mock('@/lib/billing/stripe-display-prices', () => ({
  getStripeDisplayPrices: async () => ({
    pro: { monthCents: 2900, yearCents: 29000 },
    business: { monthCents: state.businessMonth, yearCents: state.businessYear },
  }),
}))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))
vi.mock('@/lib/billing/saved-card', () => ({ resolveSavedCard: vi.fn(), savedCardLabel: () => null }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/billing/access-guard', () => ({ getPaywallContext: async () => ({ state: 'active' }) }))
vi.mock('@/lib/platform-config', () => ({ getCachedBranding: async () => ({ logoUrl: null }) }))
vi.mock('@/components/i18n/t', () => ({ T: ({ text, children }: { text?: string; children?: ReactNode }) => <>{text ?? children}</> }))
vi.mock('@/components/i18n/localized-date', () => ({ LocalizedDate: () => null }))
vi.mock('@/components/settings/settings-ui', () => ({
  SETTINGS_CARD_CLASS: '',
  SettingsHeader: () => null,
  SettingsCard: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/billing/manage-subscription-button', () => ({ ManageSubscriptionButton: () => null }))
vi.mock('@/components/billing/tier-cards-grid', () => ({ TierCardsGrid: () => null }))
vi.mock('@/components/billing/topup-packs-grid', () => ({ TopUpPacksGrid: () => null }))
vi.mock('@/components/billing/credit-balance-card', () => ({ CreditBalanceBody: () => null }))
vi.mock('@/components/billing/credit-history-list', () => ({ CreditHistoryList: () => null }))
vi.mock('@/components/billing/auto-topup-card', () => ({ AutoTopupCard: () => null }))

const { default: BillingPage } = await import('@/app/(app)/settings/billing/page')

afterEach(cleanup)

describe('current plan price', () => {
  it.each([
    ['business', 'month', '$109.50'],
    ['business', 'year', '$1,095'],
    ['pro', 'month', '$29'],
    ['pro', 'year', '$290'],
  ])('shows the %s %s catalog price', async (tier, interval, expected) => {
    Object.assign(state, { tier, interval, businessMonth: 10950, businessYear: 109500 })
    render(await BillingPage())
    const current = within(screen.getByTestId('plan-overview'))
    expect(current.getByText(expected)).toBeTruthy()
    if (tier === 'business') expect(current.queryByText('$29')).toBeNull()
  })

  it.each([['month', '$99'], ['year', '$990']])('uses Business config when the %s Stripe price is unavailable', async (interval, expected) => {
    Object.assign(state, { tier: 'business', interval, businessMonth: null, businessYear: null })
    render(await BillingPage())
    expect(within(screen.getByTestId('plan-overview')).getByText(expected)).toBeTruthy()
  })
})
