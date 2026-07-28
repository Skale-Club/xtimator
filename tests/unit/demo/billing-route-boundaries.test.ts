import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const getClaims = vi.fn()
const getAuthClaims = vi.fn()
const demoGuardResponse = vi.fn()
const isDemoSession = vi.fn()
const getActiveCompanyId = vi.fn()
const getStripeClient = vi.fn()
const getBillingConfig = vi.fn()
const stripeCheckoutCreate = vi.fn()
const stripePortalCreate = vi.fn()
const stripeSubscriptionRetrieve = vi.fn()
const requireServiceClient = vi.fn()
const serviceSingle = vi.fn()
const serviceUpdate = vi.fn()
const getIntegrationKey = vi.fn()
const mintOAuthState = vi.fn()
const buildAuthorizeUrl = vi.fn()
const deauthorize = vi.fn()
const cookieSet = vi.fn()
const revalidatePath = vi.fn()

const billingMaybeSingle = vi.fn()
const billingFrom = vi.fn(() => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: billingMaybeSingle,
  }
  return query
})

const serviceFrom = vi.fn(() => {
  const query = {
    select: vi.fn(() => query),
    update: (...args: unknown[]) => {
      serviceUpdate(...args)
      return query
    },
    eq: vi.fn(() => query),
    single: serviceSingle,
  }
  return query
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims },
    from: billingFrom,
  })),
}))
vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: (...args: unknown[]) => getAuthClaims(...args),
}))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: (...args: unknown[]) => demoGuardResponse(...args),
  isDemoSession: (...args: unknown[]) => isDemoSession(...args),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => getActiveCompanyId(...args),
}))
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: (...args: unknown[]) => getStripeClient(...args),
}))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: (...args: unknown[]) => getBillingConfig(...args),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...args: unknown[]) => requireServiceClient(...args),
}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: (...args: unknown[]) => getIntegrationKey(...args),
}))
vi.mock('@/lib/billing/connect-oauth', () => ({
  mintOAuthState: (...args: unknown[]) => mintOAuthState(...args),
  buildAuthorizeUrl: (...args: unknown[]) => buildAuthorizeUrl(...args),
  deauthorize: (...args: unknown[]) => deauthorize(...args),
}))
vi.mock('@/lib/utils/site-url', () => ({
  resolveBaseUrl: vi.fn(() => 'http://localhost:9633'),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: cookieSet })),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const demoDenied = () =>
  NextResponse.json(
    {
      error: 'demo_readonly',
      message: 'This is a read-only demo. Create a free account to make changes.',
    },
    { status: 403 },
  )

type RouteCase = {
  name: string
  load: () => Promise<(request: Request) => Promise<Response>>
  request: () => Request
  unauthenticatedStatus: number
  assertUnauthenticated?: (response: Response) => void
  effects: Array<ReturnType<typeof vi.fn>>
  assertNormalEffect: () => void
}

