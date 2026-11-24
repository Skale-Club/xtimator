// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import type Stripe from 'stripe'

// Only Stripe sandbox and the development database may receive effects.
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))
vi.mock('@/lib/marketing/conversions/queue', () => ({ queueMarketingConversion: vi.fn() }))
vi.mock('@/lib/affiliates/accrual', () => ({ accrueCommissionForInvoice: vi.fn(), reverseCommissionForInvoice: vi.fn() }))
vi.mock('@/lib/platform-config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/platform-config')>()
  return {
    ...actual,
    getIntegrationKey: async (provider: string) => provider === 'stripe_test' ? process.env.QA_STRIPE_TEST_KEY || null : null,
  }
})

import { getStripeClient } from '@/lib/billing/stripe-client'
import { buyCreditPack, resumeCreditPurchase } from '@/lib/billing/credit-purchase'
import { createSubscriptionCheckout } from '@/lib/billing/subscription-checkout'
import { processVerifiedStripeEvent } from '@/lib/billing/stripe-event-processing'
import type { BillingOperation } from '@/lib/billing/operations'

const sandbox = process.env.RUN_PAYMENT_SANDBOX === '1' ? describe.sequential : describe.skip
const DEV_PROJECT = 'prmqgcrnpuvpzruyzvuv'
const DEV_ORIGIN = `https://${DEV_PROJECT}.supabase.co`
const DEV_POOLER = 'aws-0-us-west-2.pooler.supabase.com'
const companyId = randomUUID()
const runMarker = randomUUID()
const companyName = `qa-${companyId} payment sandbox ${runMarker.slice(0, 8)}`
const metadata = { companyId, qa_run_id: runMarker }
const eventIds: string[] = []
let db: pg.Client
let dbConnected = false
let ownerId: string | undefined
let stripe: Stripe
let customerId: string
let cardId: string
let firstPi: string
let chargeId: string
let creditCheckoutSession: string | undefined
let subscriptionSession: string
let subscriptionId: string | null = null
const evidence = {
  companyId, runMarker, environment: 'development + Stripe test mode', checks: [] as string[],
  preflightStage: 'environment',
  preflightPassed: false, customerId: null as string | null, subscriptionSession: null as string | null,
  failureCode: null as string | null,
  companyDeleted: false, customerDeleted: false, archivedProducts: 0, archivedPrices: 0,
  unmarkedCreditCatalogRetained: false, suppressedProviderLogs: 0,
  cleanupFailures: [] as string[],
}
const checks = evidence.checks
function saveEvidence() {
  mkdirSync('qa-results', { recursive: true })
  writeFileSync('qa-results/payment-sandbox.json', JSON.stringify(evidence, null, 2))
}
class SandboxGuardError extends Error {}

