// tests/unit/pagination/engine.test.ts
//
// Plan 184-02, Task 2 (RED -> GREEN) — computePageBreaks() behavior coverage:
// determinism, maximal keep-together chains (incl. the 1-item-section
// transitive-closure case), atomic overflow + safety valve, page1Only
// forcing + budget consumption, prepared-by ordinary placement, photo-row
// independence, measured height, per-page (not per-block) safety margin,
// and the persistent continuation-header reservation invariant.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import type { PageBlock, PageConstraints } from '@/lib/estimate/pagination/types'
import type { MeasurementProvider } from '@/lib/estimate/pagination/measure/types'

function makeBlock(overrides: Partial<PageBlock> & Pick<PageBlock, 'kind' | 'id' | 'baseHeightPt'>): PageBlock {
  return {
    atomic: true,
    ...overrides,
  }
}

function makeConstraints(overrides: Partial<PageConstraints> = {}): PageConstraints {
  return {
    contentHeightPt: 1000,
    continuationTableHeaderHeightPt: 0,
    safetyMarginPt: 0,
    ...overrides,
  }
}

/** Fake provider: always returns a fixed line count regardless of args
 *  (deterministic, no fontkit). */
function fakeProvider(lineCount: number): MeasurementProvider {
  return {
    lineCount: () => lineCount,
  }
}

describe('computePageBreaks — determinism', () => {
  it('is a pure function of its 3 arguments: identical input -> JSON-identical output on repeated calls', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'title-banner', id: 'banner', baseHeightPt: 20, page1Only: true }),
      makeBlock({ kind: 'section-header', id: 'sec-1-header', baseHeightPt: 10, keepWithNextId: 'row-1' }),
      makeBlock({ kind: 'item-row', id: 'row-1', baseHeightPt: 10 }),
      makeBlock({ kind: 'totals', id: 'totals', baseHeightPt: 10 }),
    ]
    const constraints = makeConstraints()
    const provider = fakeProvider(1)

    const first = computePageBreaks(blocks, constraints, provider)
    const second = computePageBreaks(blocks, constraints, provider)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('engine.ts contains zero Date.now/Math.random calls', () => {
    const source = readFileSync('lib/estimate/pagination/engine.ts', 'utf8')
    const matches = source.match(/Date\.now|Math\.random/g)
    expect(matches).toBeNull()
  })
})

describe('computePageBreaks — all-fits case', () => {
  it('produces exactly 1 PageAssignment with continuesTable: false when everything fits', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'title-banner', id: 'banner', baseHeightPt: 20, page1Only: true }),
      makeBlock({ kind: 'info-grid', id: 'info', baseHeightPt: 20, page1Only: true }),
      makeBlock({ kind: 'section-header', id: 'sec-1-header', baseHeightPt: 10, keepWithNextId: 'row-1' }),
      makeBlock({ kind: 'item-row', id: 'row-1', baseHeightPt: 10 }),
      makeBlock({ kind: 'item-row', id: 'row-2', baseHeightPt: 10 }),
      makeBlock({ kind: 'section-subtotal', id: 'sec-1-subtotal', baseHeightPt: 10, keepWithPreviousId: 'row-2' }),
      makeBlock({ kind: 'totals', id: 'totals', baseHeightPt: 10 }),
    ]
    const constraints = makeConstraints({ contentHeightPt: 1000 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages).toHaveLength(1)
    expect(pages[0].continuesTable).toBe(false)
    expect(pages[0].blocks.map((b) => b.id)).toEqual([
      'banner',
      'info',
      'sec-1-header',
      'row-1',
      'row-2',
      'sec-1-subtotal',
      'totals',
    ])
  })
})

