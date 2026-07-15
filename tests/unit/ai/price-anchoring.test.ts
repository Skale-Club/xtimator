import { describe, it, expect } from 'vitest'
import type { EstimateSectionOutput } from '@/lib/ai/types'
import {
  anchorAndClampSections,
  normalizeNameForMatch,
  isReorderedOrExtendedMatch,
  UNIT_PRICE_CEILING,
} from '@/lib/ai/price-anchoring'

/**
 * GUARD-02 — price-anchoring guardrails.
 *
 * Pure helper `@/lib/ai/price-anchoring` enforces server-side price authority over
 * AI output:
 *   - ANCHOR: an item whose normalized description matches a price-book entry has its
 *     unit_price OVERRIDDEN with the book price and price_source set to 'price_book'.
 *   - CLAMP: an ai_estimate item whose unit_price exceeds UNIT_PRICE_CEILING (1_000_000)
 *     is clamped to the ceiling (clampedCount++). Zero is KEPT (not clamped).
 *   - PRECEDENCE: anchor before clamp — a matched item is anchored to the in-bounds book
 *     price, never clamped.
 *   - TENANT SCOPE: the helper only ever reads the passed `priceBook` array — a name not
 *     present in the array never anchors (encodes the companyId-scoping invariant at the
 *     pure-function boundary; the caller passes the already companyId-scoped book).
 */

function section(items: EstimateSectionOutput['items']): EstimateSectionOutput[] {
  return [{ title: 'Labor', items }]
}

describe('GUARD-02: price-book anchoring', () => {
  it('anchors a matched item: overrides unit_price and sets price_source=price_book', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Demo Wall', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'demo wall', unit_price: 250 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(250)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.anchoredCount).toBe(1)
  })

  it('matches case/punctuation/space-insensitively via normalizeNameForMatch', () => {
    expect(normalizeNameForMatch('Demo, Wall')).toBe(normalizeNameForMatch('demo  wall'))
    const result = anchorAndClampSections(
      section([{ description: 'demo  wall', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Demo, Wall', unit_price: 250 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(250)
    expect(result.anchoredCount).toBe(1)
  })

  it('leaves an unmatched item unchanged (no anchor)', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Unique Thing', quantity: 1, unit_price: 777, price_source: 'ai_estimate' }]),
      []
    )
    expect(result.sections[0].items[0].unit_price).toBe(777)
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })
})

describe('GUARD-02: clamp bounds', () => {
  it('clamps an ai_estimate unit_price above the ceiling to UNIT_PRICE_CEILING', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Crazy Item', quantity: 1, unit_price: 5_000_000, price_source: 'ai_estimate' }]),
      []
    )
    expect(UNIT_PRICE_CEILING).toBe(1_000_000)
    expect(result.sections[0].items[0].unit_price).toBe(UNIT_PRICE_CEILING)
    expect(result.clampedCount).toBe(1)
  })

  it('keeps a zero-priced ai_estimate item at 0 (not clamped)', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Included', quantity: 1, unit_price: 0, price_source: 'ai_estimate' }]),
      []
    )
    expect(result.sections[0].items[0].unit_price).toBe(0)
    expect(result.clampedCount).toBe(0)
  })

  it('anchor-before-clamp: a matched item whose AI price > ceiling is anchored, not clamped', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Demo Wall', quantity: 1, unit_price: 5_000_000, price_source: 'ai_estimate' }]),
      [{ name: 'demo wall', unit_price: 250 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(250)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.anchoredCount).toBe(1)
    expect(result.clampedCount).toBe(0)
  })
})

