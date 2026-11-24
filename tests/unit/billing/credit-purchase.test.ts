import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { BillingOperation } from '@/lib/billing/operations'

const state = vi.hoisted(() => ({ op: null as BillingOperation | null, locked: false }))
vi.mock('@/lib/billing/operations', () => ({
  reserveBillingOperation: vi.fn(async (company: string, _kind: string, key: string, request: object) => {
    if (state.op && state.op.status !== 'completed') return state.op
    if (state.op?.request_key === key) return state.op
    return state.op = { id: 'op_1', company_id: company, kind: 'credit_purchase', request_key: key,
      request, created_at: new Date().toISOString(), status: 'pending', stripe_object_id: null, result: {} } as BillingOperation
  }),
  claimBillingOperation: vi.fn(async () => state.locked ? null : 'lease'),
  saveBillingOperation: vi.fn(async (_id: string, _token: string, fields: object) => { Object.assign(state.op!, fields) }),
  releaseBillingOperation: vi.fn(async () => {}),
  canReplayStripeCreate: (date: string) => Date.now() - Date.parse(date) < 23 * 3600_000,
}))
vi.mock('@/lib/billing/credit-ledger', () => ({ grantCredits: vi.fn() }))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn(async () => ({ topupExpiryMonths: 3 })) }))
vi.mock('@/lib/billing/topup-checkout', () => ({ createTopupCheckoutSession: vi.fn() }))
const { releaseBillingOperation, saveBillingOperation } = await import('@/lib/billing/operations')
const { grantCredits } = await import('@/lib/billing/credit-ledger')
const { createTopupCheckoutSession } = await import('@/lib/billing/topup-checkout')
const { buyCreditPack, resumeCreditPurchase } = await import('@/lib/billing/credit-purchase')
const create = vi.fn(), retrieve = vi.fn(), cancel = vi.fn(), checkoutRetrieve = vi.fn()
const stripe = { paymentIntents: { create, retrieve, cancel }, checkout: { sessions: { retrieve: checkoutRetrieve } } } as unknown as Stripe
const request = { packIndex: 0, pack: { credits: 900, priceCents: 1000 }, priceCents: 1000,
  currency: 'usd' as const, customerId: 'cus_1', cardId: 'pm_1', card: { brand: 'Visa', last4: '4242' },
  returnTo: '/settings/billing', useOtherCard: false }
