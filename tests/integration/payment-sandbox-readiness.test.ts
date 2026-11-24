// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import pg from 'pg'
import type Stripe from 'stripe'

// Only Stripe sandbox and the development database may receive effects.
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))
vi.mock('@/lib/marketing/conversions/queue', () => ({ queueMarketingConversion: vi.fn() }))
vi.mock('@/lib/affiliates/accrual', () => ({ accrueCommissionForInvoice: vi.fn(), reverseCommissionForInvoice: vi.fn() }))

import { getStripeClient } from '@/lib/billing/stripe-client'
import { buyCreditPack, resumeCreditPurchase } from '@/lib/billing/credit-purchase'
import { createSubscriptionCheckout } from '@/lib/billing/subscription-checkout'
import { processVerifiedStripeEvent } from '@/lib/billing/stripe-event-processing'
import type { BillingOperation } from '@/lib/billing/operations'

const sandbox = process.env.RUN_PAYMENT_SANDBOX === '1' ? describe.sequential : describe.skip
const companyId = randomUUID()
const eventIds: string[] = []
let db: pg.Client
let stripe: Stripe
let customerId: string
let cardId: string
let firstPi: string
let chargeId: string
let subscriptionSession: string
let subscriptionId: string | null = null
const evidence: Record<string, unknown> = { companyId, environment: 'development + Stripe test mode', checks: [] }
const checks = evidence.checks as string[]
const saveEvidence = () => writeFileSync('.payment-sandbox-evidence.json', JSON.stringify(evidence, null, 2))
const pause = () => new Promise(resolve => setTimeout(resolve, 500))
async function balance() { return Number((await db.query('SELECT credit_balance FROM companies WHERE id=$1', [companyId])).rows[0].credit_balance) }
async function operation(key: string): Promise<BillingOperation> {
  return (await db.query('SELECT * FROM billing_operations WHERE company_id=$1 AND request_key=$2', [companyId, key])).rows[0]
}
async function event(type: Stripe.Event.Type, objectId: string) {
  for (let i = 0; i < 30; i++) {
    const found = (await stripe.events.list({ type, limit: 100 })).data.find(e =>
      'id' in e.data.object && e.data.object.id === objectId && !eventIds.includes(e.id),
    )
    if (found) { eventIds.push(found.id); return await stripe.events.retrieve(found.id) }
    await pause()
  }
  throw new Error(`Stripe sandbox event not available: ${type}`)
}
async function safe(fn: () => Promise<void>) {
  try { await fn() } catch (err) {
    // Provider errors can contain expanded PaymentIntents/client secrets.
    throw new Error((err instanceof Error ? err.message : 'Sandbox verification failed')
      .replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g, '[REDACTED]')
      .replace(/(?:pi|seti)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, '[REDACTED]'))
  }
}
function buy(key: string, client = stripe, paymentMethod = cardId) {
  return buyCreditPack({ stripe: client, companyId, requestId: key, request: {
    packIndex: 0, pack: { credits: 900, priceCents: 1000 }, priceCents: 1000, currency: 'usd',
    customerId, cardId: paymentMethod, card: { brand: 'visa', last4: '4242' }, returnTo: null, useOtherCard: false,
  } })
}

