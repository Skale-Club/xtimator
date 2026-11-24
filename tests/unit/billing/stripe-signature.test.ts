import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
const getStripeClient = vi.fn()
const processEvent = vi.fn()
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: (...args: unknown[]) => getStripeClient(...args) }))
vi.mock('@/lib/billing/stripe-event-processing', () => ({ processVerifiedStripeEvent: (...args: unknown[]) => processEvent(...args) }))
const { POST } = await import('@/app/api/webhooks/stripe/route')
const { NextRequest } = await import('next/server')
const body = JSON.stringify({ id: 'evt_real_signature', livemode: false, type: 'invoice.paid', data: { object: {} } })
const sign = (secret = 'whsec_platform', payload = body, timestamp?: number) => Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })
const call = (sig = '', payload = body) => POST(new NextRequest('https://xtimator.com/api/webhooks/stripe', {
  method: 'POST', body: payload, headers: { 'stripe-signature': sig },
}))
afterEach(() => vi.unstubAllEnvs())
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_platform'); vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_connect')
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DATA_API_MODE', 'supabase')
  getStripeClient.mockResolvedValue({}); processEvent.mockResolvedValue(new Response('OK'))
})
describe('real Stripe SDK signature boundary', () => {
  it.each([true, false])('rejects a correctly signed event from the opposite environment (live=%s)', async live => {
    vi.stubEnv('NODE_ENV', live ? 'test' : 'production')
    vi.stubEnv('DATA_API_MODE', live ? 'supabase' : 'postgrest')
    const payload = JSON.stringify({ id: 'evt_other_mode', livemode: live, type: 'invoice.paid', data: { object: {} } })
    expect((await call(sign('whsec_platform', payload), payload)).status).toBe(400)
    expect(getStripeClient).not.toHaveBeenCalled(); expect(processEvent).not.toHaveBeenCalled()
  })
  it.each(['platform', 'connect'])('verifies %s signing secret before provider key/database work', async kind => {
    expect((await call(sign(`whsec_${kind}`))).status).toBe(200)
    expect(processEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_real_signature' }), {})
  })
  it.each(['missing', 'wrong', 'tampered', 'replay', 'unconfigured'])('rejects %s with no provider key lookup or business effects', async scenario => {
    let sig = sign(); let payload = body
    if (scenario === 'missing') sig = ''
    if (scenario === 'wrong') sig = sign('wrong_secret')
    if (scenario === 'tampered') payload += ' '
    if (scenario === 'replay') sig = sign('whsec_platform', body, Math.floor(Date.now() / 1000) - 600)
    if (scenario === 'unconfigured') { vi.stubEnv('STRIPE_WEBHOOK_SECRET', ''); vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', ''); sig = sign('') }
    expect((await call(sig, payload)).status).toBe(400)
    expect(getStripeClient).not.toHaveBeenCalled(); expect(processEvent).not.toHaveBeenCalled()
  })
})
