import 'server-only'
import type Stripe from 'stripe'
import type { requireServiceClient } from '@/lib/supabase/service'
type Db = ReturnType<typeof requireServiceClient>
type Claim = { state: 'completed' } | { state: 'busy' } | { state: 'acquired'; token: string }

export async function claimStripeEvent(db: Db, event: Stripe.Event): Promise<Claim> {
  const { data, error } = await db.rpc('claim_stripe_event', {
    p_event_id: event.id, p_account_id: event.account ?? null,
  })
  if (error || !data?.state || (data.state === 'acquired' && !data.token)) {
    throw new Error('Could not claim Stripe event')
  }
  return data as Claim
}

export async function finishStripeEvent(db: Db, id: string, token: string, success: boolean): Promise<void> {
  const { data, error } = await db.rpc('finish_stripe_event', {
    p_event_id: id, p_token: token, p_success: success,
  })
  if (error || data !== true) throw new Error('Could not persist Stripe event completion')
}
