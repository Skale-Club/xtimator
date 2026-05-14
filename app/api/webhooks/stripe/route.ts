import { type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  const stripe = await getStripeClient()

  // Step 2: verify signature — throws on failure
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.warn('[Stripe] Webhook signature verification failed:', message)
    return new Response(`Webhook error: ${message}`, { status: 400 })
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
// Event handlers — one case per Stripe lifecycle event (STRIPE-02)
// ------------------------------------------------------------------
async function handleStripeEvent(
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
