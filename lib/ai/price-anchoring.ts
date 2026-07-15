/**
 * GUARD-02 — price-anchoring guardrails (pure helper, Plan 100-02).
 *
 * Server-side authority over AI-produced unit prices:
 *   - ANCHOR: a line item whose normalized description matches a price-book entry
 *     (exactly, or via the conservative fuzzy tiers below) has its `unit_price`
 *     OVERRIDDEN with the book price and `price_source` set to 'price_book' (the
 *     price book is authoritative over the model's number).
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
 *
 * FUZZY MATCHING — why this is NOT a generic similarity-score threshold:
 *
 * Calibrating a character/word similarity score (Dice coefficient, Jaccard, edit
 * distance...) against realistic catalog pairs shows there is no threshold that
 * safely separates a real match from a dangerous one. A SUBSTITUTED word can score
 * HIGHER than a legitimately different phrasing: "Interior painting" vs "Exterior
 * painting" scores 0.875 on character-bigram Dice — higher than the genuine match
 * "Toilet installation" vs "Install toilet" (0.71) — and "2 bedroom cleaning" vs
 * "3 bedroom cleaning" scores 0.94. Any single threshold either misses good matches
 * or silently anchors a wrong (and often very different) price onto a real estimate.
 * The risk is not symmetric: a missed match just leaves an item at the AI's own
 * `ai_estimate` price (same as today); a false positive silently and confidently
 * charges the client the wrong number.
 *
 * Instead, {@link isReorderedOrExtendedMatch} only matches when one description's
 * words are a reordered subset/superset of the other's — i.e. words were only
 * REORDERED or purely ADDED/OMITTED, never SUBSTITUTED, and the added/omitted words
 * contain no digit (a digit difference almost always encodes a price-relevant size/
 * quantity/capacity variant, e.g. "(40 gal)" vs "(50 gal)"). A substituted word can
 * never satisfy a subset relationship, so this has no false-positive failure mode
 * for the substitution class that broke every threshold-based score above. It trades
 * some recall (stemming variants like "Lawn mowing"/"Lawn Mow" are not caught) for
 * that guarantee — an acceptable trade given the cost asymmetry above.
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

/**
 * Second exact tier: the normalized name with ALL whitespace removed. Catches a
 * compound word split differently ("Dry wall repair" vs "Drywall repair") — a
 * boundary a token-based comparison can never bridge without a dictionary, since
 * "drywall" as one token and "dry"+"wall" as two never share a token. Still a
 * character-for-character match modulo spacing, so it carries the same safety as
 * the exact tier above (no substitution can pass this check).
 */
function normalizeCompact(name: string): string {
  return normalizeNameForMatch(name).replace(/\s+/g, '')
}

/** Split a normalized name into words, dropping stray punctuation-only tokens
 * (e.g. a lone "-" left over from "Exterior painting - trim"). */
function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter((t) => /[a-z0-9]/.test(t))
}

function hasDigit(token: string): boolean {
  return /\d/.test(token)
}

/**
 * True when `a` and `b` describe the SAME multiset of words — reordered and/or
 * with words purely ADDED on one side (never substituted) — and no digit-bearing
 * token is among the ones added/removed. See the module doc comment for why this
 * replaces a generic similarity-score threshold. Symmetric: order of arguments
 * does not matter.
 */
export function isReorderedOrExtendedMatch(a: string, b: string): boolean {
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (tokensA.length === 0 || tokensB.length === 0) return false

  const countsA = new Map<string, number>()
  for (const t of tokensA) countsA.set(t, (countsA.get(t) ?? 0) + 1)
  const countsB = new Map<string, number>()
  for (const t of tokensB) countsB.set(t, (countsB.get(t) ?? 0) + 1)

  let aHasExtra = false
  let bHasExtra = false
  for (const key of new Set([...countsA.keys(), ...countsB.keys()])) {
    const ca = countsA.get(key) ?? 0
    const cb = countsB.get(key) ?? 0
    if (ca === cb) continue
    // A digit-bearing token differing in count is a size/quantity/capacity
    // variant — never treat that as a safe pure addition.
    if (hasDigit(key)) return false
    if (ca > cb) aHasExtra = true
    else bHasExtra = true
  }
  // Extra tokens on BOTH sides means a word was substituted (A dropped some
  // words AND gained others), not purely reordered/extended — reject.
  return !(aHasExtra && bHasExtra)
}

export interface AnchorResult {
  sections: EstimateSectionOutput[]
  anchoredCount: number
  /** Subset of anchoredCount matched via the fuzzy tiers (compact/reordered),
   * not an exact normalized-name match. Additive telemetry only. */
  fuzzyAnchoredCount: number
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
  // Three lookup structures over the SAME companyId-scoped book, cheapest tier
  // first. Each row read is guarded so a malformed entry is skipped, never throws.
  type BookEntry = { name: string; unit_price: number }
  const bookByName = new Map<string, BookEntry>() // tier 1: exact normalized name
  const bookByCompactName = new Map<string, BookEntry>() // tier 2: whitespace-insensitive
  const bookForFuzzy: Array<{ normalized: string; entry: BookEntry }> = [] // tier 3: reordered/extended

  for (const p of priceBook) {
    try {
      if (!p || typeof p.name !== 'string') continue
      const normalized = normalizeNameForMatch(p.name)
      if (!bookByName.has(normalized)) bookByName.set(normalized, p)
      const compact = normalizeCompact(p.name)
      if (!bookByCompactName.has(compact)) bookByCompactName.set(compact, p)
      bookForFuzzy.push({ normalized, entry: p })
    } catch {
      // Malformed row — skip it; anchoring must never break generation.
      continue
    }
  }

  let anchoredCount = 0
  let fuzzyAnchoredCount = 0
  let clampedCount = 0

  const mappedSections = sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      let hit: BookEntry | undefined
      let isFuzzyHit = false
      try {
        const normalizedDescription = normalizeNameForMatch(item.description)
        hit = bookByName.get(normalizedDescription)
        if (!hit) {
          hit = bookByCompactName.get(normalizeCompact(item.description))
          if (hit) isFuzzyHit = true
        }
        if (!hit) {
          // Tier 3: require EXACTLY ONE candidate — two-or-more matching book
          // entries is ambiguous (which one?) and must not guess.
          const candidates = bookForFuzzy.filter((b) =>
            isReorderedOrExtendedMatch(normalizedDescription, b.normalized)
          )
          if (candidates.length === 1) {
            hit = candidates[0].entry
            isFuzzyHit = true
          }
        }
      } catch {
        hit = undefined
      }

      // ANCHOR (takes precedence over clamp).
      if (hit && Number.isFinite(hit.unit_price)) {
        anchoredCount++
        if (isFuzzyHit) fuzzyAnchoredCount++
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

  return { sections: mappedSections, anchoredCount, fuzzyAnchoredCount, clampedCount }
}