const buy = (key = 'request-1', changes = {}) => buyCreditPack({ stripe, companyId: 'co_1', requestId: key, request: { ...request, ...changes } })
beforeEach(() => {
  vi.clearAllMocks(); state.op = null; state.locked = false
  create.mockResolvedValue({ id: 'pi_1', status: 'succeeded' })
  retrieve.mockResolvedValue({ id: 'pi_1', status: 'succeeded' })
  cancel.mockResolvedValue({ id: 'pi_1', status: 'canceled' })
  vi.mocked(grantCredits).mockResolvedValue({ applied: true })
  vi.mocked(createTopupCheckoutSession).mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/a' } as never)
})
describe('durable credit purchases', () => {
  it('reports fulfillment only after a strict durable grant, including an already-delivered replay', async () => {
    vi.mocked(grantCredits).mockResolvedValue({ applied: false })
    expect(await buy()).toMatchObject({ mode: 'charged', granted: true, credits: 900 })
    expect(grantCredits).toHaveBeenCalledWith(expect.objectContaining({ throwOnError: true, idempotencyKey: 'directtopup:pi_1' }))
    await buy()
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('a response timeout remains pending and never creates a second Checkout', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Timeout'), { type: 'StripeConnectionError' }))
    expect(await buy()).toMatchObject({ mode: 'pending' })
    expect(createTopupCheckoutSession).not.toHaveBeenCalled()
    expect(await buy('different-request-after-reload', { priceCents: 5000, cardId: 'pm_other' })).toMatchObject({ mode: 'charged' })
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1])
    expect(create.mock.calls[1][0]).toMatchObject({ amount: 1000, payment_method: 'pm_1' })
  })
  it('a failed grant is retried from the same PaymentIntent without charging again', async () => {
    vi.mocked(grantCredits).mockRejectedValueOnce(new Error('Database down'))
    await expect(buy()).rejects.toThrow('Database down')
    expect(state.op?.stripe_object_id).toBe('pi_1')
    expect(await buy('reload')).toMatchObject({ mode: 'charged', granted: true })
    expect(create).toHaveBeenCalledTimes(1)
    expect(retrieve).toHaveBeenCalledWith('pi_1')
  })
  it('a processing payment is neither granted nor canceled nor offered a new Checkout', async () => {
    create.mockResolvedValue({ id: 'pi_1', status: 'processing' })
    expect(await buy()).toMatchObject({ mode: 'pending' })
    expect(grantCredits).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled()
    expect(createTopupCheckoutSession).not.toHaveBeenCalled()
  })
  it('bank authentication can fall back only after the original PaymentIntent is confirmed canceled', async () => {
    create.mockRejectedValue({ payment_intent: { id: 'pi_1', status: 'requires_action' } })
    cancel.mockRejectedValueOnce(new Error('Unknown cancel result'))
    await expect(buy()).rejects.toThrow('Unknown cancel result')
    expect(createTopupCheckoutSession).not.toHaveBeenCalled()
    retrieve.mockResolvedValue({ id: 'pi_1', status: 'requires_action' })
    expect(await buy()).toMatchObject({ mode: 'checkout' })
    expect(cancel).toHaveBeenCalledTimes(2)
  })
  it('concurrent workers and an expired unknown create cannot charge', async () => {
    state.locked = true
    expect(await buy()).toMatchObject({ mode: 'pending' }); expect(create).not.toHaveBeenCalled()
    state.locked = false; state.op!.created_at = new Date(Date.now() - 24 * 3600_000).toISOString()
    expect(await buy()).toMatchObject({ mode: 'pending' }); expect(create).not.toHaveBeenCalled()
  })
  it('a paid Checkout grants the same session key as its webhook', async () => {
    await buy('other-card', { useOtherCard: true })
    checkoutRetrieve.mockResolvedValue({ id: 'cs_1', status: 'complete', payment_status: 'paid' })
    expect(await buy('reload')).toMatchObject({ granted: true })
    expect(grantCredits).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'topup:cs_1' }))
  })
  it('background recovery never initiates a card charge or a Checkout', async () => {
    state.locked = true; await buy(); state.locked = false
    expect(await resumeCreditPurchase(stripe, state.op!, { recoveryOnly: true })).toMatchObject({ mode: 'pending' })
    expect(create).not.toHaveBeenCalled(); expect(createTopupCheckoutSession).not.toHaveBeenCalled()
  })
})


describe('automatic and manual purchases share one financial boundary', () => {
  it('does not mislabel a concurrent pending manual purchase as an automatic charge', async () => {
    create.mockResolvedValueOnce({ id: 'pi_manual', status: 'processing' })
    await buy()
    retrieve.mockResolvedValueOnce({ id: 'pi_manual', status: 'succeeded' })
    const result = await buy('automatic-next-hour', { purchaseType: 'auto_topup', priceCents: 5000 })
    expect(result).toMatchObject({ mode: 'charged', credits: 900 })
    expect(result).not.toHaveProperty('automatic')
    expect(create).toHaveBeenCalledTimes(1)
    expect(grantCredits).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'directtopup:pi_manual' }))
  })
  it('returns the authorized automatic receipt and shares its webhook grant key', async () => {
    expect(await buy('automatic-attempt', { purchaseType: 'auto_topup' })).toMatchObject({ mode: 'charged', automatic: true, amountCents: 1000, currency: 'usd' })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ type: 'auto_topup', operationId: 'op_1' }) }), expect.anything())
    expect(grantCredits).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'autotopup:pi_1', throwOnError: true }))
  })
})


describe('Checkout lease lifetime', () => {
  it('holds the purchase lease until the remote Checkout id is durably saved', async () => {
    let finish!: (value: never) => void
    vi.mocked(createTopupCheckoutSession).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const attempt = buy('other-card-lease', { useOtherCard: true })
    await vi.waitFor(() => expect(createTopupCheckoutSession).toHaveBeenCalledOnce())
    expect(releaseBillingOperation).not.toHaveBeenCalled()
    finish({ id: 'cs_deferred', url: 'https://checkout.stripe.com/deferred' } as never)
    expect((await attempt).mode).toBe('checkout')
    expect(saveBillingOperation).toHaveBeenCalledWith('op_1', 'lease', { status: 'checkout', stripe_object_id: 'cs_deferred' })
    expect(vi.mocked(saveBillingOperation).mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(releaseBillingOperation).mock.invocationCallOrder[0])
  })
})
