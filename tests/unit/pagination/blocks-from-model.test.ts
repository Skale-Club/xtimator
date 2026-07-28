// tests/unit/pagination/blocks-from-model.test.ts
//
// Phase 184 Plan 03 (PGBRK-01) — every <behavior> case from
// 184-03-PLAN.md's Task 2: empty-description filtering (via the shared
// visibleSectionItems), all 3 presentation-settings visibility gates, `ref`
// population, defensive input, exact ID-naming, pinned terms-card emission
// order + first-card height bonus, photo-row chunking + first-row height
// bonus, and full document-order output.
import { describe, it, expect } from 'vitest'
import { blocksFromModel, type BlocksFromModelInput } from '@/lib/estimate/pagination/blocks-from-model'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { LABELS } from '@/lib/estimate/document/labels'
import type { DocumentSection } from '@/lib/estimate/document/model'

function baseInput(overrides: Partial<BlocksFromModelInput> = {}): BlocksFromModelInput {
  return {
    sections: [],
    summary: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    notes: null,
    company: {},
    discount_amount: 0,
    tax_amount: 0,
    dep: { showDeposit: false, depositAmount: 0, balanceDue: 0 },
    signature: null,
    photos: [],
    resolvedSettings: resolvePresentationSettings(undefined),
    preparedBy: null,
    L: LABELS.en,
    templateId: 'classic',
    ...overrides,
  }
}

function section(overrides: Partial<DocumentSection> = {}): DocumentSection {
  return {
    id: 'sec-1',
    title: 'Demolition',
    subtotal: 100,
    items: [],
    ...overrides,
  }
}

describe('blocksFromModel — defensive input', () => {
  it('omitting `sections` entirely does not throw, treated as []', () => {
    const input = baseInput()
    delete (input as { sections?: unknown }).sections
    expect(() => blocksFromModel(input)).not.toThrow()
  })

  it('`sections: undefined` does not throw, treated as []', () => {
    expect(() => blocksFromModel(baseInput({ sections: undefined }))).not.toThrow()
    const blocks = blocksFromModel(baseInput({ sections: undefined }))
    expect(blocks.some((b) => b.kind === 'section-header')).toBe(false)
  })
})

