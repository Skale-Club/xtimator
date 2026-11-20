import { describe, it, expect } from 'vitest'
import {
  bestValuePackIndex,
  defaultPackIndex,
  estimatesForCredits,
  packViews,
} from '@/lib/billing/pack-display'

const PACKS = [
  { credits: 900, priceCents: 1000, priceCentsBrl: 5490 },
  { credits: 1900, priceCents: 2000, priceCentsBrl: 10990 },
  { credits: 5000, priceCents: 5000, priceCentsBrl: 27990 },
]

describe('pack display (credits plan 2026-11-20)', () => {
  it('turns credits into a range of estimates: large estimates give the minimum, small the maximum', () => {
    expect(estimatesForCredits(900, { low: 65, high: 150 })).toEqual({ min: 6, max: 13 })
    expect(estimatesForCredits(1900, { low: 65, high: 150 })).toEqual({ min: 12, max: 29 })
    expect(estimatesForCredits(5000, { low: 65, high: 150 })).toEqual({ min: 33, max: 76 })
  })

  it('a misconfigured range (high below low, zero) never divides by zero or inverts', () => {
    expect(estimatesForCredits(900, { low: 0, high: 0 })).toEqual({ min: 900, max: 900 })
    expect(estimatesForCredits(900, { low: 150, high: 65 })).toEqual({ min: 6, max: 6 })
  })

  it('"Best value" is the pack with the most credits per unit of price, not the middle one', () => {
    expect(bestValuePackIndex(PACKS, 'usd')).toBe(2)
  })

  it('ties go to the bigger pack; a single pack has no best value', () => {
    expect(bestValuePackIndex([{ credits: 100, priceCents: 100 }, { credits: 200, priceCents: 200 }], 'usd')).toBe(1)
    expect(bestValuePackIndex([PACKS[0]], 'usd')).toBe(-1)
  })

  it('packViews carries price, currency, range and best value per pack', () => {
    const views = packViews(PACKS, 'brl', { low: 65, high: 150 })
    expect(views.map((v) => v.priceCents)).toEqual([5490, 10990, 27990])
    expect(views.every((v) => v.currency === 'brl')).toBe(true)
    expect(views.filter((v) => v.bestValue).map((v) => v.index)).toEqual([2])
  })

  it('offers the middle pack first when there are three', () => {
    expect(defaultPackIndex(3)).toBe(1)
    expect(defaultPackIndex(1)).toBe(0)
  })
})