describe('computePageBreaks — maximal keep-together chains', () => {
  it('moves a normal (2+ item) section header+first-row TOGETHER to the next page when they do not both fit', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'totals', id: 'prefill', baseHeightPt: 75 }),
      makeBlock({ kind: 'section-header', id: 'sec-1-header', baseHeightPt: 20, keepWithNextId: 'row-1' }),
      makeBlock({ kind: 'item-row', id: 'row-1', baseHeightPt: 15 }),
      makeBlock({ kind: 'item-row', id: 'row-2', baseHeightPt: 15 }),
      makeBlock({ kind: 'item-row', id: 'row-3', baseHeightPt: 15 }),
      makeBlock({ kind: 'section-subtotal', id: 'sec-1-subtotal', baseHeightPt: 18, keepWithPreviousId: 'row-3' }),
    ]
    // contentHeightPt: 100, prefill: 75 -> only 25pt remaining before the
    // header+row-1 chain (35pt) is considered: fits the header alone (20),
    // NOT header+row-1 together (35 > 25).
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['prefill'])
    // header and row-1 land TOGETHER on the next page, never split.
    const page1Ids = pages[1].blocks.map((b) => b.id)
    const headerIdx = page1Ids.indexOf('sec-1-header')
    const row1Idx = page1Ids.indexOf('row-1')
    expect(headerIdx).toBeGreaterThanOrEqual(0)
    expect(row1Idx).toBe(headerIdx + 1)
  })

  it('treats a 1-item section (header + single row + subtotal) as ONE maximal 3-block chain via transitive closure', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'totals', id: 'prefill', baseHeightPt: 48 }),
      makeBlock({ kind: 'section-header', id: 'sec-1-header', baseHeightPt: 20, keepWithNextId: 'row-X' }),
      makeBlock({ kind: 'item-row', id: 'row-X', baseHeightPt: 15 }),
      makeBlock({ kind: 'section-subtotal', id: 'sec-1-subtotal', baseHeightPt: 18, keepWithPreviousId: 'row-X' }),
    ]
    // contentHeightPt: 100, prefill: 48 -> 52pt remaining. Chain total = 53pt
    // (20+15+18): would fit header+row-X alone (35) or row-X+subtotal alone
    // (33), but NOT all 3 (53 > 52) -> entire chain moves together.
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['prefill'])
    expect(pages[1].blocks.map((b) => b.id)).toEqual(['sec-1-header', 'row-X', 'sec-1-subtotal'])
  })
})

describe('computePageBreaks — atomic blocks', () => {
  it('moves an atomic block too tall for the remaining space entirely to a fresh page', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'totals', id: 'prefill', baseHeightPt: 70 }),
      makeBlock({ kind: 'totals', id: 'big-totals', baseHeightPt: 50 }),
    ]
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['prefill'])
    expect(pages[1].blocks.map((b) => b.id)).toEqual(['big-totals'])
  })

  it('places an atomic block taller than an entirely empty page on its own fresh page without an infinite loop', () => {
    const blocks: PageBlock[] = [makeBlock({ kind: 'totals', id: 'huge-totals', baseHeightPt: 150 })]
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages).toHaveLength(1)
    expect(pages[0].blocks.map((b) => b.id)).toEqual(['huge-totals'])
  })
})

describe('computePageBreaks — page1Only forcing and budget consumption', () => {
  it('forces title-banner/info-grid onto page 0 and charges their height against the budget (not free)', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'title-banner', id: 'banner', baseHeightPt: 60, page1Only: true }),
      makeBlock({ kind: 'info-grid', id: 'info', baseHeightPt: 80, page1Only: true }),
      makeBlock({ kind: 'totals', id: 'totals-1', baseHeightPt: 60 }),
      makeBlock({ kind: 'totals', id: 'totals-2', baseHeightPt: 60 }),
    ]
    const constraints = makeConstraints({
      contentHeightPt: 200,
      continuationTableHeaderHeightPt: 0,
      safetyMarginPt: 0,
    })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['banner', 'info', 'totals-1'])
    expect(pages[1].blocks.map((b) => b.id)).toEqual(['totals-2'])
  })

  it('never forces prepared-by onto page 0 — it is an ordinary atomic flowing block', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'totals', id: 'prefill', baseHeightPt: 70 }),
      makeBlock({ kind: 'prepared-by', id: 'prepared-by', baseHeightPt: 50 }),
    ]
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['prefill'])
    expect(pages[1].blocks.map((b) => b.id)).toEqual(['prepared-by'])
  })
})