sandbox('payment launch against real Stripe sandbox and development PostgreSQL', () => {
  beforeAll(async () => {
    vi.stubEnv('DATA_API_MODE', 'supabase')
    vi.stubEnv('NODE_ENV', 'test')
    const url = process.env.MIGRATION_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL
    if (!url || !new URL(url).username.includes('prmqgcrnpuvpzruyzvuv') || !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('prmqgcrnpuvpzruyzvuv')) throw new Error('Explicit Xtimator development database required')
    stripe = await getStripeClient()
    if ((await stripe.balance.retrieve()).livemode) throw new Error('LIVE MODE REFUSED')
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
    if (endpoints.data.some(e => e.status === 'enabled' && new URL(e.url).hostname.endsWith('xtimator.com'))) throw new Error('Sandbox endpoints must not target production')
    const account = await stripe.accounts.retrieveCurrent()
    if (account.id !== 'acct_1TqXToRWC5n20aq6') throw new Error('Wrong Stripe platform account')
    db = new pg.Client({ connectionString: url }); await db.connect()
    const owner = (await db.query('SELECT user_id FROM companies LIMIT 1')).rows[0]?.user_id
    await db.query("INSERT INTO companies(id,user_id,name,currency_code,sms_delivery_enabled,email_delivery_enabled) VALUES($1,$2,'Payment sandbox readiness','USD',false,false)", [companyId, owner])
    const customer = await stripe.customers.create({ name: 'Xtimator Sandbox QA', email: 'payments-qa@example.invalid', metadata: { companyId, readiness_test: 'true' } })
    customerId = customer.id
    cardId = (await stripe.paymentMethods.attach('pm_card_visa', { customer: customerId })).id
    evidence.customerId = customerId; saveEvidence()
  }, 60_000)

  afterAll(async () => {
    if (subscriptionId && stripe) await stripe.subscriptions.cancel(subscriptionId).catch(() => {})
    if (subscriptionSession && stripe && !subscriptionId) await stripe.checkout.sessions.expire(subscriptionSession).catch(() => {})
    if (db) {
      await db.query('DELETE FROM stripe_credit_reversals WHERE company_id=$1', [companyId])
      await db.query('DELETE FROM processed_stripe_events WHERE event_id=ANY($1::text[])', [eventIds])
      await db.query('DELETE FROM companies WHERE id=$1', [companyId])
      await db.end()
    }
    saveEvidence(); vi.unstubAllEnvs()
  }, 60_000)

  it('charges and grants once, then reuses the completed purchase', () => safe(async () => {
    expect((await buy('sandbox-direct-first')).mode).toBe('charged')
    expect(await balance()).toBe(900)
    expect((await buy('sandbox-direct-first')).mode).toBe('charged')
    expect(await balance()).toBe(900)
    const op = await operation('sandbox-direct-first'); firstPi = op.stripe_object_id!
    const payments = (await stripe.paymentIntents.list({ customer: customerId, limit: 100 })).data.filter(pi => pi.metadata.operationId === op.id)
    expect(payments.length).toBe(1); expect(payments[0].livemode).toBe(false)
    chargeId = typeof payments[0].latest_charge === 'string' ? payments[0].latest_charge : payments[0].latest_charge!.id
    checks.push('Real test card charged once; strict grant and duplicate request converge at 900 credits'); saveEvidence()
  }), 60_000)

  it('retrieves the official paid Event and replays it without granting twice', () => safe(async () => {
    const paid = await event('payment_intent.succeeded', firstPi)
    expect((await processVerifiedStripeEvent(paid, stripe)).status).toBe(200)
    expect((await processVerifiedStripeEvent(paid, stripe)).status).toBe(200)
    expect(await balance()).toBe(900)
    checks.push('Official Stripe Event fulfilled/replayed through real inbox and ledger without duplicate credits'); saveEvidence()
  }), 60_000)

  it('recovers an actual accepted charge whose API response was deliberately lost', () => safe(async () => {
    const uncertain = Object.create(stripe) as Stripe
    uncertain.paymentIntents = Object.create(stripe.paymentIntents)
    uncertain.paymentIntents.create = (async (...args: Parameters<Stripe['paymentIntents']['create']>) => {
      await stripe.paymentIntents.create(...args)
      throw new Error('Injected response loss after Stripe accepted the charge')
    }) as Stripe['paymentIntents']['create']
    expect((await buy('sandbox-response-lost', uncertain)).mode).toBe('pending')
    expect(await balance()).toBe(900)
    expect((await buy('sandbox-response-lost')).mode).toBe('charged')
    expect(await balance()).toBe(1800)
    const op = await operation('sandbox-response-lost')
    expect((await stripe.paymentIntents.list({ customer: customerId, limit: 100 })).data.filter(pi => pi.metadata.operationId === op.id).length).toBe(1)
    checks.push('Injected real API response loss recovered with same Stripe key: one payment, one grant'); saveEvidence()
  }), 60_000)

  it('reconciles actual partial and remaining refunds cumulatively', () => safe(async () => {
    expect((await stripe.refunds.create({ payment_intent: firstPi, amount: 100 })).status).toBe('succeeded')
    const partial = await event('charge.refunded', chargeId)
    expect((await processVerifiedStripeEvent(partial, stripe)).status).toBe(200)
    expect(await balance()).toBe(1710)
    expect((await stripe.refunds.create({ payment_intent: firstPi, amount: 900 })).status).toBe('succeeded')
    const full = await event('charge.refunded', chargeId)
    expect((await processVerifiedStripeEvent(full, stripe)).status).toBe(200)
    expect((await processVerifiedStripeEvent(partial, stripe)).status).toBe(200)
    expect(await balance()).toBe(900)
    checks.push('Actual $1 then $9 test refunds reversed 90 then 810 credits; old event replay did not regress'); saveEvidence()
  }), 60_000)

  it('cancels the original 3DS intent before offering a recoverable Checkout', () => safe(async () => {
    const threeDs = (await stripe.paymentMethods.attach('pm_card_threeDSecure2Required', { customer: customerId })).id
    expect((await buy('sandbox-sca', stripe, threeDs)).mode).toBe('checkout')
    const op = await operation('sandbox-sca')
    const original = (await stripe.paymentIntents.list({ customer: customerId, limit: 100 })).data.find(pi => pi.metadata.operationId === op.id)
    expect(original?.status).toBe('canceled')
    await stripe.checkout.sessions.expire(op.stripe_object_id!)
    await expect(resumeCreditPurchase(stripe, op)).rejects.toThrow('expired')
    expect(await balance()).toBe(900)
    checks.push('Real 3DS-required card: original intent canceled before Checkout; expiration closed without grant'); saveEvidence()
  }), 60_000)

  it('reuses one real subscription Checkout despite a changed interval request', () => safe(async () => {
    const params: Stripe.Checkout.SessionCreateParams = { mode: 'subscription', customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', unit_amount: 2900, recurring: { interval: 'month' }, product_data: { name: 'Xtimator Pro sandbox readiness' } }, quantity: 1 }],
      metadata: { companyId, plan: 'pro', billing_interval: 'month' }, subscription_data: { metadata: { companyId, plan: 'pro' } },
      success_url: 'https://example.com/?xtimator_sandbox_complete=1', cancel_url: 'https://example.com/?xtimator_sandbox_cancelled=1' }
    const url = await createSubscriptionCheckout(stripe, companyId, params)
    expect(await createSubscriptionCheckout(stripe, companyId, { ...params, metadata: { ...params.metadata, billing_interval: 'year' } })).toBe(url)
    const row = (await db.query("SELECT * FROM billing_operations WHERE company_id=$1 AND kind='subscription_checkout'", [companyId])).rows[0]
    subscriptionSession = row.stripe_object_id
    expect((await stripe.checkout.sessions.list({ customer: customerId, limit: 100 })).data.filter(s => s.mode === 'subscription').length).toBe(1)
    evidence.subscriptionSession = subscriptionSession; evidence.checkoutUrl = url
    checks.push('Real subscription Checkout reused across interval changes'); saveEvidence()
  }), 60_000)

  it.skipIf(process.env.RUN_PAYMENT_BROWSER !== '1')('fulfills the browser-completed test subscription from official Stripe events', () => safe(async () => {
    let session = await stripe.checkout.sessions.retrieve(subscriptionSession)
    for (let i = 0; i < 480 && session.status !== 'complete'; i++) { await pause(); session = await stripe.checkout.sessions.retrieve(subscriptionSession) }
    expect(session.status).toBe('complete')
    subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription!.id
    const paidEvent = await event('invoice.paid', (await stripe.subscriptions.retrieve(subscriptionId)).latest_invoice as string)
    expect((await processVerifiedStripeEvent(paidEvent, stripe)).status).toBe(200)
    const checkoutEvent = await event('checkout.session.completed', subscriptionSession)
    expect((await processVerifiedStripeEvent(checkoutEvent, stripe)).status).toBe(200)
    expect(await balance()).toBe(3900)
    const company = (await db.query('SELECT tier,stripe_subscription_id FROM companies WHERE id=$1', [companyId])).rows[0]
    expect(company.tier).toBe('pro'); expect(company.stripe_subscription_id).toBe(subscriptionId)
    checks.push('Browser paid a test subscription; invoice-before-Checkout delivery repaired Free tier and granted monthly credits exactly once'); saveEvidence()
  }), 300_000)
})
