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
import {
  CLASSIC_CARD_BOX,
  ESTIMATE_PAGE_GEOMETRY,
  LINE_HEIGHT,
  PHOTO_TILE_GAP_PT,
  photoTileWidthPt,
} from '@/lib/estimate/document/tokens'
import { createFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/estimator'
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
    expect(cards[0].baseHeightPt - cards[1].baseHeightPt).toBeCloseTo(24, 9)
  })

  it('the same bonus is 32pt on Modern', () => {
    const input = baseInput({ payment_terms: 'Payment terms text', notes: 'Notes text', templateId: 'modern' })
    const cards = blocksFromModel(input).filter((b) => b.kind === 'terms-card')
    expect(cards[0].baseHeightPt - cards[1].baseHeightPt).toBeCloseTo(32, 9)
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

  const fourPhotos = Array.from({ length: 4 }, (_, i) => ({ url: `https://x/${i}.jpg`, caption: null }))

  it('Classic: the FIRST chunk charges tile + the 16pt margin above the label + the label line + its 6pt marginBottom; later chunks charge tile + the 8pt row gap only', () => {
    const rows = blocksFromModel(baseInput({ photos: fourPhotos, templateId: 'classic' })).filter((b) => b.kind === 'photo-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].ref?.photoRange?.[0]).toBe(0)
    const tile = photoTileWidthPt(ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt)
    expect(tile).toBe(172)
    // termsTitle: fontSize 8, Inter-Bold natural line height, marginBottom 6
    expect(rows[0].baseHeightPt).toBeCloseTo(tile + 16 + 8 * LINE_HEIGHT['Inter-Bold'] + 6, 6)
    expect(rows[1].baseHeightPt).toBeCloseTo(tile + PHOTO_TILE_GAP_PT, 6)
  })

  it('Modern: same structure with the 20pt top margin, Lora-Bold label line and 7pt label marginBottom', () => {
    const rows = blocksFromModel(baseInput({ photos: fourPhotos, templateId: 'modern' })).filter((b) => b.kind === 'photo-row')
    const tile = photoTileWidthPt(ESTIMATE_PAGE_GEOMETRY.modern.contentWidthPt)
    expect(tile).toBe(164)
    expect(rows[0].baseHeightPt).toBeCloseTo(tile + 20 + 8 * LINE_HEIGHT['Lora-Bold'] + 7, 6)
    expect(rows[1].baseHeightPt).toBeCloseTo(tile + PHOTO_TILE_GAP_PT, 6)
  })

  it('a full row of tiles spans the whole content width in both templates (3 tiles + 2 gaps === contentWidthPt)', () => {
    for (const t of ['classic', 'modern'] as const) {
      const w = ESTIMATE_PAGE_GEOMETRY[t].contentWidthPt
      expect(3 * photoTileWidthPt(w) + 2 * PHOTO_TILE_GAP_PT).toBeCloseTo(w, 9)
    }
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
  it('emits title-banner, info-grid, summary, per-section (header, rows, subtotal), totals, terms-cards, signature, prepared-by, photo-rows — in that order', () => {
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
      'prepared-by',
      'photo-row',
    ])
  })

  it('"Prepared by" comes right after the signature block and BEFORE the photos — in both templates', () => {
    for (const templateId of ['classic', 'modern'] as const) {
      const kinds = blocksFromModel(
        baseInput({
          templateId,
          payment_terms: 'Payment terms',
          signature: { signerName: 'Jane', signedAt: '2026-01-01T00:00:00Z', signatureDataUrl: 'data:image/png;base64,x' },
          photos: [{ url: 'https://x/1.jpg', caption: null }],
          preparedBy: 'Jamie Lee',
        })
      ).map((b) => b.kind)
      const iPrepared = kinds.indexOf('prepared-by')
      expect(iPrepared).toBe(kinds.indexOf('signature') + 1)
      expect(iPrepared).toBeLessThan(kinds.indexOf('photo-row'))
      expect(kinds[kinds.length - 1]).toBe('photo-row')
    }
  })

  it('with NO signature, "Prepared by" follows the last terms card and still precedes the photos', () => {
    const kinds = blocksFromModel(
      baseInput({
        payment_terms: 'Payment terms',
        notes: 'Notes',
        photos: [{ url: 'https://x/1.jpg', caption: null }],
        preparedBy: 'Jamie Lee',
      })
    ).map((b) => b.kind)
    expect(kinds.slice(-4)).toEqual(['terms-card', 'terms-card', 'prepared-by', 'photo-row'])
  })
})

describe('blocksFromModel — Classic card box (inner padding) vs Modern (box-less)', () => {
  const twoTerms = { payment_terms: 'Payment terms text', notes: 'Notes text' }

  it('Classic terms card: height = title line (8 x Inter-Bold 1.21) + marginBottom 6 + text marginBottom 0 + vertical padding 2x10 + card marginBottom 8 (the first card additionally carries the 24pt top margin)', () => {
    expect(CLASSIC_CARD_BOX).toEqual({ paddingPt: 10, radiusPt: 4, marginBottomPt: 8 })
    const cards = blocksFromModel(baseInput({ ...twoTerms, templateId: 'classic' })).filter((b) => b.kind === 'terms-card')
    const titleLine = 8 * LINE_HEIGHT['Inter-Bold']
    expect(cards[1].baseHeightPt).toBeCloseTo(titleLine + 6 + 0 + 2 * 10 + 8, 9)
    expect(cards[0].baseHeightPt).toBeCloseTo(titleLine + 6 + 0 + 2 * 10 + 8 + 24, 9)
  })

  it('Classic terms card text is measured at the INNER width (contentWidthPt - 2x10 = 512); Modern, box-less, at the full 508', () => {
    const classic = blocksFromModel(baseInput({ ...twoTerms, templateId: 'classic' })).filter((b) => b.kind === 'terms-card')
    for (const card of classic) {
      expect(card.measurement?.maxWidthPt).toBe(ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt - 20)
    }
    const modern = blocksFromModel(baseInput({ ...twoTerms, templateId: 'modern' })).filter((b) => b.kind === 'terms-card')
    for (const card of modern) {
      expect(card.measurement?.maxWidthPt).toBe(ESTIMATE_PAGE_GEOMETRY.modern.contentWidthPt)
    }
  })

  it('Modern terms card stays box-less: title line (8 x Lora-Bold 1.28) + marginBottom 7 + text marginBottom 14', () => {
    const cards = blocksFromModel(baseInput({ ...twoTerms, templateId: 'modern' })).filter((b) => b.kind === 'terms-card')
    expect(cards[1].baseHeightPt).toBeCloseTo(8 * LINE_HEIGHT['Lora-Bold'] + 7 + 14, 9)
  })

  it('signature card: marginTop 16 + title line + title marginBottom + image 40 + signer marginTop 4 + 2 text lines; Classic additionally the card box (2x10 padding + 8 marginBottom), Modern does not', () => {
    const signature = { signerName: 'Jane', signedAt: '2026-01-01T00:00:00Z', signatureDataUrl: 'data:image/png;base64,x' }
    const sig = (templateId: 'classic' | 'modern') =>
      blocksFromModel(baseInput({ signature, templateId })).find((b) => b.kind === 'signature')!
    const modern = 16 + 8 * LINE_HEIGHT['Lora-Bold'] + 7 + 40 + 4 + 2 * 9 * LINE_HEIGHT.Lora
    const classic = 16 + 8 * LINE_HEIGHT['Inter-Bold'] + 6 + 40 + 4 + 2 * 9 * LINE_HEIGHT.Inter
    expect(sig('modern').baseHeightPt).toBeCloseTo(modern, 9)
    expect(sig('classic').baseHeightPt).toBeCloseTo(classic + 2 * 10 + 8, 9)
  })
})

describe('blocksFromModel — section-title measurement width', () => {
  const classicTitleMeasurement = () => {
    const blocks = blocksFromModel(
      baseInput({ sections: [section({ title: 'T', items: [{ id: 'i1', description: 'Work', quantity: 1, unit: null, unit_price: 1, total: 1 }] })] }),
    )
    return blocks.find((b) => b.kind === 'section-header')!.measurement!
  }

  it('Classic measures the section title at contentWidthPt - 2x10 (the band inner width), Modern at the full contentWidthPt', () => {
    expect(classicTitleMeasurement().maxWidthPt).toBe(ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt - 20)

    const modern = blocksFromModel(
      baseInput({
        templateId: 'modern',
        sections: [section({ title: 'T', items: [{ id: 'i1', description: 'Work', quantity: 1, unit: null, unit_price: 1, total: 1 }] })],
      }),
    ).find((b) => b.kind === 'section-header')!.measurement!
    expect(modern.maxWidthPt).toBe(ESTIMATE_PAGE_GEOMETRY.modern.contentWidthPt)
  })

  it('a Classic title wider than contentWidthPt - 20 but narrower than contentWidthPt wraps to 2 lines (would be 1 at the full width)', () => {
    const provider = createFontkitMeasurementProvider()
    const { styleKey, fontSizePt } = classicTitleMeasurement()
    const full = ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt

    // Grow a multi-word title until it no longer fits the inner width but still fits the full width.
    let title = ''
    let found = ''
    for (let i = 0; i < 200 && !found; i++) {
      title += (i ? ' ' : '') + 'Kitchen'
      if (provider.lineCount(title, styleKey, fontSizePt, full - 20) === 2 && provider.lineCount(title, styleKey, fontSizePt, full) === 1) {
        found = title
      }
    }
    expect(found, 'a title fitting in (contentWidth-20, contentWidth] must exist').not.toBe('')

    const block = blocksFromModel(
      baseInput({ sections: [section({ title: found, items: [{ id: 'i1', description: 'Work', quantity: 1, unit: null, unit_price: 1, total: 1 }] })] }),
    ).find((b) => b.kind === 'section-header')!
    const m = block.measurement!
    expect(provider.lineCount(m.text, m.styleKey, m.fontSizePt, m.maxWidthPt)).toBe(2)
  })
})

describe('blocksFromModel — totals block height matches the real rendered height', () => {
  // Real heights were measured from generated PDFs (pdftotext -bbox row pitches:
  // Modern 25.3 per row, Tax -> Deposit 111.22; Classic 20.6 per row, Total -> Deposit
  // 28.94). Before 2026-10-02 the row text lines were not charged at all (Modern 165.5 /
  // Classic 84.5 predicted vs 240.42 / 161.94 real), which the flat safety margin hid.
  const full = { discount_amount: 15, tax_amount: 111.38, dep: { showDeposit: true, depositAmount: 118.91, balanceDue: 277.47 } }

  it('Modern, subtotal + discount + tax + grand total + deposit + balance due = 240.42pt', () => {
    const totals = blocksFromModel(baseInput({ ...full, templateId: 'modern' })).find((b) => b.kind === 'totals')!
    // 28 container marginTop + 5 rows x 25.3 + grand total block 69.92 + deposit row marginTop 16
    expect(totals.baseHeightPt).toBeCloseTo(28 + 5 * 25.3 + 69.92 + 16, 2)
    expect(totals.baseHeightPt).toBeCloseTo(240.42, 2)
  })

  it('Classic, the same rows = 161.94pt', () => {
    const totals = blocksFromModel(baseInput({ ...full, templateId: 'classic' })).find((b) => b.kind === 'totals')!
    expect(totals.baseHeightPt).toBeCloseTo(161.94, 2)
  })
})

describe('blocksFromModel — photo captions are measured at the tile width', () => {
  it('each captioned photo gets a parallel measurement (caption font, tile width, page-font line height); uncaptioned photos get none', () => {
    const photos = [
      { url: 'https://x/1.jpg', caption: 'A long caption that will certainly wrap onto several lines inside one tile' },
      { url: 'https://x/2.jpg', caption: null },
      { url: 'https://x/3.jpg', caption: 'Short' },
    ]
    for (const [templateId, family] of [['classic', 'Inter'], ['modern', 'Lora']] as const) {
      const row = blocksFromModel(baseInput({ photos, templateId })).find((b) => b.kind === 'photo-row')!
      expect(row.parallelMeasurements).toHaveLength(2)
      for (const m of row.parallelMeasurements!) {
        expect(m.maxWidthPt).toBe(photoTileWidthPt(ESTIMATE_PAGE_GEOMETRY[templateId].contentWidthPt))
        expect(m.fontSizePt).toBe(8)
        expect(m.styleKey).toBe(family)
        expect(m.lineHeightMultiplier).toBe(LINE_HEIGHT[family])
      }
    }
  })

  it('a chunk without captions carries no parallel measurements and no caption margin', () => {
    const row = blocksFromModel(baseInput({ photos: [{ url: 'https://x/1.jpg', caption: null }], templateId: 'classic' })).find((b) => b.kind === 'photo-row')!
    expect(row.parallelMeasurements).toEqual([])
  })
})