const routeCases: RouteCase[] = [
  {
    name: 'subscription checkout',
    load: async () =>
      (await import('@/app/api/billing/create-checkout-session/route'))
        .POST as unknown as (request: Request) => Promise<Response>,
    request: () =>
      new Request('http://localhost/api/billing/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ plan: 'pro' }),
      }),
    unauthenticatedStatus: 401,
    effects: [billingFrom, getBillingConfig, getStripeClient, stripeCheckoutCreate, stripePortalCreate],
    assertNormalEffect: () => expect(stripeCheckoutCreate).toHaveBeenCalledOnce(),
  },
  {
    name: 'credit top-up checkout',
    load: async () =>
      (await import('@/app/api/billing/create-topup-session/route'))
        .POST as unknown as (request: Request) => Promise<Response>,
    request: () =>
      new Request('http://localhost/api/billing/create-topup-session', {
        method: 'POST',
        body: JSON.stringify({ packIndex: 0 }),
      }),
    unauthenticatedStatus: 401,
    effects: [billingFrom, getBillingConfig, getStripeClient, stripeCheckoutCreate],
    assertNormalEffect: () => expect(stripeCheckoutCreate).toHaveBeenCalledOnce(),
  },
  {
    name: 'billing portal',
    load: async () =>
      (await import('@/app/api/billing/create-portal-session/route'))
        .POST as unknown as (request: Request) => Promise<Response>,
    request: () =>
      new Request('http://localhost/api/billing/create-portal-session', { method: 'POST' }),
    unauthenticatedStatus: 401,
    effects: [billingFrom, getStripeClient, stripePortalCreate],
    assertNormalEffect: () => expect(stripePortalCreate).toHaveBeenCalledOnce(),
  },
  {
    name: 'auto-top-up setup checkout',
    load: async () =>
      (await import('@/app/api/billing/create-autotopup-setup-session/route'))
        .POST as unknown as (request: Request) => Promise<Response>,
    request: () =>
      new Request('http://localhost/api/billing/create-autotopup-setup-session', {
        method: 'POST',
      }),
    unauthenticatedStatus: 401,
    effects: [billingFrom, getStripeClient, stripeCheckoutCreate],
    assertNormalEffect: () => expect(stripeCheckoutCreate).toHaveBeenCalledOnce(),
  },
  {
    name: 'Stripe Connect initiation',
    load: async () =>
      (await import('@/app/api/stripe/connect/initiate/route'))
        .GET as unknown as (request: Request) => Promise<Response>,
    request: () =>
      new Request('http://localhost:9633/api/stripe/connect/initiate', { method: 'GET' }),
    unauthenticatedStatus: 307,
    assertUnauthenticated: (response) =>
      expect(response.headers.get('location')).toBe('http://localhost:9633/?auth=login'),
    effects: [
      requireServiceClient,
      serviceFrom,
      getIntegrationKey,
      mintOAuthState,
      cookieSet,
      buildAuthorizeUrl,
    ],
    assertNormalEffect: () => {
      expect(mintOAuthState).toHaveBeenCalledWith('company-id')
      expect(cookieSet).toHaveBeenCalled()
    },
  },
  {
    name: 'Stripe Connect disconnect',
    load: async () =>
      (await import('@/app/api/stripe/connect/disconnect/route'))
        .POST as unknown as (request: Request) => Promise<Response>,
    request: () =>
      new Request('http://localhost:9633/api/stripe/connect/disconnect', { method: 'POST' }),
    unauthenticatedStatus: 401,
    effects: [
      requireServiceClient,
      serviceFrom,
      getIntegrationKey,
      deauthorize,
      serviceUpdate,
      revalidatePath,
    ],
    assertNormalEffect: () => {
      expect(serviceUpdate).toHaveBeenCalledWith({
        stripe_account_id: null,
        stripe_connect_status: 'disconnected',
      })
      expect(revalidatePath).toHaveBeenCalledWith('/settings/integrations/stripe')
    },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  getClaims.mockResolvedValue({
    data: { claims: { sub: 'normal-user', email: 'owner@example.com' } },
  })
  getAuthClaims.mockResolvedValue({ sub: 'normal-user', email: 'owner@example.com' })
  demoGuardResponse.mockResolvedValue(null)
  isDemoSession.mockResolvedValue(false)
  getActiveCompanyId.mockResolvedValue('company-id')
  billingMaybeSingle.mockResolvedValue({
    data: {
      id: 'company-id',
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: null,
    },
  })
  getBillingConfig.mockResolvedValue({
    tiers: {
      pro: { stripePriceIdMonth: 'price_pro', stripePriceIdYear: 'price_pro_year' },
      business: {
        stripePriceIdMonth: 'price_business',
        stripePriceIdYear: 'price_business_year',
      },
    },
    topUpPacks: [{ credits: 1000, priceCents: 2000 }],
  })
  stripeCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' })
  stripePortalCreate.mockResolvedValue({ url: 'https://billing.stripe.test/session' })
  stripeSubscriptionRetrieve.mockResolvedValue(null)
  getStripeClient.mockResolvedValue({
    checkout: { sessions: { create: stripeCheckoutCreate } },
    billingPortal: { sessions: { create: stripePortalCreate } },
    subscriptions: { retrieve: stripeSubscriptionRetrieve },
  })
  serviceSingle.mockResolvedValue({
    data: {
      id: 'company-id',
      email: 'owner@example.com',
      stripe_account_id: 'acct_test',
    },
  })
  requireServiceClient.mockReturnValue({ from: serviceFrom })
  getIntegrationKey.mockResolvedValue('ca_test')
  mintOAuthState.mockReturnValue('signed-state')
  buildAuthorizeUrl.mockReturnValue('https://connect.stripe.com/oauth/authorize?state=signed-state')
  deauthorize.mockResolvedValue(undefined)
})

describe('SAFE-01/SAFE-02: billing and Stripe Connect routes deny demo effects', () => {
  for (const routeCase of routeCases) {
    for (const signal of ['dedicated demo user', 'deterministic demo company']) {
      it(`returns the standard 403 before effects for ${routeCase.name} (${signal})`, async () => {
        demoGuardResponse.mockResolvedValue(demoDenied())

        const handler = await routeCase.load()
        const response = await handler(routeCase.request())

        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toMatchObject({ error: 'demo_readonly' })
        expect(demoGuardResponse).toHaveBeenCalledOnce()
        for (const effect of routeCase.effects) {
          expect(effect, `${routeCase.name} must stop before ${effect.getMockName()}`).not.toHaveBeenCalled()
        }
      })
    }

    it(`preserves unauthenticated behavior for ${routeCase.name}`, async () => {
      getClaims.mockResolvedValue({ data: { claims: null } })
      getAuthClaims.mockResolvedValue(null)

      const handler = await routeCase.load()
      const response = await handler(routeCase.request())

      expect(response.status).toBe(routeCase.unauthenticatedStatus)
      routeCase.assertUnauthenticated?.(response)
      expect(demoGuardResponse).not.toHaveBeenCalled()
      for (const effect of routeCase.effects) {
        expect(effect).not.toHaveBeenCalled()
      }
    })

    it(`preserves the normal-tenant effect path for ${routeCase.name}`, async () => {
      const handler = await routeCase.load()
      const response = await handler(routeCase.request())

      expect(response.status).toBeLessThan(400)
      expect(demoGuardResponse).toHaveBeenCalledOnce()
      routeCase.assertNormalEffect()
    })
  }
})
