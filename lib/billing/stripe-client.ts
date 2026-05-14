import 'server-only'
import Stripe from 'stripe'
import { getIntegrationKey } from '@/lib/platform-config'

/**
 * Returns a Stripe client initialized per-request using the DB-stored secret key.
 * Per-request initialization is the established project pattern (STATE.md ADMIN-06).
 * Never call new Stripe() at module level — the key is not available at import time.
 */
export async function getStripeClient(): Promise<Stripe> {
  const key = await getIntegrationKey('stripe')
  if (!key) {
    throw new Error('[Stripe] Secret key not configured. Add via /admin/integrations.')
  }
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}
