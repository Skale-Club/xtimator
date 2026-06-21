/**
 * GUARD-02 — price-anchoring guardrails (pure helper, Plan 100-02).
 *
 * Server-side authority over AI-produced unit prices:
 *   - ANCHOR: a line item whose normalized description matches a price-book entry
 *     has its `unit_price` OVERRIDDEN with the book price and `price_source` set to
 *     'price_book' (the price book is authoritative over the model's number).
 *   - CLAMP: an unmatched `ai_estimate` item whose `unit_price` exceeds
 *     {@link UNIT_PRICE_CEILING} is clamped down to the ceiling. A zero price is
 *     KEPT (a $0 "included" line is legitimate).
 *   - PRECEDENCE: anchor before clamp — a matched item is anchored to the in-bounds
 *     book price and never clamped.
 *   - TENANT SCOPE: the helper reads ONLY the `priceBook` array it is given. The
 *     caller (generate-estimate.ts) passes the already companyId-scoped, currency-
 *     filtered book, so multi-tenant isolation is preserved at the boundary.
 *
 * Pure — no I/O, no companyId, no DB. A malformed price-book row is skipped, never
 * throws (anchoring/clamping is non-fatal and must never break generation).
 */

import type { EstimateSectionOutput } from './types'

/**
 * Documented sane per-unit USD ceiling. No legitimate single line-item unit price
 * in this domain exceeds $1,000,000; an `ai_estimate` price above this is treated
 * as a hallucination and clamped (not trusted).
 */
export const UNIT_PRICE_CEILING = 1_000_000

/**
 * Normalize a name for price-book matching. EXACT body reused from
 * `normalizeClientNameForMatch` (lib/services/generate-estimate.ts) so AI item
 * descriptions and price-book entry names match on the same case/punctuation/space
 * rules already battle-tested for client auto-link.
 */
export function normalizeNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

export interface AnchorResult {
  sections: EstimateSectionOutput[]
  anchoredCount: number
  clampedCount: number
}

/**
 * Anchor matched items to the price book and clamp out-of-bounds `ai_estimate`
 * prices. Returns the rewritten sections plus the anchored/clamped counts for the
 * GUARD-03 discrepancy metric. Tenant scope lives at the boundary: only the passed
 * `priceBook` array is consulted.
 */
export function anchorAndClampSections(
  sections: EstimateSectionOutput[],
  priceBook: Array<{ name: string; unit_price: number }>
): AnchorResult {
  // Build an O(1) lookup keyed by normalized name (first-wins on collision).
  // Each row read is guarded so a malformed entry is skipped, never throws.
  const bookByName = new Map<string, { name: string; unit_price: number }>()
  for (const p of priceBook) {
    try {
      if (!p || typeof p.name !== 'string') continue
      const key = normalizeNameForMatch(p.name)
      if (!bookByName.has(key)) bookByName.set(key, p)
    } catch {
      // Malformed row — skip it; anchoring must never break generation.
      continue
    }
  }

  let anchoredCount = 0
  let clampedCount = 0

  const mappedSections = sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      let hit: { name: string; unit_price: number } | undefined
      try {
        hit = bookByName.get(normalizeNameForMatch(item.description))
      } catch {
        hit = undefined
      }

      // ANCHOR (takes precedence over clamp).
      if (hit && Number.isFinite(hit.unit_price)) {
        anchoredCount++
        return {
          ...item,
          unit_price: hit.unit_price,
          price_source: 'price_book' as const,
        }
      }

      // CLAMP — unmatched item beyond the sane ceiling. Zero/in-bounds kept as-is.
      if (item.unit_price > UNIT_PRICE_CEILING) {
        clampedCount++
        return { ...item, unit_price: UNIT_PRICE_CEILING }
      }

      return item
    }),
  }))

  return { sections: mappedSections, anchoredCount, clampedCount }
}
