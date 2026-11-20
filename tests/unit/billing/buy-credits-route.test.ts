import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Credits plan 2026-11-20 - one-click credit purchase
 * (app/api/billing/buy-credits). Charges the subscription's saved card and
 * grants the pack; falls back to Checkout with no card, when the bank wants a
 * confirmation, or on a decline. Owner-only, live Pro only, idempotent.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/pwa/twa-context', () => ({
  isTwaRequest: vi.fn().mockResolvedValue(false),
  TWA_PURCHASE_BLOCKED_BODY: { error: 'twa' },
}))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/billing/stripe-customer', () => ({ ensureStripeCustomer: vi.fn().mockResolvedValue('cus_1') }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }))
vi.mock('@/lib/billing/saved-card', () => ({ resolveSavedCard: vi.fn() }))
vi.mock('@/lib/billing/credit-ledger', () => ({ grantCredits: vi.fn() }))
vi.mock('@/lib/billing/access-state', () => ({ getAccessState: vi.fn() }))

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { rateLimit } = await import('@/lib/ratelimit')
const { resolveSavedCard } = await import('@/lib/billing/saved-card')
const { grantCredits } = await import('@/lib/billing/credit-ledger')
const { getAccessState } = await import('@/lib/billing/access-state')
const { GET, POST } = await import('@/app/api/billing/buy-credits/route')

const PACKS = [
  { credits: 900, priceCents: 1000 },
  { credits: 1900, priceCents: 2000 },
  { credits: 5000, priceCents: 5000 },
]
const PRO = {
  id: 'co_1',
  stripe_customer_id: 'cus_1',
  tier: 'pro',
  stripe_subscription_status: 'active',
  stripe_subscription_id: 'sub_1',
  currency_code: 'USD',
}
const CARD = { id: 'pm_1', brand: 'Visa', last4: '4242' }

const piCreate = vi.fn()
const piCancel = vi.fn()
const sessionCreate = vi.fn()

function supabaseWith(row: object | null) {
  return {
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u1' } } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    }),
  }
}

function post(body: object) {
  return POST(
    new NextRequest('http://localhost/api/billing/buy-credits', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

const REQ = 'req-12345678'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(supabaseWith(PRO) as never)
  vi.mocked(getActiveCompanyId).mockResolvedValue('co_1')
  vi.mocked(requireCompanyOwner).mockResolvedValue({ role: 'owner' } as never)
  vi.mocked(getBillingConfig).mockResolvedValue({
    topUpPacks: PACKS,
    topupExpiryMonths: 3,
    estimateCreditsRange: { low: 65, high: 150 },
    brlPricingEnabled: false,
  } as never)
  vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 1, max: 20 })
  vi.mocked(resolveSavedCard).mockResolvedValue(CARD)
  vi.mocked(grantCredits).mockResolvedValue({ applied: true })
  vi.mocked(getAccessState).mockResolvedValue({ state: 'active', tier: 'pro', balance: 2020, enforcement: true })
  piCreate.mockResolvedValue({ id: 'pi_1', status: 'succeeded' })
  piCancel.mockResolvedValue({})
  sessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/x' })
  vi.mocked(getStripeClient).mockResolvedValue({
    paymentIntents: { create: piCreate, cancel: piCancel },
    checkout: { sessions: { create: sessionCreate } },
  } as never)
})

describe('GET /api/billing/buy-credits', () => {
  it('returns the packs with credits, price, estimate range, best value and the saved card', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.eligible).toBe(true)
    expect(body.card).toEqual({ brand: 'Visa', last4: '4242' })
    expect(body.packs).toHaveLength(3)
    expect(body.packs[2]).toMatchObject({ credits: 5000, priceCents: 5000, bestValue: true, estimates: { min: 33, max: 76 } })
    expect(body.defaultIndex).toBe(1)
    expect(body.balance).toBe(2020)
  })

  it('a company without a live Pro subscription is told to subscribe, with no packs', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseWith({ ...PRO, tier: 'free', stripe_subscription_id: null }) as never)
    const body = await (await GET()).json()
    expect(body).toMatchObject({ eligible: false, reason: 'subscribe' })
    expect(body.packs).toBeUndefined()
  })

  it('a member who is not the owner gets 403 owner_required', async () => {
    vi.mocked(requireCompanyOwner).mockRejectedValue(new Error('no'))
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('owner_required')
  })
})

