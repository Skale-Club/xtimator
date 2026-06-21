import { describe, it, expect, beforeAll } from 'vitest'
import type { EstimateSectionOutput } from '@/lib/ai/types'
// Type-only import for the contract surface. `import type` is erased at compile so it
// never fails collection when the module is absent (RED lives in the runtime importTarget
// in beforeAll below). It also encodes the key-link `from '@/lib/ai/price-anchoring'`.
import type { anchorAndClampSections as _AnchorFn } from '@/lib/ai/price-anchoring'

/**
 * GUARD-02 — price-anchoring guardrails (Wave 0 RED).
 *
 * Pure helper `@/lib/ai/price-anchoring` (lands in Plan 100-02) enforces server-side
 * price authority over AI output:
 *   - ANCHOR: an item whose normalized description matches a price-book entry has its
 *     unit_price OVERRIDDEN with the book price and price_source set to 'price_book'.
 *   - CLAMP: an ai_estimate item whose unit_price exceeds UNIT_PRICE_CEILING (1_000_000)
 *     is clamped to the ceiling (clampedCount++). Zero is KEPT (not clamped).
 *   - PRECEDENCE: anchor before clamp — a matched item is anchored to the in-bounds book
 *     price, never clamped.
 *   - TENANT SCOPE: the helper only ever reads the passed `priceBook` array — a name not
 *     present in the array never anchors (encodes the companyId-scoping invariant at the
 *     pure-function boundary; the caller in 100-02 passes the already companyId-scoped book).
 *
 * RED today: `@/lib/ai/price-anchoring` does not exist. The computed-specifier importTarget
 * defeats Vite transform-time import-analysis so the file COLLECTS cleanly and each test
 * fails at RUN time. Mirrors never-throw.test.ts.
 */

const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

type AnchorResult = {
  sections: EstimateSectionOutput[]
  anchoredCount: number
  clampedCount: number
}

let anchorAndClampSections: (
  sections: EstimateSectionOutput[],
  priceBook: Array<{ name: string; unit_price: number }>
) => AnchorResult
let normalizeNameForMatch: (name: string) => string
let UNIT_PRICE_CEILING: number

beforeAll(async () => {
  const mod = await importTarget('@/lib/ai/price-anchoring')
  anchorAndClampSections = mod.anchorAndClampSections
  normalizeNameForMatch = mod.normalizeNameForMatch
  UNIT_PRICE_CEILING = mod.UNIT_PRICE_CEILING
})

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
