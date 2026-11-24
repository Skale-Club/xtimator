import 'server-only'
import { getIntegrationKey } from '@/lib/platform-config'
import { dataApiMode } from '@/lib/supabase/data-api'

export function isLiveStripeEnvironment(): boolean {
  const productionData = dataApiMode() === 'postgrest'
  if (productionData && process.env.NODE_ENV !== 'production') {
    throw new Error('Payments against production data require the production runtime.')
  }
  return productionData
}

/** Every Stripe API and OAuth request uses the same environment boundary. */
export async function getStripeSecretKey(): Promise<string> {
  const live = isLiveStripeEnvironment()
  const key = await getIntegrationKey(live ? 'stripe' : 'stripe_test')
  if (!key) throw new Error(`[Stripe] ${live ? 'Live' : 'Sandbox'} secret key not configured. Add via /admin/integrations.`)
  if (!live && /^(sk|rk)_live_/.test(key)) throw new Error('Live Stripe access is disabled outside production. Configure the platform sandbox key for development.')
  if (live && /^(sk|rk)_test_/.test(key)) throw new Error('A sandbox Stripe key cannot fulfill purchases against production data.')
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key)) throw new Error('Invalid Stripe secret key configuration')
  return key
}