describe('computePageBreaks — photo-row independence', () => {
  it('splits 2 photo-rows across pages independently of each other when only 1 fits', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'photo-row', id: 'photo-row-1', baseHeightPt: 60 }),
      makeBlock({ kind: 'photo-row', id: 'photo-row-2', baseHeightPt: 60 }),
    ]
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['photo-row-1'])
    expect(pages[1].blocks.map((b) => b.id)).toEqual(['photo-row-2'])
  })
})

describe('computePageBreaks — measured height', () => {
  it('computes effective height as baseHeightPt + lineCount * lineHeightMultiplier * fontSizePt (no per-block margin)', () => {
    // Expected height: 5 + 3 * 1.2 * 10 = 41. prefill leaves EXACTLY 41pt
    // remaining -- if the engine's formula were off by even 1pt, this
    // boundary case would push the measured row to page 1.
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'totals', id: 'prefill', baseHeightPt: 59 }),
      makeBlock({
        kind: 'item-row',
        id: 'measured-row',
        baseHeightPt: 5,
        measurement: {
          text: 'some wrapped description',
          styleKey: 'Inter',
          fontSizePt: 10,
          lineHeightMultiplier: 1.2,
          maxWidthPt: 200,
        },
      }),
    ]
    const constraints = makeConstraints({ contentHeightPt: 100 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(3))

    expect(pages).toHaveLength(1)
    expect(pages[0].blocks.map((b) => b.id)).toEqual(['prefill', 'measured-row'])
  })
})

describe('computePageBreaks — per-page (not per-block) safety margin', () => {
  it('reduces effective usable height uniformly per page, not per individual block', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'item-row', id: 'row-1', baseHeightPt: 100 }),
      makeBlock({ kind: 'item-row', id: 'row-2', baseHeightPt: 100 }),
    ]

    const noMargin = computePageBreaks(
      blocks,
      makeConstraints({ contentHeightPt: 200, safetyMarginPt: 0 }),
      fakeProvider(0)
    )
    expect(noMargin).toHaveLength(1)
    expect(noMargin[0].blocks.map((b) => b.id)).toEqual(['row-1', 'row-2'])

    const withMargin = computePageBreaks(
      blocks,
      makeConstraints({ contentHeightPt: 200, safetyMarginPt: 20 }),
      fakeProvider(0)
    )
    expect(withMargin.length).toBeGreaterThan(1)
    expect(withMargin[0].blocks.map((b) => b.id)).toEqual(['row-1'])
    expect(withMargin[1].blocks.map((b) => b.id)).toEqual(['row-2'])
  })
})

describe('computePageBreaks — persistent continuation-header reservation', () => {
  it('persists the continuation reservation into heightUsed so it constrains EVERY subsequent chain on that page, not just the first', () => {
    const blocks: PageBlock[] = [
      makeBlock({ kind: 'totals', id: 'prefill', baseHeightPt: 100 }),
      makeBlock({ kind: 'item-row', id: 'row-a', baseHeightPt: 30 }),
      makeBlock({ kind: 'item-row', id: 'row-b', baseHeightPt: 30 }),
      makeBlock({ kind: 'item-row', id: 'row-c', baseHeightPt: 30 }),
    ]
    // Page 0: prefill fills the page exactly (heightUsed=100, available=0).
    // Page 1 (continuation, first chain is 'item-row'): reservation=20 is
    // charged AND persisted. Available for chain 1: 100-20=80 (fits 30).
    // After acceptance heightUsed = 30 (chain) + 20 (reservation) = 50.
    // Chain 2 (row-b): available = 100-50=50, fits 30 -> heightUsed=80.
    // Chain 3 (row-c): available = 100-80=20, does NOT fit 30 (would
    // WRONGLY fit at 40 if the reservation were forgotten after chain 1)
    // -> pushed to page 2.
    const constraints = makeConstraints({ contentHeightPt: 100, continuationTableHeaderHeightPt: 20 })

    const pages = computePageBreaks(blocks, constraints, fakeProvider(0))

    expect(pages[0].blocks.map((b) => b.id)).toEqual(['prefill'])
    expect(pages[1].continuesTable).toBe(true)
    expect(pages[1].blocks.map((b) => b.id)).toEqual(['row-a', 'row-b'])
    expect(pages[2].blocks.map((b) => b.id)).toEqual(['row-c'])
  })
})
