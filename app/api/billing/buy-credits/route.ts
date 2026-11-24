import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { isTwaRequest, TWA_PURCHASE_BLOCKED_BODY } from '@/lib/pwa/twa-context'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { rateLimit } from '@/lib/ratelimit'
import { resolveBillingCurrency, resolvePackPrice } from '@/lib/billing/billing-currency'
import { isTopupEligible, TOPUP_REQUIRES_SUBSCRIPTION_BODY } from '@/lib/billing/topup-eligibility'
import { buyCreditPack, resumeCreditPurchase, PAYMENT_PENDING, PaymentClosedError } from '@/lib/billing/credit-purchase'
import { findPendingCreditPurchase } from '@/lib/billing/operations'
import { ensureStripeCustomer } from '@/lib/billing/stripe-customer'
import { resolveSavedCard } from '@/lib/billing/saved-card'
import { defaultPackIndex, packViews } from '@/lib/billing/pack-display'
import { getAccessState } from '@/lib/billing/access-state'

/**
 * Credits plan 2026-11-20 - buy a credit pack in one click.
 *
 * GET  what the buy dialog shows: the packs (credits, price, estimate range,
 *      best value), the saved card, the balance. Pro with a live subscription
 *      only; anyone else gets `eligible: false` and is pointed at the plan.
 * POST charges the saved card right away (off-session PaymentIntent, the same
 *      card the subscription bills) and grants the credits on success. With no
 *      saved card, a card that needs the bank's confirmation, or a decline, it
 *      answers with a Checkout URL instead - the money path never dead-ends.
 *
 * Double charges: the PaymentIntent is created with an idempotency key from
 * the client's per-click requestId, and the grant is keyed on the PaymentIntent
 * id (`directtopup:{pi}`), the same key the payment_intent.succeeded webhook
 * uses, so the synchronous grant and the webhook backstop never both apply.
 */

type CompanyRow = {
  id: string
  stripe_customer_id: string | null
  tier: string | null
  stripe_subscription_status: string | null
  stripe_subscription_id: string | null
  currency_code: string | null
}

const OWNER_REQUIRED = { error: 'Only the company owner can manage billing.', code: 'owner_required' }

async function loadContext(): Promise<
  { ok: true; company: CompanyRow } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (await isTwaRequest()) {
    return { ok: false, response: NextResponse.json(TWA_PURCHASE_BLOCKED_BODY, { status: 403 }) }
  }
  const blocked = await demoGuardResponse()
  if (blocked) return { ok: false, response: blocked }

  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return { ok: false, response: NextResponse.json({ error: 'Company not found' }, { status: 400 }) }
  }
  try {
    await requireCompanyOwner(companyId)
  } catch {
    return { ok: false, response: NextResponse.json(OWNER_REQUIRED, { status: 403 }) }
  }
  const { data } = await supabase
    .from('companies')
    .select('id, stripe_customer_id, tier, stripe_subscription_status, stripe_subscription_id, currency_code')
    .eq('id', companyId)
    .maybeSingle()
  if (!data?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Company not found' }, { status: 400 }) }
  }
  return { ok: true, company: data as CompanyRow }
}

function eligible(company: CompanyRow): boolean {
  return isTopupEligible(company.tier, company.stripe_subscription_status, company.stripe_subscription_id)
}

export async function GET() {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx.response
  const { company } = ctx

  const [cfg, access, pending] = await Promise.all([getBillingConfig(), getAccessState(company.id), findPendingCreditPurchase(company.id)])
  if (!eligible(company) && !pending) {
    return NextResponse.json({ eligible: false, reason: 'subscribe', balance: access.balance })
  }
  const currency = resolveBillingCurrency({ currency_code: company.currency_code }, cfg.brlPricingEnabled === true)
  const stripe = await getStripeClient()
  const card = await resolveSavedCard(stripe, company.stripe_customer_id, company.stripe_subscription_id)
  const packs = packViews(cfg.topUpPacks, currency)

  return NextResponse.json({
    eligible: true,
    pendingPurchase: pending ? { requestId: pending.request_key, packIndex: pending.request.packIndex, useOtherCard: pending.request.useOtherCard, returnTo: pending.request.returnTo } : null,
    balance: access.balance,
    expiryMonths: cfg.topupExpiryMonths,
    packs,
    defaultIndex: defaultPackIndex(packs.length),
    card: card ? { brand: card.brand, last4: card.last4 } : null,
  })
}

export async function POST(request: NextRequest) {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx.response
  const { company } = ctx

  const rl = await rateLimit('billingSessionPerHour', company.id)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many billing requests. Please try again shortly.', code: 'rate_limit:billing_session' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
    )
  }
  const pending = await findPendingCreditPurchase(company.id)
  if (pending) {
    try {
      const result = await resumeCreditPurchase(await getStripeClient(), pending)
      const access = await getAccessState(company.id)
      return NextResponse.json({ ...result, balance: access.balance }, { status: result.mode === 'pending' ? 202 : 200 })
    } catch (err) {
      if (err instanceof PaymentClosedError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
      return NextResponse.json(PAYMENT_PENDING, { status: 202 })
    }
  }
  if (!eligible(company)) return NextResponse.json(TOPUP_REQUIRES_SUBSCRIPTION_BODY, { status: 403 })

  const body = (await request.json().catch(() => null)) as
    | { packIndex?: number; requestId?: string; returnTo?: string; useOtherCard?: boolean }
    | null
  const packIndex = Number(body?.packIndex)
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const cfg = await getBillingConfig()
  const pack = Number.isInteger(packIndex) ? cfg.topUpPacks[packIndex] : undefined
  if (!pack) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })

  const { priceCents, currency } = resolvePackPrice(
    pack,
    resolveBillingCurrency({ currency_code: company.currency_code }, cfg.brlPricingEnabled === true)
  )
  const stripe = await getStripeClient()

  const card = await resolveSavedCard(stripe, company.stripe_customer_id, company.stripe_subscription_id)
  try {
    const result = await buyCreditPack({
      stripe, companyId: company.id, requestId,
      request: {
        packIndex, pack, priceCents, currency,
        customerId: await ensureStripeCustomer(stripe, company.id),
        cardId: card?.id ?? null,
        card: card ? { brand: card.brand, last4: card.last4 } : null,
        returnTo: typeof body?.returnTo === 'string' ? body.returnTo : null,
        useOtherCard: body?.useOtherCard === true,
      },
    })
    const access = await getAccessState(company.id)
    return NextResponse.json({ ...result, balance: access.balance }, { status: result.mode === 'pending' ? 202 : 200 })
  } catch (err) {
    if (err instanceof PaymentClosedError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    // A durable reservation may already exist, and Stripe's response may have
    // been lost. Keep the purchase identity; never offer an unrelated charge.
    return NextResponse.json(PAYMENT_PENDING, { status: 202 })
  }
}