describe('blocksFromModel — empty-description filter (via visibleSectionItems)', () => {
  it('a section where every item has an empty/whitespace-only description produces zero item-row blocks, and no section-header/section-subtotal for it', () => {
    const input = baseInput({
      sections: [
        section({
          items: [
            { id: 'i1', description: '', quantity: 1, unit: null, unit_price: 10, total: 10 },
            { id: 'i2', description: '   ', quantity: 1, unit: null, unit_price: 10, total: 10 },
          ],
        }),
      ],
    })
    const blocks = blocksFromModel(input)
    expect(blocks.filter((b) => b.kind === 'item-row')).toHaveLength(0)
    expect(blocks.filter((b) => b.kind === 'section-header')).toHaveLength(0)
    expect(blocks.filter((b) => b.kind === 'section-subtotal')).toHaveLength(0)
  })

  it('a section with 1 real item + 1 empty-description item produces exactly 1 item-row block', () => {
    const input = baseInput({
      sections: [
        section({
          items: [
            { id: 'i1', description: 'Real work', quantity: 1, unit: null, unit_price: 10, total: 10 },
            { id: 'i2', description: '', quantity: 1, unit: null, unit_price: 10, total: 10 },
          ],
        }),
      ],
    })
    const blocks = blocksFromModel(input)
    const rows = blocks.filter((b) => b.kind === 'item-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].ref?.itemId).toBe('i1')
  })
})

describe('blocksFromModel — visibility gates', () => {
  const oneItemSection = section({
    items: [{ id: 'i1', description: 'Work', quantity: 1, unit: null, unit_price: 10, total: 10 }],
  })

  it('sections gate: isSectionVisible(resolvedSettings, "sections") === false hides all section blocks even with real items', () => {
    const input = baseInput({
      sections: [oneItemSection],
      resolvedSettings: resolvePresentationSettings({ sections: { sections: false } }),
    })
    const blocks = blocksFromModel(input)
    expect(blocks.some((b) => b.kind === 'section-header' || b.kind === 'item-row' || b.kind === 'section-subtotal')).toBe(
      false
    )
  })

  it('summary gate: isSectionVisible === false hides the summary block even when summary text is present', () => {
    const input = baseInput({
      summary: 'A great summary',
      resolvedSettings: resolvePresentationSettings({ sections: { summary: false } }),
    })
    expect(blocksFromModel(input).some((b) => b.kind === 'summary')).toBe(false)
  })

  it('summary gate: falsy estimate.summary hides the block even when visible', () => {
    const input = baseInput({ summary: null })
    expect(blocksFromModel(input).some((b) => b.kind === 'summary')).toBe(false)
  })

  it('summary renders when visible AND present', () => {
    const input = baseInput({ summary: 'A great summary' })
    expect(blocksFromModel(input).some((b) => b.kind === 'summary')).toBe(true)
  })

  it('photos gate: isSectionVisible === false hides all photo-row blocks even with a non-empty photos array', () => {
    const input = baseInput({
      photos: [{ url: 'https://x/1.jpg', caption: null }],
      resolvedSettings: resolvePresentationSettings({ sections: { photos: false } }),
    })
    expect(blocksFromModel(input).some((b) => b.kind === 'photo-row')).toBe(false)
  })
})

describe('blocksFromModel — terms-card mapping, pinned order, and first-card height bonus', () => {
  it('all 5 terms fields populated → exactly 5 terms-card blocks, atomic, no keepWith links, in pinned order estimate→payment→timeline→warranty→notes', () => {
    const input = baseInput({
      company: { estimate_terms_enabled: true, estimate_terms_text: 'Estimate terms text' },
      payment_terms: 'Payment terms text',
      timeline: 'Timeline text',
      warranty_terms: 'Warranty text',
      notes: 'Notes text',
    })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards).toHaveLength(5)
    expect(cards.map((c) => c.ref?.termsKey)).toEqual(['estimate', 'payment', 'timeline', 'warranty', 'notes'])
    for (const card of cards) {
      expect(card.atomic).toBe(true)
      expect(card.keepWithNextId).toBeUndefined()
      expect(card.keepWithPreviousId).toBeUndefined()
    }
  })

  it('a subset (only payment + notes) still emits in payment, notes relative order — never notes, payment', () => {
    const input = baseInput({ payment_terms: 'Payment terms text', notes: 'Notes text' })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards.map((c) => c.ref?.termsKey)).toEqual(['payment', 'notes'])
  })

  it('only the FIRST emitted terms-card gets the topMarginPt bonus (24pt Classic) — the second gets +0', () => {
    const input = baseInput({ payment_terms: 'Payment terms text', notes: 'Notes text', templateId: 'classic' })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].baseHeightPt - cards[1].baseHeightPt).toBe(24)
  })

  it('the same bonus is 32pt on Modern', () => {
    const input = baseInput({ payment_terms: 'Payment terms text', notes: 'Notes text', templateId: 'modern' })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards[0].baseHeightPt - cards[1].baseHeightPt).toBe(32)
  })

  it('when only "estimate" is present, it alone gets the first-card bonus', () => {
    const input = baseInput({
      company: { estimate_terms_enabled: true, estimate_terms_text: 'Estimate terms text' },
      templateId: 'classic',
    })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].ref?.termsKey).toBe('estimate')
  })

  it('company.estimate_terms_enabled: false suppresses the estimate terms card even with text present', () => {
    const input = baseInput({
      company: { estimate_terms_enabled: false, estimate_terms_text: 'Estimate terms text' },
    })
    expect(blocksFromModel(input).some((b) => b.ref?.termsKey === 'estimate')).toBe(false)
  })

  it('a terms field individually gated off via presentation settings is excluded even when its text is present', () => {
    const input = baseInput({
      payment_terms: 'Payment terms text',
      notes: 'Notes text',
      resolvedSettings: resolvePresentationSettings({ sections: { payment_terms: false } }),
    })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards.map((c) => c.ref?.termsKey)).toEqual(['notes'])
  })
})

