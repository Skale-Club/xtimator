import 'server-only'
import { getIntegrationKey } from '@/lib/platform-config'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'

export const CONNECT_WEBHOOK_EVENTS = [
  'invoice.paid', 'invoice.voided', 'invoice.marked_uncollectible', 'invoice.payment_failed',
  'charge.refunded', 'account.updated', 'account.application.deauthorized',
  'refund.created', 'refund.updated', 'refund.failed',
] as const

/** Configuration presence is not proof that connected-account events arrive. */
export async function checkConnectReadiness(): Promise<{ ready: boolean; missing: string[] }> {
  const missing: string[] = []
  const clientId = await getIntegrationKey('stripe_connect_client_id')
  if (!clientId || !/^ca_[A-Za-z0-9]+$/.test(clientId)) missing.push('Connect application Client ID')
  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) missing.push('Connect webhook signing secret')
  if (missing.length) return { ready: false, missing }
  const stripe = await getStripeClient()
  const expectedUrl = `${getCanonicalBaseUrl()}/api/webhooks/stripe`
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const endpoint = endpoints.data.find(e => e.status === 'enabled' && e.url === expectedUrl && e.application === clientId &&
    (e.enabled_events.includes('*') || CONNECT_WEBHOOK_EVENTS.every(event => e.enabled_events.includes(event))))
  if (!endpoint) missing.push('Connected-account webhook destination and events')
  return { ready: missing.length === 0, missing }
}
