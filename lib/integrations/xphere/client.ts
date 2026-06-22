import 'server-only'

/**
 * Phase 1000: Xphere CRM sync — per-request HTTP client.
 *
 * Implements XPHERE-B3-CLIENT. `syncCompany(payload)` wraps the FIXED Xphere
 * webhook contract (`POST {baseUrl}/api/xtimator/webhook`, `Authorization:
 * Bearer <apiKey>`; see 1000-CONTEXT.md <decisions>).
 *
 * Per-request: the credentials are read inside the call via getXphereConfig()
 * (mirrors lib/billing/stripe-client.ts:getStripeClient) — NEVER at module load.
 *
 * Reliability contract: throws on non-2xx and on network error so the calling
 * Inngest job (Plan 03 xphereSyncJob) retries. No-ops (returns null) when the
 * integration is unconfigured so disabled-by-default deployments never sync.
 */

import { getXphereConfig } from '@/lib/platform-config'
import type {
  XphereSyncPayload,
  XphereSyncResponse,
} from '@/lib/integrations/xphere/types'

export async function syncCompany(
  payload: XphereSyncPayload,
): Promise<XphereSyncResponse | null> {
  const config = await getXphereConfig()
  if (!config) {
    // Disabled-by-default: no key/base URL → no-op gracefully (never throws).
    console.warn('[xphere] sync skipped — integration not configured')
    return null
  }

  const res = await fetch(`${config.baseUrl}/api/v1/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Do NOT log the apiKey value anywhere.
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[xphere] sync failed ${res.status}: ${text.slice(0, 300)}`)
  }

  return (await res.json()) as XphereSyncResponse
}