function databaseConfig() {
  if (process.env.DATA_API_MODE !== 'supabase' || process.env.NODE_ENV !== 'test'
    || process.env.NEXT_PUBLIC_AUTH_MODE !== 'owned' || process.env.NEXT_PUBLIC_SUPABASE_URL !== DEV_ORIGIN
    || (process.env.DATA_API_UPSTREAM_URL && process.env.DATA_API_UPSTREAM_URL !== DEV_ORIGIN)) {
    throw new SandboxGuardError('The payment sandbox requires owned auth and the exact Supabase development origin')
  }
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(process.env.QA_STRIPE_TEST_KEY ?? '')) {
    throw new SandboxGuardError('A Stripe test-mode API key is required')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new SandboxGuardError('The Supabase development API keys are required')
  }
  try {
    const url = new URL(process.env.QA_DEV_DATABASE_URL ?? '')
    const sslMode = url.searchParams.get('sslmode')
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== DEV_POOLER
      || url.port !== '6543' || url.username !== `postgres.${DEV_PROJECT}` || url.pathname !== '/postgres'
      || !url.password || url.hash || [...url.searchParams.keys()].some(key => key !== 'sslmode')
      || (sslMode && !['require', 'verify-full'].includes(sslMode))) throw new Error('Invalid target')
    return {
      host: DEV_POOLER, port: 6543, database: 'postgres', user: url.username,
      password: decodeURIComponent(url.password),
      ssl: { ca: readFileSync(new URL('../fixtures/supabase-dev-root.crt', import.meta.url), 'utf8'), rejectUnauthorized: true },
      connectionTimeoutMillis: 10_000,
    }
  } catch {
    throw new SandboxGuardError('The exact TLS Supabase development transaction pooler is required')
  }
}
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
    if (found) {
      const official = await stripe.events.retrieve(found.id)
      if (official.livemode !== false || official.type !== type || !('id' in official.data.object) || official.data.object.id !== objectId) {
        throw new SandboxGuardError('Reserved Stripe event did not match the test object')
      }
      eventIds.push(official.id)
      return official
    }
    await pause()
  }
  throw new Error(`Stripe sandbox event not available: ${type}`)
}
async function safe(fn: () => Promise<void>) {
  try { await fn() } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
    const diagnosticCodes = new Set(['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED',
      'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', '28P01', '3D000', '53300', '42501', '42P01', '23503'])
    if (diagnosticCodes.has(code)) evidence.failureCode = code
    if (err instanceof SandboxGuardError) throw err
    if (err instanceof Error && err.name === 'AssertionError') throw new Error('Sandbox assertion failed')
    throw new Error('Sandbox verification failed at the named test step')
  }
}
function buy(key: string, client = stripe, paymentMethod = cardId) {
  return buyCreditPack({ stripe: client, companyId, requestId: key, request: {
    packIndex: 0, pack: { credits: 900, priceCents: 1000 }, priceCents: 1000, currency: 'usd',
    customerId, cardId: paymentMethod, card: { brand: 'visa', last4: '4242' }, returnTo: null, useOtherCard: false,
  } })
}

async function assertOwnedCheckout(id: string, requireMarker = false) {
  const session = await stripe.checkout.sessions.retrieve(id)
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id
  if (session.id !== id || session.livemode !== false || customer !== customerId
    || (requireMarker && (session.metadata?.companyId !== companyId || session.metadata.qa_run_id !== runMarker))) {
    throw new SandboxGuardError('Refused an unverified sandbox Checkout session')
  }
  return session
}

async function archiveSubscriptionCatalog(id: string) {
  for await (const line of stripe.checkout.sessions.listLineItems(id, { limit: 100 })) {
    const price = line.price
    if (!price) throw new SandboxGuardError('Cannot verify the generated subscription price')
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    const product = await stripe.products.retrieve(productId)
    if (price.livemode !== false || product.livemode !== false || product.id !== productId
      || product.metadata.companyId !== companyId || product.metadata.qa_run_id !== runMarker) {
      throw new SandboxGuardError('Refused to archive an unmarked Stripe catalog item')
    }
    if (price.active) {
      await stripe.prices.update(price.id, { active: false })
      evidence.archivedPrices++
    }
    if (product.active) {
      await stripe.products.update(productId, { active: false })
      evidence.archivedProducts++
    }
  }
}

async function cleanStripe() {
  if (!customerId || !stripe) return
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted || customer.id !== customerId || customer.livemode !== false
    || customer.metadata.companyId !== companyId || customer.metadata.qa_run_id !== runMarker) {
    throw new SandboxGuardError('Refused to delete an unmarked Stripe test customer')
  }
  try {
    if (creditCheckoutSession) {
      const session = await assertOwnedCheckout(creditCheckoutSession)
      if (session.status === 'open') await stripe.checkout.sessions.expire(creditCheckoutSession)
      // The app's 3DS Checkout creates its catalog inline without the test marker.
      evidence.unmarkedCreditCatalogRetained = true
    }
    if (subscriptionSession) {
      const session = await assertOwnedCheckout(subscriptionSession, true)
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        if (subscription.id !== subscriptionId || subscription.livemode !== false || customer !== customerId
          || subscription.metadata.companyId !== companyId || subscription.metadata.qa_run_id !== runMarker) {
          throw new SandboxGuardError('Refused to cancel an unmarked Stripe test subscription')
        }
        if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscriptionId)
      } else if (session.status === 'open') {
        await stripe.checkout.sessions.expire(subscriptionSession)
      }
      await archiveSubscriptionCatalog(subscriptionSession)
    }
  } finally {
    const deleted = await stripe.customers.del(customerId)
    if (!deleted.deleted || deleted.id !== customerId) throw new SandboxGuardError('Stripe did not confirm deletion of the test customer')
    evidence.customerDeleted = true
  }
}

