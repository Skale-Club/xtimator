import { describe, expect, it } from 'vitest'
import { selectRelevantPriceBook } from '@/lib/ai/price-book-select'

const item = (name: string, folder: string | null = null, unit_price = 1) => ({
  name,
  folder_name: folder,
  unit: 'each',
  unit_price,
})

const BOOK = [
  item('Architectural shingles install', 'Roofing'),
  item('Ridge vent', 'Roofing'),
  item('Interior painting', 'Painting'),
  item('Exterior painting', 'Painting'),
  item('Toilet install', 'Plumbing'),
  item('Dumpster rental', null),
  item('Gutter cleaning', 'Cleaning'),
  item('Drone survey', 'Misc'),
]

describe('selectRelevantPriceBook', () => {
  it('returns the whole book when it already fits in max', () => {
    expect(selectRelevantPriceBook(BOOK, { sourceText: 'x', max: 50 })).toEqual(BOOK)
  })

  it('always includes entries whose normalised name appears in the source text, even over max', () => {
    const out = selectRelevantPriceBook(BOOK, {
      sourceText: 'Please do Interior Painting, and a Ridge vent. Also toilet install.',
      max: 1,
    })
    expect(out.map((i) => i.name)).toEqual(['Interior painting', 'Ridge vent', 'Toilet install'])
  })

  it('adds entries sharing tokens with the source text, ranked, up to max', () => {
    const out = selectRelevantPriceBook(BOOK, {
      sourceText: 'replace the shingles on the roof and paint the fence',
      max: 2,
    })
    expect(out).toHaveLength(2)
    expect(out.map((i) => i.name)).toContain('Architectural shingles install')
  })

  it('uses the playbook vocabulary when the text is thin', () => {
    const out = selectRelevantPriceBook(BOOK, { sourceText: 'job', playbookTrade: 'roofing', max: 3 })
    expect(out.map((i) => i.name)).toContain('Architectural shingles install')
    expect(out.map((i) => i.name)).not.toContain('Drone survey')
  })

  it('leaves out entries with no overlap at all', () => {
    const out = selectRelevantPriceBook(BOOK, { sourceText: 'ridge vent only', max: 5 })
    expect(out.map((i) => i.name)).toEqual(['Ridge vent'])
  })

  it('is deterministic and independent of input order', () => {
    const opts = { sourceText: 'painting of walls and ceiling, install a toilet', max: 3 }
    const a = selectRelevantPriceBook(BOOK, opts)
    const b = selectRelevantPriceBook([...BOOK].reverse(), opts)
    expect(b).toEqual(a)
    expect(selectRelevantPriceBook(BOOK, opts)).toEqual(a)
  })

  it('does not mutate its input', () => {
    const copy = JSON.stringify(BOOK)
    selectRelevantPriceBook(BOOK, { sourceText: 'painting', max: 2 })
    expect(JSON.stringify(BOOK)).toBe(copy)
  })
})
