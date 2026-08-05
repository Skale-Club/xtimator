import { type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
import {
  connectEventRequiresCompanyResolution,
  handleConnectEvent,
  resolveConnectEventCompanyId,
} from '@/lib/billing/connect-webhook'
import { requireServiceClient } from '@/lib/supabase/service'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'
import { grantCredits, monthGrantKey } from '@/lib/billing/credit-ledger'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { resolveTierFromPriceId } from '@/lib/billing/stripe-price-map'
import { notifyOps } from '@/lib/observability/ops-alert'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { accrueCommissionForInvoice } from '@/lib/affiliates/accrual'

// ------------------------------------------------------------------
// POST: Stripe webhook handler (STRIPE-02, STRIPE-04)
//
// CRITICAL order (same as WhatsApp webhook):
//   1. request.text() FIRST — get raw body BEFORE any parsing
//   2. stripe.webhooks.constructEvent() — verifies signature against raw body
//   3. Resolve trusted company identity from the signed event / server rows
//   4. Deny demo-company effects
//   5. Idempotency check — insert event_id into processed_stripe_events
//   6. Handle event — update companies table
//   7. Return 200 — Stripe stops retrying
// ------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Step 1: raw body MUST come before any parsing (RESEARCH Pitfall 1)
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  // Two webhook endpoints share this URL: the platform endpoint (subscription
  // events) and the Connect endpoint (connected-account events). Each has its
  // own signing secret. Try each in turn so a single handler serves both.
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? ''

  let stripe: Stripe
  try {
    stripe = await getStripeClient()
  } catch (err) {
    // Stripe secret key not configured for this deployment. Returning 500/throwing
    // makes Stripe hammer the endpoint with retries and floods Sentry (XTIMATOR-1).
    // Log for server-side visibility and return 503 so Stripe retries later once
    // STRIPE_SECRET_KEY is configured (Coolify env or /admin/integrations).
    console.error('[Stripe] Webhook received but Stripe is not configured:', err instanceof Error ? err.message : err)
    return new Response('Stripe not configured', { status: 503 })
  }

  // Step 2: verify signature — try platform secret first, then connect secret
  let event: Stripe.Event | null = null
  let lastErrorMessage = 'No webhook secrets configured'

  for (const secret of [platformSecret, connectSecret]) {
    if (!secret) continue
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret)
      break
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  if (!event) {
    console.warn('[Stripe] Webhook signature verification failed:', lastErrorMessage)
    return new Response(`Webhook error: ${lastErrorMessage}`, { status: 400 })
  }

  // Step 3: read-only trusted-company resolution after signature verification.
  const svc = requireServiceClient()

  let resolvedCompanyId: string | null
  try {
    resolvedCompanyId = event.account
      ? await resolveConnectEventCompanyId(event, svc)
      : await resolvePlatformEventCompanyId(event, svc)
  } catch (err) {
    console.error('[Stripe] Failed to resolve webhook company:', err)
    return new Response('Internal error', { status: 500 })
  }

  const denied = await assertCompanyWritable(resolvedCompanyId)
  if (denied) {
    // Acknowledge the signed delivery so Stripe does not retry an event that is
    // intentionally ineligible for product effects.
    return new Response('Demo company event ignored', { status: 200 })
  }

  if (!resolvedCompanyId && requiresCompanyResolution(event)) {
    console.warn(
      '[Stripe] Signed tenant event has no trusted company mapping; ignoring:',
      event.type,
      event.id,
    )
    return new Response('Company not resolved', { status: 200 })
  }

  // Step 5: idempotency — insert event_id; 23505 = already processed
  const { error: dedupError } = await svc
    .from('processed_stripe_events')
    .insert({ event_id: event.id })

  if (dedupError?.code === '23505') {
    // Duplicate event — acknowledge without reprocessing (STRIPE-04)
    return new Response('Already processed', { status: 200 })
  }

  if (dedupError) {
    // Unexpected DB error — return 500 so Stripe retries
    console.error('[Stripe] Failed to record event:', dedupError)
    return new Response('Internal error', { status: 500 })
  }

  // Step 4: handle event.
  //
  // Pre-launch audit fix (B5): the dedup row above is inserted BEFORE
  // handling (needed to reject a second COPY of the same event arriving
  // concurrently — see Pitfall below), but that made the dedup "at-most-once"
  // in the wrong direction: if handleStripeEvent throws (a transient error,
  // e.g. stripe.subscriptions.retrieve failing in the invoice.paid arm), this
  // route returns 500, Stripe retries, and the retry hits the dedup row we
  // already inserted — "Already processed" — permanently dropping an event
  // that never actually succeeded (a paid checkout that never grants the
  // tier/credits, with no further retry).
  //
  // Fix: on a thrown error, delete the dedup row before returning 500, so the
  // NEXT delivery (Stripe's automatic retry, or a manual resend) is treated
  // as fresh rather than already-processed. Concurrent-duplicate-delivery
  // protection is preserved because the row still exists for the ENTIRE
  // duration of a successful handling — only a genuine failure clears it.
  try {
    await handleStripeEvent(event, stripe, svc, resolvedCompanyId)
  } catch (err) {
    console.error('[Stripe] handleStripeEvent failed, clearing dedup row for retry:', err)
    await svc.from('processed_stripe_events').delete().eq('event_id', event.id)
    return new Response('Internal error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}

// ------------------------------------------------------------------
// Top-level dispatch: Connect events carry `event.account` (acct_xxx);
// platform (subscription) events do not. Plan 70-04 wires the Connect
// branch — existing platform event handling is untouched (zero regression).
// ------------------------------------------------------------------
async function handleStripeEvent(
  event: Stripe.Event,
  stripe: Stripe,
  svc: ReturnType<typeof requireServiceClient>,
  resolvedCompanyId: string | null,
): Promise<void> {
  if (event.account) {
    return handleConnectEvent(event, stripe, svc, resolvedCompanyId)
  }
  return handlePlatformEvent(event, stripe, svc)
}

async function readMappedCompanyId(
  svc: ReturnType<typeof requireServiceClient>,
  column: 'stripe_subscription_id' | 'stripe_customer_id',
  value: string,
): Promise<string | null> {
  const { data, error } = await svc
    .from('companies')
    .select('id')
    .eq(column, value)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[Stripe] company lookup failed for ${column}: ${error.message}`,
    )
  }

  return (data as { id?: string | null } | null)?.id ?? null
}

async function resolvePlatformEventCompanyId(
  event: Stripe.Event,
  svc: ReturnType<typeof requireServiceClient>,
): Promise<string | null> {
  const object = event.data.object as {
    id?: string
    metadata?: Record<string, string> | null
    subscription?: string | { id?: string } | null
    customer?: string | { id?: string } | null
    parent?: {
      type?: string
      subscription_details?: {
        subscription?: string | { id?: string } | null
      } | null
    } | null
  }

  const metadataCompanyId =
    object.metadata?.companyId ?? object.metadata?.company_id
  if (metadataCompanyId) return metadataCompanyId

  let subscriptionId: string | null = null
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    subscriptionId = object.id ?? null
  } else if (typeof object.subscription === 'string') {
    subscriptionId = object.subscription
  } else if (object.subscription?.id) {
    subscriptionId = object.subscription.id
  } else {
    const parentSubscription =
      object.parent?.type === 'subscription_details'
        ? object.parent.subscription_details?.subscription
        : null
    subscriptionId =
      typeof parentSubscription === 'string'
        ? parentSubscription
        : parentSubscription?.id ?? null
  }

  if (subscriptionId) {
    const companyId = await readMappedCompanyId(
      svc,
      'stripe_subscription_id',
      subscriptionId,
    )
    if (companyId) return companyId
  }

  const customerId =
    typeof object.customer === 'string'
      ? object.customer
      : object.customer?.id ?? null
  return customerId
    ? readMappedCompanyId(svc, 'stripe_customer_id', customerId)
    : null
}

function requiresCompanyResolution(event: Stripe.Event): boolean {
  if (event.account) {
    return connectEventRequiresCompanyResolution(event)
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'invoice.paid' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    return true
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    return paymentIntent.metadata?.type === 'auto_topup'
  }

  return false
}

// ------------------------------------------------------------------
// Platform event handler — subscription/billing lifecycle (STRIPE-02)
// (Originally the body of handleStripeEvent; renamed verbatim for the
// Connect branch in plan 70-04.)
// ------------------------------------------------------------------
async function handlePlatformEvent(
  event: Stripe.Event,
  stripe: Stripe,
  svc: ReturnType<typeof requireServiceClient>
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // TOPUP-02: one-time credit top-up (mode:'payment'). Handle BEFORE the
      // subscription-mode early-break below, or this arm never runs (Pitfall 3).
      // metadata values are STRINGS — parse credits (Pitfall 5). Idempotent on event.id.
      if (session.metadata?.type === 'credit_topup' && session.payment_status === 'paid') {
        const topupCompanyId = session.metadata.companyId
        const credits = Number(session.metadata.credits)
        if (topupCompanyId && credits > 0) {
          await grantCredits({
            companyId: topupCompanyId,
            credits,
            reason: 'topup',
            refId: session.id,
            idempotencyKey: event.id,
          })
        }
        break
      }

      // CREDITUI-07: mode:'setup' session completed — attach the resulting
      // payment method as the customer's default. Must run BEFORE the
      // subscription-mode fall-through below, or this arm is unreachable
      // (Research Pitfall 1).
      if (session.metadata?.type === 'autotopup_setup' && session.setup_intent) {
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string)
        if (setupIntent.payment_method) {
          await stripe.customers.update(session.customer as string, {
            invoice_settings: { default_payment_method: setupIntent.payment_method as string },
          })
        }
        break
      }

      const companyId = session.metadata?.companyId
      if (!companyId || session.mode !== 'subscription') break

      // tier resolved from metadata.plan — stored at checkout creation (RESEARCH Pitfall 3)
      const tier = session.metadata?.plan === 'business' ? 'business' : 'pro'

      // Safety net: if this company already has a DIFFERENT subscription on file,
      // a fresh Checkout would leave the old one live and double-bill. Cancel the
      // old subscription before overwriting the row. Wrapped in try/catch — it may
      // already be canceled (e.g. the portal update flow migrated the same sub).
      const { data: existing } = await svc
        .from('companies')
        .select('stripe_subscription_id')
        .eq('id', companyId)
        .maybeSingle()

      const oldSubId = (existing as { stripe_subscription_id?: string | null } | null)
        ?.stripe_subscription_id
      const newSubId = session.subscription as string
      if (oldSubId && oldSubId !== newSubId) {
        try {
          await stripe.subscriptions.cancel(oldSubId)
          console.warn('[Stripe] checkout.session.completed canceled superseded subscription:', oldSubId)
        } catch (err) {
          console.warn('[Stripe] checkout.session.completed could not cancel old subscription (may already be canceled):', oldSubId, err instanceof Error ? err.message : err)
        }
      }

      const { error } = await svc
        .from('companies')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          tier,
          tier_trial_ends_at: null, // paid plan — clear trial
          // Clear any stale pending-cancel marker. A prior lapse
          // (customer.subscription.deleted) sets tier_cancelled_at=now() with
          // stripe_subscription_id=null; a fresh re-subscribe via Checkout skips
          // the upgrade guard (null sub id) and would otherwise leave the stale
          // timestamp, making page.tsx render "plan ends on <past date>" for a
          // freshly-active paying customer. customer.subscription.updated is not
          // guaranteed to fire on new-sub creation, so clear it here.
          tier_cancelled_at: null,
        })
        .eq('id', companyId)

      if (error) {
        console.error('[Stripe] checkout.session.completed update failed:', error)
      }

      // Mirror the subscription change into Xphere CRM (fire-and-forget).
      if (companyId) dispatchXphereSync(companyId, 'subscription.updated')

      // Phase 175 (PLAT-01) — a NEW paid subscription is platform revenue,
      // DISTINCT from a customer paying a tenant (tenant_payment_received in
      // connect-webhook.ts's Connect arms). Sibling, fire-and-forget.
      void notifyOps({
        kind: 'subscription_payment_received',
        title: `Subscription payment - tier ${tier}`,
        message: `Company ${companyId} - checkout ${session.id}${
          typeof session.amount_total === 'number' ? ` - $${(session.amount_total / 100).toFixed(2)}` : ''
        }`,
        severity: 'warning',
        dedupeKey: `subscription_payment_received:${event.id}`,
      })
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
      const subId = (invoice.subscription as string | null) ??
        (invoice.parent?.type === 'subscription_details'
          ? (invoice.parent.subscription_details?.subscription as string | null)
          : null)
      if (!subId) break

      // Retrieve subscription to get current_period_end
      // Cast through unknown — Stripe API 2026-04-22 moved current_period_end under billing_details
      // but the runtime object still carries this field; TypeScript types haven't caught up
      const subscription = await stripe.subscriptions.retrieve(subId) as unknown as { current_period_end: number }
      const renewsAt = new Date(subscription.current_period_end * 1000).toISOString()

      const { error } = await svc
        .from('companies')
        .update({ tier_renews_at: renewsAt })
        .eq('stripe_subscription_id', subId)

      if (error) {
        console.error('[Stripe] invoice.paid update failed:', error)
      }

      // Phase 175 (PLAT-01) — subscription renewal payment received; platform
      // revenue event, unconditional on the credit-grant lookup below.
      void notifyOps({
        kind: 'subscription_payment_received',
        title: 'Subscription payment received',
        message: `subscription ${subId} - invoice ${invoice.id}${
          typeof invoice.amount_paid === 'number' ? ` - $${(invoice.amount_paid / 100).toFixed(2)}` : ''
        }`,
        severity: 'warning',
        dedupeKey: `subscription_payment_received:${event.id}`,
      })

      // TOPUP-01 / Phase 142 (ANN-02): grant the tier's monthly credit allowance.
      // Keyed on the COMPANY-MONTH key (`grant:{companyId}:{YYYY-MM}`) — the SINGLE
      // dedup authority shared with the monthly-credit-grant cron. Consequences:
      //   - A redelivered webhook in the same month → still ONE grant (same key).
      //   - The cron no-ops a month the webhook already granted (monthly subs).
      //   - Annual subs: this fires month 1 (immediate UX), the cron covers 2-12.
      // Grant ONLY here (NOT in checkout.session.completed) — Pitfall 2 double-grant.
      const { data: grantCompany } = await svc
        .from('companies')
        .select('id, tier')
        .eq('stripe_subscription_id', subId)
        .maybeSingle()

      if (grantCompany?.id) {
        const cfg = await getBillingConfig()
        const tierKey = (grantCompany.tier ?? 'free') as keyof typeof cfg.tiers
        const grant = cfg.tiers[tierKey]?.monthlyCreditGrant ?? 0
        await grantCredits({
          companyId: grantCompany.id,
          credits: grant,        // grantCredits no-ops on <=0 (free tier = 0)
          reason: 'grant',
          refId: invoice.id,
          idempotencyKey: monthGrantKey(grantCompany.id, new Date()), // company-month dedup (shared with cron)
        })
      }

      // SEED-054: accrue the affiliate commission for this paid invoice.
      //
      // Placed on invoice.paid (NOT checkout.session.completed) for the same
      // reason the credit grant is: this is the event that fires for BOTH the
      // first payment and every renewal, so a recurring commission needs no
      // second call site. Deduped on `commission:{invoiceId}`, so the redelivery
      // this handler's dedup-row-clear can cause accrues exactly once.
      //
      // accrueCommissionForInvoice never throws — a commission failure must not
      // trigger a 500 that makes Stripe retry the tier update and credit grant.
      if (grantCompany?.id && typeof invoice.amount_paid === 'number') {
        await accrueCommissionForInvoice({
          companyId: grantCompany.id,
          invoiceId: invoice.id ?? subId,
          amountPaidCents: invoice.amount_paid,
          currency: invoice.currency ?? 'usd',
          eventId: event.id,
        })
      }
      break
    }

    // Pre-launch audit fix (B2): auto-top-up off-session charges (see
    // lib/billing/auto-topup.ts) previously had NO webhook handler at all —
    // the card was charged but credits were never granted, and since the
    // balance stayed below threshold, every subsequent debit re-triggered a
    // new charge. This handler is a durable backstop: chargeAutoTopup() also
    // grants credits synchronously right after the charge succeeds, using the
    // SAME idempotency key (`autotopup:{paymentIntent.id}`) as here, so
    // whichever path runs first grants and the other is a harmless no-op —
    // covers the case where the serverless function crashes after Stripe
    // confirms the charge but before the synchronous grant call completes.
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      if (pi.metadata?.type === 'auto_topup') {
        const topupCompanyId = pi.metadata.companyId
        const credits = Number(pi.metadata.credits)
        if (topupCompanyId && credits > 0) {
          await grantCredits({
            companyId: topupCompanyId,
            credits,
            reason: 'topup',
            refId: pi.id,
            idempotencyKey: `autotopup:${pi.id}`,
          })
        }
      }
      break
    }

    case 'invoice.payment_failed': {
      // DO NOT downgrade — Stripe dunning handles retries (RESEARCH Pitfall 4)
      // customer.subscription.deleted fires only after all dunning retries exhausted
      const invoice = event.data.object as Stripe.Invoice
      console.warn('[Stripe] Payment failed for invoice:', invoice.id, '— no tier change applied')
      break
    }

    case 'customer.subscription.updated': {
      // Required for the Customer Portal update flow (create-checkout-session's
      // upgrade path) to reflect in the DB — a plan change made in the portal
      // arrives here, not via checkout.session.completed.
      const subscription = event.data.object as Stripe.Subscription

      // Map the first item's price id to a tier (null when unknown — leave tier as-is).
      const priceId = subscription.items?.data?.[0]?.price?.id ?? null
      const resolvedTier = await resolveTierFromPriceId(priceId)

      // current_period_end moved under a nested shape in the 2026-04-22 Stripe API
      // types but the runtime object still carries it — same cast as invoice.paid.
      const subWithPeriod = subscription as unknown as { current_period_end?: number | null }
      const renewsAt = subWithPeriod.current_period_end
        ? new Date(subWithPeriod.current_period_end * 1000).toISOString()
        : null

      // Pending-cancel tracking: cancel_at is set when cancel_at_period_end is true.
      const cancelledAt = subscription.cancel_at_period_end
        ? new Date((subscription.cancel_at as number) * 1000).toISOString()
        : null

      // Resolve the company BEFORE the update (for the CRM sync id below).
      const { data: c } = await svc
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle()

      const updatePayload: {
        tier_renews_at: string | null
        tier_cancelled_at: string | null
        tier?: string
      } = { tier_renews_at: renewsAt, tier_cancelled_at: cancelledAt }
      // Only overwrite tier when the price resolved to a known tier.
      if (resolvedTier) updatePayload.tier = resolvedTier

      const { error } = await svc
        .from('companies')
        .update(updatePayload)
        .eq('stripe_subscription_id', subscription.id)

      if (error) {
        console.error('[Stripe] customer.subscription.updated update failed:', error)
      }

      // Mirror the change into Xphere CRM (fire-and-forget). No-op if no row matched.
      if (c?.id) dispatchXphereSync(c.id, 'subscription.updated')
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription

      // Resolve the company BEFORE the update — the update clears
      // stripe_subscription_id, so the lookup must happen first.
      const { data: c } = await svc
        .from('companies')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle()

      const { error } = await svc
        .from('companies')
        .update({
          tier: 'free',
          stripe_subscription_id: null,
          tier_renews_at: null,
          tier_cancelled_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)

      if (error) {
        console.error('[Stripe] customer.subscription.deleted update failed:', error)
      }

      // Mirror the churn into Xphere CRM (mapping forces tier='free' → 'Churned').
      if (c?.id) dispatchXphereSync(c.id, 'subscription.updated')
      break
    }

    default:
      // Unhandled event type — ignore silently (future events won't crash the handler)
      break
  }
}