async function cleanDatabase() {
  if (!db) return
  try {
    if (!dbConnected || !ownerId) return
    await db.query('BEGIN')
    try {
      const { rows: [company] } = await db.query('SELECT id, user_id, name FROM public.companies WHERE id=$1 FOR UPDATE', [companyId])
      if (company) {
        if (company.id !== companyId || company.user_id !== ownerId || company.name !== companyName) {
          throw new SandboxGuardError('Refused to delete an unmarked development company')
        }
        await db.query('DELETE FROM public.stripe_credit_reversals WHERE company_id=$1', [companyId])
        await db.query('DELETE FROM public.processed_stripe_events WHERE event_id=ANY($1::text[])', [eventIds])
        const deleted = await db.query('DELETE FROM public.companies WHERE id=$1 AND user_id=$2 AND name=$3 RETURNING id', [companyId, ownerId, companyName])
        if (deleted.rowCount !== 1 || deleted.rows[0].id !== companyId) throw new SandboxGuardError('Development company cleanup was not confirmed')
      }
      await db.query('COMMIT')
      evidence.companyDeleted = Boolean(company)
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  } finally {
    await db.end()
  }
}

sandbox('payment launch against real Stripe sandbox and development PostgreSQL', () => {
  beforeAll(() => safe(async () => {
    const pgConfig = databaseConfig()
    const countProviderLog = () => { evidence.suppressedProviderLogs++ }
    vi.spyOn(console, 'warn').mockImplementation(countProviderLog)
    vi.spyOn(console, 'error').mockImplementation(countProviderLog)
    evidence.preflightStage = 'stripe-mode'
    stripe = await getStripeClient()
    if ((await stripe.balance.retrieve()).livemode !== false) throw new SandboxGuardError('Stripe test mode could not be verified')
    evidence.preflightStage = 'stripe-account'
    const account = await stripe.accounts.retrieveCurrent()
    if (account.id !== 'acct_1TqXToRWC5n20aq6') throw new SandboxGuardError('Wrong Stripe platform account')
    evidence.preflightStage = 'stripe-webhook-endpoints'
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (endpoint.status === 'enabled') throw new SandboxGuardError('An enabled Stripe webhook endpoint prevents sandbox execution')
    }
    evidence.preflightStage = 'development-database'
    db = new pg.Client(pgConfig)
    await db.connect()
    dbConnected = true
    const { rows: [owner] } = await db.query<{ user_id: string }>(
      'SELECT c.user_id FROM public.companies c JOIN public.xtimator_accounts a ON a.id=c.user_id LIMIT 1',
    )
    if (!owner?.user_id) throw new SandboxGuardError('No owned development account is available for fixture ownership')
    ownerId = owner.user_id
    evidence.preflightStage = 'verified'
    evidence.preflightPassed = true
    await db.query("INSERT INTO public.companies(id,user_id,name,currency_code,sms_delivery_enabled,email_delivery_enabled) VALUES($1,$2,$3,'USD',false,false)", [companyId, ownerId, companyName])
    const inserted = await db.query('SELECT id FROM public.companies WHERE id=$1 AND user_id=$2 AND name=$3', [companyId, ownerId, companyName])
    if (inserted.rows[0]?.id !== companyId) throw new SandboxGuardError('Development company readback did not match the marked fixture')
    const customer = await stripe.customers.create({ name: 'Xtimator Sandbox QA', email: `payments-${runMarker}@example.invalid`, metadata })
    customerId = customer.id
    if (customer.livemode !== false || customer.metadata.companyId !== companyId || customer.metadata.qa_run_id !== runMarker) {
      throw new SandboxGuardError('Stripe customer readback did not match the marked test fixture')
    }
    cardId = (await stripe.paymentMethods.attach('pm_card_visa', { customer: customerId })).id
    evidence.customerId = customerId; saveEvidence()
  }), 60_000)

  afterAll(async () => {
    try {
      const results = await Promise.allSettled([cleanStripe(), cleanDatabase()])
      if (results[0].status === 'rejected') evidence.cleanupFailures.push('stripe-test-fixture')
      if (results[1].status === 'rejected') evidence.cleanupFailures.push('development-company')
      saveEvidence()
      if (evidence.cleanupFailures.length) throw new SandboxGuardError('Payment sandbox fixture cleanup could not be confirmed')
    } finally {
      vi.restoreAllMocks()
    }
  }, 60_000)

  it('charges and grants once, then reuses the completed purchase', () => safe(async () => {
    expect((await buy('sandbox-direct-first')).mode).toBe('charged')
    expect(await balance()).toBe(900)
    expect((await buy('sandbox-direct-first')).mode).toBe('charged')
    expect(await balance()).toBe(900)
    const op = await operation('sandbox-direct-first'); firstPi = op.stripe_object_id!
    const payments = (await stripe.paymentIntents.list({ customer: customerId, limit: 100 })).data.filter(pi => pi.metadata.operationId === op.id)
    expect(payments.length).toBe(1); expect(payments[0].livemode).toBe(false)
    expect(payments[0].id).toBe(firstPi)
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
    if (!op.stripe_object_id) throw new SandboxGuardError('No credit Checkout was recorded for the test operation')
    creditCheckoutSession = op.stripe_object_id
    await assertOwnedCheckout(creditCheckoutSession)
    const original = (await stripe.paymentIntents.list({ customer: customerId, limit: 100 })).data.find(pi => pi.metadata.operationId === op.id)
    expect(original?.status).toBe('canceled')
    await stripe.checkout.sessions.expire(creditCheckoutSession)
    await expect(resumeCreditPurchase(stripe, op)).rejects.toThrow('expired')
    expect(await balance()).toBe(900)
    checks.push('Real 3DS-required card: original intent canceled before Checkout; expiration closed without grant'); saveEvidence()
  }), 60_000)

  it('reuses one real subscription Checkout despite a changed interval request', () => safe(async () => {
    const params: Stripe.Checkout.SessionCreateParams = { mode: 'subscription', customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', unit_amount: 2900, recurring: { interval: 'month' }, product_data: { name: 'Xtimator Pro sandbox readiness', metadata } }, quantity: 1 }],
      metadata: { ...metadata, plan: 'pro', billing_interval: 'month' }, subscription_data: { metadata: { ...metadata, plan: 'pro' } },
      success_url: 'https://example.com/?xtimator_sandbox_complete=1', cancel_url: 'https://example.com/?xtimator_sandbox_cancelled=1' }
    const url = await createSubscriptionCheckout(stripe, companyId, params)
    const row = (await db.query("SELECT * FROM billing_operations WHERE company_id=$1 AND kind='subscription_checkout'", [companyId])).rows[0]
    subscriptionSession = row.stripe_object_id
    expect(await createSubscriptionCheckout(stripe, companyId, { ...params, metadata: { ...params.metadata, billing_interval: 'year' } })).toBe(url)
    expect((await stripe.checkout.sessions.list({ customer: customerId, limit: 100 })).data.filter(s => s.mode === 'subscription').length).toBe(1)
    evidence.subscriptionSession = subscriptionSession
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
