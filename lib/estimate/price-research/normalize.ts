/**
 * Price-research cache key derivation (Phase 106 — RCACHE-01, RCACHE-02).
 *
 * Pure key helpers consumed by Plan 106-02's cache module. No I/O, no DB.
 * Two keys: a service-name key (REUSING the existing name normalizer) and a
 * canonical "city|state" region key.
 */

import { normalizeNameForMatch } from '@/lib/ai/price-anchoring'

/**
 * Cache name key. REUSES normalizeNameForMatch (lib/ai/price-anchoring.ts) so
 * "Couch cleaning 8 seats" and "sofa cleaning, 8-seat" reduce to the same
 * lowercase/trim/strip-punct/collapse-space key. Re-exported (not re-implemented)
 * so the cache and the anchoring pass never drift.
 */
export function normalizeServiceNameKey(name: string): string {
  return normalizeNameForMatch(name)
}
export { normalizeNameForMatch }

/**
 * Canonical region key "city|state". Lowercases, trims, collapses internal
 * whitespace, and strips commas/periods so "Austin, TX" and "austin tx" collapse
 * to "austin|tx". A null/empty city or state contributes an empty segment, so a
 * state-only or fully-unknown region still yields a STABLE deterministic key
 * (e.g. "|tx" or "|"). Quantity/punctuation never leaks into the key.
 */
export function normalizeRegion(
  region: { city?: string | null; state?: string | null }
): string {
  const clean = (s: string | null | undefined) =>
    (s ?? '')
      .toLowerCase()
      .trim()
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
  return `${clean(region.city)}|${clean(region.state)}`
}