describe('GUARD-02: tenant scope (pure-function boundary)', () => {
  it('a name present only in a NOT-passed book never anchors (empty book = no anchor)', () => {
    // The helper only ever reads the priceBook argument. A name that would match a
    // different company's book — but is not in THIS passed array — must not anchor.
    const result = anchorAndClampSections(
      section([{ description: 'Demo Wall', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [] // companyId-scoped book for THIS tenant has no such entry
    )
    expect(result.sections[0].items[0].unit_price).toBe(999)
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })
})

/**
 * Fuzzy matching — see the module doc comment in lib/ai/price-anchoring.ts for why
 * this is a subset/reorder check rather than a similarity-score threshold. Calibrated
 * against realistic catalog pairs: a threshold-based score (character-bigram Dice)
 * cannot separate real matches from dangerous substitutions — "Interior painting" vs
 * "Exterior painting" scores HIGHER (0.875) than the genuine match "Toilet
 * installation" vs "Install toilet" (0.71), and "2 bedroom cleaning" vs "3 bedroom
 * cleaning" scores 0.94. The subset/reorder check has no such failure mode: a
 * substituted word can never be a pure addition.
 */
describe('GUARD-02: fuzzy anchoring — compact (whitespace-insensitive) tier', () => {
  it('anchors a compound word split differently ("Dry wall repair" vs "Drywall repair")', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Dry wall repair', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Drywall repair', unit_price: 300 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(300)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.anchoredCount).toBe(1)
    expect(result.fuzzyAnchoredCount).toBe(1)
  })
})

describe('GUARD-02: fuzzy anchoring — reordered/extended tier', () => {
  it('anchors reordered words ("Wall painting - interior" vs "Interior wall painting")', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Wall painting - interior', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Interior wall painting', unit_price: 450 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(450)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.fuzzyAnchoredCount).toBe(1)
  })

  it('anchors a pure word addition ("Gutter cleaning" vs "Gutter Cleaning Service")', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Gutter cleaning', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Gutter Cleaning Service', unit_price: 180 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(180)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.fuzzyAnchoredCount).toBe(1)
  })

  it('does NOT anchor a substituted directional word ("Interior painting" vs "Exterior painting")', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Interior painting', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Exterior painting', unit_price: 300 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(999)
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })

  it('does NOT anchor a substituted room word ("Kitchen sink installation" vs "Bathroom sink installation")', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Kitchen sink installation', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Bathroom sink installation', unit_price: 400 }]
    )
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })

  it('does NOT anchor a differing quantity/size digit ("2 bedroom cleaning" vs "3 bedroom cleaning")', () => {
    const result = anchorAndClampSections(
      section([{ description: '2 bedroom cleaning', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: '3 bedroom cleaning', unit_price: 200 }]
    )
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })

  it('does NOT anchor a differing capacity digit ("Electrical panel upgrade 100A" vs "...200A")', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Electrical panel upgrade 100A', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Electrical panel upgrade 200A', unit_price: 3500 }]
    )
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })

  it('does NOT anchor an added word that carries a digit ("Water heater replacement" vs "...(40 gal)")', () => {
    // A digit added on one side is a size/capacity variant — never a safe pure
    // addition, even though the non-digit words are a clean superset relationship.
    const result = anchorAndClampSections(
      section([{ description: 'Water heater replacement', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'Water heater replacement (40 gal)', unit_price: 1800 }]
    )
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })

  it('does NOT anchor when two book entries are equally plausible fuzzy candidates (ambiguous)', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Deck staining', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [
        { name: 'Deck staining service', unit_price: 400 },
        { name: 'Staining deck', unit_price: 350 },
      ]
    )
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
    expect(result.anchoredCount).toBe(0)
  })

  it('exact-tier match still wins over fuzzy and is not counted as fuzzy', () => {
    const result = anchorAndClampSections(
      section([{ description: 'Demo Wall', quantity: 1, unit_price: 999, price_source: 'ai_estimate' }]),
      [{ name: 'demo wall', unit_price: 250 }]
    )
    expect(result.sections[0].items[0].unit_price).toBe(250)
    expect(result.anchoredCount).toBe(1)
    expect(result.fuzzyAnchoredCount).toBe(0)
  })
})

describe('isReorderedOrExtendedMatch (unit)', () => {
  it('matches reordered words', () => {
    expect(isReorderedOrExtendedMatch('interior wall painting', 'wall painting interior')).toBe(true)
  })
  it('matches pure word addition in either direction', () => {
    expect(isReorderedOrExtendedMatch('gutter cleaning', 'gutter cleaning service')).toBe(true)
    expect(isReorderedOrExtendedMatch('gutter cleaning service', 'gutter cleaning')).toBe(true)
  })
  it('rejects a substituted word even with high token overlap', () => {
    expect(isReorderedOrExtendedMatch('interior painting', 'exterior painting')).toBe(false)
    expect(isReorderedOrExtendedMatch('front door replacement', 'back door replacement')).toBe(false)
    expect(isReorderedOrExtendedMatch('drywall repair small', 'drywall repair large')).toBe(false)
  })
  it('rejects any differing digit token, even amid otherwise-identical words', () => {
    expect(isReorderedOrExtendedMatch('2 bedroom cleaning', '3 bedroom cleaning')).toBe(false)
    expect(isReorderedOrExtendedMatch('fence repair 20ft', 'fence repair 100ft')).toBe(false)
  })
  it('rejects a pure addition when the added token carries a digit', () => {
    expect(isReorderedOrExtendedMatch('water heater replacement', 'water heater replacement 40 gal')).toBe(false)
  })
  it('rejects when either side has no usable tokens', () => {
    expect(isReorderedOrExtendedMatch('', 'gutter cleaning')).toBe(false)
    expect(isReorderedOrExtendedMatch('-', 'gutter cleaning')).toBe(false)
  })
})