describe('blocksFromModel — photo-row chunking and first-row height bonus', () => {
  it('7 photos at contentWidthPt 532 (Classic) → 3 photo-row blocks chunked [3, 3, 1] via the imported photosPerRow', () => {
    const photos = Array.from({ length: 7 }, (_, i) => ({ url: `https://x/${i}.jpg`, caption: null }))
    const input = baseInput({ photos, templateId: 'classic' })
    const rows = blocksFromModel(input).filter((b) => b.kind === 'photo-row')
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.ref?.photoRange)).toEqual([
      [0, 3],
      [3, 6],
      [6, 7],
    ])
  })

  it('only the block whose ref.photoRange[0] === 0 gets the topMargin bonus (16pt Classic) — the other row gets +0', () => {
    const photos = Array.from({ length: 4 }, (_, i) => ({ url: `https://x/${i}.jpg`, caption: null }))
    const input = baseInput({ photos, templateId: 'classic' })
    const rows = blocksFromModel(input).filter((b) => b.kind === 'photo-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].ref?.photoRange?.[0]).toBe(0)
    expect(rows[0].baseHeightPt - rows[1].baseHeightPt).toBe(16)
  })

  it('the same bonus is 20pt on Modern', () => {
    const photos = Array.from({ length: 4 }, (_, i) => ({ url: `https://x/${i}.jpg`, caption: null }))
    const input = baseInput({ photos, templateId: 'modern' })
    const rows = blocksFromModel(input).filter((b) => b.kind === 'photo-row')
    expect(rows[0].baseHeightPt - rows[1].baseHeightPt).toBe(20)
  })

  it('a row-chunk with any captioned photo gets extra height vs. an identical uncaptioned chunk', () => {
    const uncaptioned = [{ url: 'https://x/1.jpg', caption: null }]
    const captioned = [{ url: 'https://x/1.jpg', caption: 'A caption' }]
    const withoutCaption = blocksFromModel(baseInput({ photos: uncaptioned, templateId: 'classic' })).find(
      (b) => b.kind === 'photo-row'
    )!
    const withCaption = blocksFromModel(baseInput({ photos: captioned, templateId: 'classic' })).find(
      (b) => b.kind === 'photo-row'
    )!
    expect(withCaption.baseHeightPt).toBeGreaterThan(withoutCaption.baseHeightPt)
  })
})

describe('blocksFromModel — signature and prepared-by presence gates', () => {
  it('no signature input → zero signature blocks', () => {
    expect(blocksFromModel(baseInput({ signature: null })).some((b) => b.kind === 'signature')).toBe(false)
  })

  it('signature present → exactly one signature block', () => {
    const input = baseInput({
      signature: { signerName: 'Jane Doe', signedAt: '2026-01-01T00:00:00Z', signatureDataUrl: 'data:image/png;base64,x' },
    })
    expect(blocksFromModel(input).filter((b) => b.kind === 'signature')).toHaveLength(1)
  })

  it('no preparedBy input → zero prepared-by blocks', () => {
    expect(blocksFromModel(baseInput({ preparedBy: null })).some((b) => b.kind === 'prepared-by')).toBe(false)
  })

  it('preparedBy present → exactly one prepared-by block that does NOT set page1Only', () => {
    const input = baseInput({ preparedBy: 'John Smith' })
    const blocks = blocksFromModel(input).filter((b) => b.kind === 'prepared-by')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].page1Only).toBeUndefined()
    expect(blocks[0].atomic).toBe(true)
  })
})