describe('POST /api/billing/buy-credits', () => {
  it('charges the saved card off-session and grants the pack right away', async () => {
    const res = await post({ packIndex: 1, requestId: REQ })
    const body = await res.json()
    expect(body).toMatchObject({ mode: 'charged', credits: 1900, balance: 2020 })
    const [params, opts] = piCreate.mock.calls[0]
    expect(params).toMatchObject({
      amount: 2000,
      currency: 'usd',
      customer: 'cus_1',
      payment_method: 'pm_1',
      off_session: true,
      confirm: true,
      metadata: { type: 'direct_topup', companyId: 'co_1', credits: '1900', packIndex: '1' },
    })
    expect(opts).toEqual({ idempotencyKey: `directtopup:co_1:${REQ}` })
    expect(grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'co_1', credits: 1900, source: 'topup', idempotencyKey: 'directtopup:pi_1' })
    )
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('no saved card: answers with a Checkout URL and charges nothing', async () => {
    vi.mocked(resolveSavedCard).mockResolvedValue(null)
    const body = await (await post({ packIndex: 0, requestId: REQ, returnTo: '/projects/p1' })).json()
    expect(body).toMatchObject({ mode: 'checkout', reason: 'no_card', url: 'https://checkout.stripe.com/pay/x' })
    expect(piCreate).not.toHaveBeenCalled()
    expect(sessionCreate.mock.calls[0][0].success_url).toMatch(/\/projects\/p1\?topup=1$/)
  })

  it('the bank wants a confirmation: falls back to Checkout, no credits granted', async () => {
    piCreate.mockRejectedValue(Object.assign(new Error('auth'), { code: 'authentication_required' }))
    const body = await (await post({ packIndex: 1, requestId: REQ })).json()
    expect(body).toMatchObject({ mode: 'checkout', reason: 'authentication_required' })
    expect(grantCredits).not.toHaveBeenCalled()
  })

  it('a declined card: falls back to Checkout, no credits granted', async () => {
    piCreate.mockRejectedValue(Object.assign(new Error('declined'), { code: 'card_declined' }))
    const body = await (await post({ packIndex: 1, requestId: REQ })).json()
    expect(body).toMatchObject({ mode: 'checkout', reason: 'declined' })
    expect(grantCredits).not.toHaveBeenCalled()
  })

  it('a PaymentIntent that did not succeed is cancelled and goes to Checkout', async () => {
    piCreate.mockResolvedValue({ id: 'pi_2', status: 'requires_action' })
    const body = await (await post({ packIndex: 1, requestId: REQ })).json()
    expect(piCancel).toHaveBeenCalledWith('pi_2')
    expect(body.mode).toBe('checkout')
    expect(grantCredits).not.toHaveBeenCalled()
  })

  it('"Use another card" goes straight to Checkout', async () => {
    const body = await (await post({ packIndex: 1, requestId: REQ, useOtherCard: true })).json()
    expect(body).toMatchObject({ mode: 'checkout', reason: 'other_card' })
    expect(piCreate).not.toHaveBeenCalled()
  })

  it('a grant failure still reports the charge (the webhook grants with the same key)', async () => {
    vi.mocked(grantCredits).mockRejectedValue(new Error('rpc down'))
    const body = await (await post({ packIndex: 1, requestId: REQ })).json()
    expect(body).toMatchObject({ mode: 'charged', granted: false })
  })

  it.each([
    ['no live subscription', () => vi.mocked(createClient).mockResolvedValue(supabaseWith({ ...PRO, tier: 'free', stripe_subscription_id: null }) as never), 403],
    ['not the owner', () => vi.mocked(requireCompanyOwner).mockRejectedValue(new Error('no')), 403],
    ['rate limited', () => vi.mocked(rateLimit).mockResolvedValue({ allowed: false, count: 21, max: 20, retryAfter: 60 } as never), 429],
  ])('refuses before any charge: %s', async (_label, setup, status) => {
    setup()
    const res = await post({ packIndex: 1, requestId: REQ })
    expect(res.status).toBe(status)
    expect(piCreate).not.toHaveBeenCalled()
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('rejects a bad pack index and a missing request id', async () => {
    expect((await post({ packIndex: 9, requestId: REQ })).status).toBe(400)
    expect((await post({ packIndex: 1 })).status).toBe(400)
    expect(piCreate).not.toHaveBeenCalled()
  })
})
