import { type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { handleConnectEvent } from '@/lib/billing/connect-webhook'
import { requireServiceClient } from '@/lib/supabase/service'

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

  // Step 4: handle event
  await handleStripeEvent(event, stripe, svc)

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
      break
    }

    default:
      // Unhandled event type — ignore silently (future events won't crash the handler)
      break
  }
}