describe('blocksFromModel — ref population, ID naming, and section keep-with links', () => {
  it('every section-header/item-row/section-subtotal block has ref.sectionId; item-row additionally has ref.itemId and ref.itemIndex WITHIN the filtered list', () => {
    const input = baseInput({
      sections: [
        section({
          id: 'sec-a',
          items: [
            { id: 'empty', description: '', quantity: 1, unit: null, unit_price: 1, total: 1 },
            { id: 'first', description: 'First item', quantity: 1, unit: null, unit_price: 1, total: 1 },
            { id: 'second', description: 'Second item', quantity: 1, unit: null, unit_price: 1, total: 1 },
          ],
        }),
      ],
    })
    const blocks = blocksFromModel(input)
    const header = blocks.find((b) => b.kind === 'section-header')!
    const subtotal = blocks.find((b) => b.kind === 'section-subtotal')!
    const rows = blocks.filter((b) => b.kind === 'item-row')

    expect(header.ref?.sectionId).toBe('sec-a')
    expect(subtotal.ref?.sectionId).toBe('sec-a')
    expect(rows).toHaveLength(2)
    expect(rows[0].ref).toEqual({ sectionId: 'sec-a', itemId: 'first', itemIndex: 0 })
    expect(rows[1].ref).toEqual({ sectionId: 'sec-a', itemId: 'second', itemIndex: 1 })
  })

  it('ID naming convention: `${section.id}-header`, `${section.id}-rows-${item.id}`, `${section.id}-subtotal`', () => {
    const input = baseInput({
      sections: [
        section({
          id: 'sec-xyz',
          items: [{ id: 'item-42', description: 'Work', quantity: 1, unit: null, unit_price: 1, total: 1 }],
        }),
      ],
    })
    const blocks = blocksFromModel(input)
    expect(blocks.find((b) => b.kind === 'section-header')?.id).toBe('sec-xyz-header')
    expect(blocks.find((b) => b.kind === 'item-row')?.id).toBe('sec-xyz-rows-item-42')
    expect(blocks.find((b) => b.kind === 'section-subtotal')?.id).toBe('sec-xyz-subtotal')
  })

  it("section-header's keepWithNextId points at the FIRST item-row id; section-subtotal's keepWithPreviousId points at the LAST item-row id — both array-adjacent", () => {
    const input = baseInput({
      sections: [
        section({
          id: 'sec-b',
          items: [
            { id: 'a', description: 'A', quantity: 1, unit: null, unit_price: 1, total: 1 },
            { id: 'b', description: 'B', quantity: 1, unit: null, unit_price: 1, total: 1 },
          ],
        }),
      ],
    })
    const blocks = blocksFromModel(input)
    const header = blocks.find((b) => b.kind === 'section-header')!
    const subtotal = blocks.find((b) => b.kind === 'section-subtotal')!
    const rows = blocks.filter((b) => b.kind === 'item-row')

    expect(header.keepWithNextId).toBe(rows[0].id)
    expect(subtotal.keepWithPreviousId).toBe(rows[rows.length - 1].id)

    // array-adjacency: header immediately precedes rows[0]; subtotal immediately follows the last row
    const headerIdx = blocks.indexOf(header)
    const firstRowIdx = blocks.indexOf(rows[0])
    const lastRowIdx = blocks.indexOf(rows[rows.length - 1])
    const subtotalIdx = blocks.indexOf(subtotal)
    expect(firstRowIdx).toBe(headerIdx + 1)
    expect(subtotalIdx).toBe(lastRowIdx + 1)
  })

  it('block ids are stable strings, never randomly generated (calling blocksFromModel twice on identical input yields identical ids)', () => {
    const input = baseInput({
      sections: [section({ items: [{ id: 'i1', description: 'X', quantity: 1, unit: null, unit_price: 1, total: 1 }] })],
    })
    const first = blocksFromModel(input).map((b) => b.id)
    const second = blocksFromModel(input).map((b) => b.id)
    expect(first).toEqual(second)
  })
})

describe('blocksFromModel — full document order', () => {
  it('emits title-banner, info-grid, summary, per-section (header, rows, subtotal), totals, terms-cards, signature, photo-rows, prepared-by — in that order', () => {
    const input = baseInput({
      summary: 'Summary text',
      sections: [
        section({
          id: 'sec-1',
          items: [{ id: 'i1', description: 'Work', quantity: 1, unit: null, unit_price: 1, total: 1 }],
        }),
      ],
      company: { estimate_terms_enabled: true, estimate_terms_text: 'Estimate terms' },
      payment_terms: 'Payment terms',
      signature: { signerName: 'Jane', signedAt: '2026-01-01T00:00:00Z', signatureDataUrl: 'data:image/png;base64,x' },
      photos: [{ url: 'https://x/1.jpg', caption: null }],
      preparedBy: 'John Smith',
    })
    const kinds = blocksFromModel(input).map((b) => b.kind)
    expect(kinds).toEqual([
      'title-banner',
      'info-grid',
      'summary',
      'section-header',
      'item-row',
      'section-subtotal',
      'totals',
      'terms-card',
      'terms-card',
      'signature',
      'photo-row',
      'prepared-by',
    ])
  })
})
