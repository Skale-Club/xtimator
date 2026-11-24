import { type NextRequest } from 'next/server'
import { verifyStripeSignature } from '@/lib/billing/stripe-signature'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { processVerifiedStripeEvent } from '@/lib/billing/stripe-event-processing'
import { isLiveStripeEnvironment } from '@/lib/billing/stripe-environment'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const event = verifyStripeSignature(rawBody, request.headers.get('stripe-signature') ?? '')
  if (!event) return new Response('Invalid signature', { status: 400 })
  // No provider-key lookup or business database work before verification.
  try {
    if ((event.livemode === true) !== isLiveStripeEnvironment()) return new Response('Wrong Stripe environment', { status: 400 })
    return await processVerifiedStripeEvent(event, await getStripeClient())
  } catch {
    return new Response('Payment processing unavailable', { status: 503 })
  }
}
