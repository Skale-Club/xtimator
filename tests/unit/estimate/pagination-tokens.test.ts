// tests/unit/estimate/pagination-tokens.test.ts
//
// Plan 184-01, Task 3 — asserts every value in the <behavior> block of
// 184-01-PLAN.md by exact equality: LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY
// (incl. proseLineHeightMultiplier), photosPerRow, and visibleSectionItems.
import { describe, it, expect } from 'vitest'
import {
  LINE_HEIGHT,
  ESTIMATE_PAGE_GEOMETRY,
  photosPerRow,
  cardTintFill,
  CARD_TINT_ALPHA_HEX,
} from '@/lib/estimate/document/tokens'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
import type { DocumentSection, DocumentItem } from '@/lib/estimate/document/model'

function makeItem(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 'item-1',
    description: 'Some work',
    quantity: 1,
    unit: null,
    unit_price: 100,
    total: 100,
    ...overrides,
  }
}

function makeSection(items: DocumentItem[]): DocumentSection {
  return { id: 'section-1', title: 'Section', subtotal: 0, items }
}

describe('LINE_HEIGHT (font-metrics-derived, hand-verified against vendored TTFs)', () => {
  it('Inter === 1.21', () => {
    expect(LINE_HEIGHT.Inter).toBe(1.21)
  })
  it("'Inter-Bold' === 1.21", () => {
    expect(LINE_HEIGHT['Inter-Bold']).toBe(1.21)
  })
  it('Lora === 1.28', () => {
    expect(LINE_HEIGHT.Lora).toBe(1.28)
  })
  it("'Lora-Bold' === 1.28", () => {
    expect(LINE_HEIGHT['Lora-Bold']).toBe(1.28)
  })
})

describe('ESTIMATE_PAGE_GEOMETRY', () => {
  it('classic.contentWidthPt === 532', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt).toBe(532)
  })
  it('classic.colDescriptionWidthPt === 212.8', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.classic.colDescriptionWidthPt).toBeCloseTo(212.8, 5)
  })
  it('modern.contentWidthPt === 508', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.modern.contentWidthPt).toBe(508)
  })
  it('modern.colDescriptionWidthPt === 203.2', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.modern.colDescriptionWidthPt).toBeCloseTo(203.2, 5)
  })
  it('classic.tableCellFontSizePt === 9', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.classic.tableCellFontSizePt).toBe(9)
  })
  it('modern.tableCellFontSizePt === 9.5', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.modern.tableCellFontSizePt).toBe(9.5)
  })
  it('classic.proseLineHeightMultiplier === 1.5', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.classic.proseLineHeightMultiplier).toBe(1.5)
  })
  it('modern.proseLineHeightMultiplier === 1.6', () => {
    expect(ESTIMATE_PAGE_GEOMETRY.modern.proseLineHeightMultiplier).toBe(1.6)
  })
})

describe('photosPerRow (Plan-checker blocker 1 — lives in lib/estimate/document/tokens.ts)', () => {
  it('photosPerRow(532) === 3 (Classic)', () => {
    expect(photosPerRow(532)).toBe(3)
  })
  it('photosPerRow(508) === 3 (Modern)', () => {
    expect(photosPerRow(508)).toBe(3)
  })
})

describe('visibleSectionItems (Plan-checker warning 11 — the ONE canonical filter)', () => {
  it('returns [] when every item has an empty/whitespace-only description', () => {
    const section = makeSection([
      makeItem({ id: 'a', description: '' }),
      makeItem({ id: 'b', description: '   ' }),
    ])
    expect(visibleSectionItems(section)).toEqual([])
  })

  it('returns only the real item when 1 real + 1 empty-description item', () => {
    const real = makeItem({ id: 'real', description: 'Replace faucet' })
    const empty = makeItem({ id: 'empty', description: '  ' })
    const section = makeSection([real, empty])
    const result = visibleSectionItems(section)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(real)
  })

  it('returns all items unchanged (same objects, same order) when all are real', () => {
    const item1 = makeItem({ id: '1', description: 'First' })
    const item2 = makeItem({ id: '2', description: 'Second' })
    const section = makeSection([item1, item2])
    const result = visibleSectionItems(section)
    expect(result).toEqual([item1, item2])
    expect(result[0]).toBe(item1)
    expect(result[1]).toBe(item2)
  })
})

describe('cardTintFill (Phase 186, POLISH-01)', () => {
  it('returns brandColor + CARD_TINT_ALPHA_HEX for a valid 6-digit hex brandColor', () => {
    const brandColor = '#2563eb'
    expect(cardTintFill(brandColor)).toBe(`${brandColor}${CARD_TINT_ALPHA_HEX}`)
  })

  it('returns undefined for a malformed/non-hex brandColor', () => {
    expect(cardTintFill('not-a-color')).toBeUndefined()
  })
})
