import { type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { handleConnectEvent } from '@/lib/billing/connect-webhook'
import { requireServiceClient } from '@/lib/supabase/service'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'
import { grantCredits, monthGrantKey } from '@/lib/billing/credit-ledger'
import { getBillingConfig } from '@/lib/billing/billing-config'

// ------------------------------------------------------------------
// POST: Stripe webhook handler (STRIPE-02, STRIPE-04)
//
// CRITICAL order (same as WhatsApp webhook):
//   1. request.text() FIRST — get raw body BEFORE any parsing
//   2. stripe.webhooks.constructEvent() — verifies signature against raw body
//   3. Idempotency check — insert event_id into processed_stripe_events
//   4. Handle event — update companies table
//   5. Return 200 — Stripe stops retrying
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

  // Step 3: idempotency — insert event_id; 23505 = already processed
  const svc = requireServiceClient()
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
    await handleStripeEvent(event, stripe, svc)
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
  svc: ReturnType<typeof requireServiceClient>
): Promise<void> {
  if (event.account) {
    return handleConnectEvent(event, stripe, svc)
  }
  return handlePlatformEvent(event, stripe, svc)
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

      const { error } = await svc
        .from('companies')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          tier,
          tier_trial_ends_at: null, // paid plan — clear trial
        })
        .eq('id', companyId)

      if (error) {
        console.error('[Stripe] checkout.session.completed update failed:', error)
      }

      // Mirror the subscription change into Xphere CRM (fire-and-forget).
      if (companyId) dispatchXphereSync(companyId, 'subscription.updated')
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
