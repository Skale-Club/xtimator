import { describe, it, expect } from 'vitest'

import { checkEstimateConsistency } from '@/lib/estimate/quality/consistency'

/**
 * AIREL-04 (audit finding C4) — lock the pure consistency module: exact-duplicate
 * collapse, qty-0-with-price flagging, and the total-over-ceiling verdict. This
 * module is the ONLY quality gate upgrade beyond `isVagueEstimate`'s total>0 &&
 * has-items check (untouched — see vagueness.test.ts).
 */
describe('checkEstimateConsistency', () => {
  it('Test 1 — no duplicates, no qty-0, under ceiling: sections pass through unchanged, no flags', () => {
    const sections = [
      { title: 'Labor', items: [{ description: 'Demolition', quantity: 1, unit_price: 500 }] },
    ]

    const result = checkEstimateConsistency(sections, 500, { totalCeiling: 2_000_000 })

    expect(result.sections).toEqual(sections)
    expect(result.flags).toEqual([])
    expect(result.overCeiling).toBe(false)
  })

  it('Test 2 — exact-duplicate collapse: two identical $500 lines collapse to one, and the computed total on the deduped items drops', () => {
    const sections = [
      {
        title: 'Labor',
        items: [
          { description: 'Cabinet install', quantity: 1, unit_price: 500 },
          { description: 'Cabinet install', quantity: 1, unit_price: 500 },
        ],
      },
    ]

    const result = checkEstimateConsistency(sections, 1000, { totalCeiling: 2_000_000 })

    expect(result.sections[0].items).toHaveLength(1)
    expect(result.flags).toContainEqual({
      kind: 'duplicate_collapsed',
      description: 'Cabinet install',
      count: 2,
    })

    // Proof the collapse changes the computed total: summing the DEDUPED items
    // yields 500, not the naive (duplicate-inflated) 1000.
    const dedupedTotal = result.sections.reduce(
      (sum, s) => sum + s.items.reduce((si, it) => si + it.quantity * it.unit_price, 0),
      0
    )
    expect(dedupedTotal).toBe(500)
  })

  it('Test 3 — collapse keeps the FIRST occurrence (same object reference/values survive)', () => {
    const first = { description: 'Paint wall', quantity: 2, unit_price: 100, note: 'first' }
    const second = { description: 'Paint wall', quantity: 2, unit_price: 100, note: 'second' }
    const sections = [{ title: 'Paint', items: [first, second] }]

    const result = checkEstimateConsistency(sections, 200, { totalCeiling: 2_000_000 })

    expect(result.sections[0].items).toEqual([first])
  })

  it('Test 4 — near-duplicate with a DIFFERENT price is NOT collapsed (distinct line)', () => {
    const sections = [
      {
        title: 'Fixtures',
        items: [
          { description: 'Toilet', quantity: 1, unit_price: 300 },
          { description: 'Toilet', quantity: 1, unit_price: 450 },
        ],
      },
    ]

    const result = checkEstimateConsistency(sections, 750, { totalCeiling: 2_000_000 })

    expect(result.sections[0].items).toHaveLength(2)
    expect(result.flags.filter((f) => f.kind === 'duplicate_collapsed')).toEqual([])
  })

  it('Test 5 — duplicates spanning TWO different sections still collapse (whole-estimate scope, not per-section)', () => {
    const sections = [
      { title: 'Labor', items: [{ description: 'Haul debris', quantity: 1, unit_price: 200 }] },
      { title: 'Cleanup', items: [{ description: 'Haul debris', quantity: 1, unit_price: 200 }] },
    ]

    const result = checkEstimateConsistency(sections, 400, { totalCeiling: 2_000_000 })

    expect(result.sections[0].items).toHaveLength(1)
    expect(result.sections[1].items).toHaveLength(0)
    expect(result.flags).toContainEqual({
      kind: 'duplicate_collapsed',
      description: 'Haul debris',
      count: 2,
    })
  })

  it('Test 6 — three identical lines collapse to one, count reflects all 3 occurrences', () => {
    const item = { description: 'Trim work', quantity: 1, unit_price: 50 }
    const sections = [{ title: 'Labor', items: [item, { ...item }, { ...item }] }]

    const result = checkEstimateConsistency(sections, 150, { totalCeiling: 2_000_000 })

    expect(result.sections[0].items).toHaveLength(1)
    expect(result.flags).toContainEqual({
      kind: 'duplicate_collapsed',
      description: 'Trim work',
      count: 3,
    })
  })

  it('Test 7 — qty-0-with-price is flagged, never mutated', () => {
    const item = { description: 'Included fixture', quantity: 0, unit_price: 150 }
    const sections = [{ title: 'Materials', items: [item] }]

    const result = checkEstimateConsistency(sections, 0, { totalCeiling: 2_000_000 })

    expect(result.sections[0].items).toEqual([item]) // unchanged, not mutated/dropped
    expect(result.flags).toContainEqual({
      kind: 'qty_zero_with_price',
      description: 'Included fixture',
      unit_price: 150,
    })
  })

  it('Test 8 — qty-0 with price 0 is NOT flagged (a legitimate $0 "included" line)', () => {
    const sections = [
      { title: 'Materials', items: [{ description: 'Included haul-away', quantity: 0, unit_price: 0 }] },
    ]

    const result = checkEstimateConsistency(sections, 0, { totalCeiling: 2_000_000 })

    expect(result.flags.filter((f) => f.kind === 'qty_zero_with_price')).toEqual([])
  })

  it('Test 9 — over-ceiling verdict: computedTotal > ceiling flags total_over_ceiling and sets overCeiling true', () => {
    const sections = [{ title: 'Labor', items: [{ description: 'Full remodel', quantity: 1, unit_price: 3_000_000 }] }]

    const result = checkEstimateConsistency(sections, 3_000_000, { totalCeiling: 2_000_000 })

    expect(result.overCeiling).toBe(true)
    expect(result.flags).toContainEqual({
      kind: 'total_over_ceiling',
      total: 3_000_000,
      ceiling: 2_000_000,
    })
  })

  it('Test 10 — under-ceiling: computedTotal <= ceiling never flags, overCeiling false', () => {
    const sections = [{ title: 'Labor', items: [{ description: 'Full remodel', quantity: 1, unit_price: 2_000_000 }] }]

    const result = checkEstimateConsistency(sections, 2_000_000, { totalCeiling: 2_000_000 })

    expect(result.overCeiling).toBe(false)
    expect(result.flags.filter((f) => f.kind === 'total_over_ceiling')).toEqual([])
  })

  it('Test 11 — degenerate input never throws: null sections', () => {
    expect(() => checkEstimateConsistency(null, 0, { totalCeiling: 2_000_000 })).not.toThrow()
    const result = checkEstimateConsistency(null, 0, { totalCeiling: 2_000_000 })
    expect(result).toEqual({ sections: [], flags: [], overCeiling: false })
  })

  it('Test 12 — degenerate input never throws: empty sections array, undefined items, malformed item', () => {
    expect(() =>
      checkEstimateConsistency([{ title: 'Empty', items: [] }], 0, { totalCeiling: 2_000_000 })
    ).not.toThrow()

    expect(() =>
      // @ts-expect-error deliberately malformed for the never-throw guarantee
      checkEstimateConsistency([{ title: 'Bad', items: undefined }], 0, { totalCeiling: 2_000_000 })
    ).not.toThrow()

    expect(() =>
      // @ts-expect-error deliberately malformed item for the never-throw guarantee
      checkEstimateConsistency([{ title: 'Bad item', items: [null, {}] }], 0, {
        totalCeiling: 2_000_000,
      })
    ).not.toThrow()
  })

  it('Test 13 — non-finite computedTotal never flags over-ceiling (defensive, no throw)', () => {
    const sections = [{ title: 'Labor', items: [{ description: 'x', quantity: 1, unit_price: 100 }] }]
    expect(() => checkEstimateConsistency(sections, NaN, { totalCeiling: 2_000_000 })).not.toThrow()
    const result = checkEstimateConsistency(sections, NaN, { totalCeiling: 2_000_000 })
    expect(result.overCeiling).toBe(false)
  })
})
