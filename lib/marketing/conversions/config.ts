import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { coerceConsentPolicy, type ConsentPolicy } from '@/lib/marketing/signals'

/**
 * Server-side ad conversion settings, from /admin/integrations → Ads & Analytics.
 *
 * DORMANT BY DEFAULT: a destination sends only when its key is saved AND its
 * "Send conversions" switch (metadata.enabled) is on. Keys live encrypted in
 * platform_integrations, stored as two parts joined by ':':
 *   - ga4:        "<measurement id>:<Measurement Protocol API secret>"
 *   - meta_capi:  "<dataset / pixel id>:<Conversions API access token>"
 * The consent policy is stored on the ga4 row (metadata.consent_policy) and
 * applies to both destinations.
 */

export const META_GRAPH_VERSION_DEFAULT = 'v24.0'

export interface Ga4Destination {
  measurementId: string
  apiSecret: string
}

export interface MetaDestination {
  datasetId: string
  accessToken: string
  testEventCode: string | null
  graphVersion: string
}

export interface AdsTrackingConfig {
  ga4: Ga4Destination | null
  meta: MetaDestination | null
  consentPolicy: ConsentPolicy
}

type Meta = { enabled?: unknown; consent_policy?: unknown; test_event_code?: unknown; graph_version?: unknown }

/** Splits "a:b" on the FIRST ':' (secrets may not contain one, ids never do). */
export function splitKey(raw: string | null): [string, string] | null {
  if (!raw) return null
  const at = raw.indexOf(':')
  if (at <= 0 || at === raw.length - 1) return null
  return [raw.slice(0, at).trim(), raw.slice(at + 1).trim()]
}

async function readMetadata(): Promise<{ ga4: Meta; meta: Meta }> {
  const svc = createServiceClient()
  if (!svc) return { ga4: {}, meta: {} }
  const { data } = await svc
    .from('platform_integrations')
    .select('provider, metadata')
    .in('provider', ['ga4', 'meta_capi'])
  const byProvider = new Map((data ?? []).map((row) => [row.provider as string, (row.metadata ?? {}) as Meta]))
  return { ga4: byProvider.get('ga4') ?? {}, meta: byProvider.get('meta_capi') ?? {} }
}

export async function getAdsTrackingConfig(): Promise<AdsTrackingConfig> {
  const metadata = await readMetadata()
  const consentPolicy = coerceConsentPolicy(metadata.ga4.consent_policy)

  let ga4: Ga4Destination | null = null
  if (metadata.ga4.enabled === true) {
    const parts = splitKey(await getIntegrationKey('ga4'))
    if (parts && /^G-[A-Z0-9]+$/i.test(parts[0])) ga4 = { measurementId: parts[0], apiSecret: parts[1] }
  }

  let meta: MetaDestination | null = null
  if (metadata.meta.enabled === true) {
    const parts = splitKey(await getIntegrationKey('meta_capi'))
    if (parts && /^\d{5,20}$/.test(parts[0])) {
      const test = typeof metadata.meta.test_event_code === 'string' ? metadata.meta.test_event_code.trim() : ''
      const version = typeof metadata.meta.graph_version === 'string' ? metadata.meta.graph_version.trim() : ''
      meta = {
        datasetId: parts[0],
        accessToken: parts[1],
        testEventCode: test || null,
        graphVersion: /^v\d+\.\d+$/.test(version) ? version : META_GRAPH_VERSION_DEFAULT,
      }
    }
  }

  return { ga4, meta, consentPolicy }
}
