/**
 * Tenant-scoped researched-price cache (Phase 106 — RCACHE-01, RCACHE-02).
 *
 * `get`/`put` over `public.price_research_cache` via the service-role client.
 * The cached VALUE is a NEUTRAL market datum — it deliberately carries NO
 * company_id / client / margin / job-text. `company_id` is a KEY column used for
 * tenant scoping (the UNIQUE 4-tuple), never part of the returned datum. This shape
 * is the leakage-guard contract: a returned price can never leak tenant-private data.
 *
 * Dormant in Phase 106: nothing in production reads/writes this yet. Phase 108
 * (orchestrator) consumes `get`/`put`.
 */

import { requireServiceClient } from '@/lib/supabase/service'
import { normalizeServiceNameKey, normalizeRegion } from './normalize'

/** TTL for a cached researched price: 30 days. Module const (configurable point). */
export const PRICE_RESEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The NEUTRAL market datum stored/returned by the cache. Deliberately carries NO
 * company_id / client / margin / job-text — company_id is a KEY column for tenant
 * scoping, not part of the value. This shape is the leakage-guard contract.
 */
export interface CachedPriceDatum {
  unit_price: number
  currency: string
  source: string | null
  confidence?: number | null
  expires_at: string
}

export interface PutInput {
  companyId: string
  name: string
  region: { city?: string | null; state?: string | null }
  currency: string
  datum: { unit_price: number; source?: string | null; confidence?: number | null }
}

/**
 * Read a cached researched price. Returns the neutral datum when a row exists AND
 * expires_at >= now; treats an expired row as a MISS (null). Never invokes any
 * provider — a HIT is a pure DB read. Service-role only.
 */
export async function get(
  companyId: string,
  name: string,
  region: { city?: string | null; state?: string | null },
  currency: string
): Promise<CachedPriceDatum | null> {
  const svc = requireServiceClient()
  const normalizedName = normalizeServiceNameKey(name)
  const regionKey = normalizeRegion(region)
  const { data } = await svc
    .from('price_research_cache')
    .select('unit_price, currency_code, source, confidence, expires_at')
    .eq('company_id', companyId)
    .eq('normalized_name', normalizedName)
    .eq('region', regionKey)
    .eq('currency_code', currency)
    .maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null // expired = miss
  return {
    unit_price: data.unit_price,
    currency: data.currency_code,
    source: data.source ?? null,
    confidence: data.confidence ?? null,
    expires_at: data.expires_at,
  }
}

/**
 * Write-through a researched price with expires_at = now + PRICE_RESEARCH_TTL_MS,
 * upserting on the (company_id, normalized_name, region, currency_code) key.
 * Service-role only.
 */
export async function put(input: PutInput): Promise<void> {
  const svc = requireServiceClient()
  const expiresAt = new Date(Date.now() + PRICE_RESEARCH_TTL_MS).toISOString()
  await svc.from('price_research_cache').upsert(
    {
      company_id: input.companyId,
      normalized_name: normalizeServiceNameKey(input.name),
      region: normalizeRegion(input.region),
      currency_code: input.currency,
      unit_price: input.datum.unit_price,
      source: input.datum.source ?? null,
      confidence: input.datum.confidence ?? null,
      expires_at: expiresAt,
    },
    { onConflict: 'company_id,normalized_name,region,currency_code' }
  )
}
