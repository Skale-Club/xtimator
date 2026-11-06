import { describe, it, expect } from 'vitest'
import {
  aiAuthoredFields,
  computeValidUntil,
  documentBlocksContext,
  initialPresentationSettings,
  initialSectionVisibility,
  parseDocumentBlocks,
  resolveDocumentBlocks,
  type DocumentBlocksContext,
} from '@/lib/estimate/document-blocks'
import {
  isSectionVisible,
  resolvePresentationSettings,
} from '@/lib/estimate/presentation-settings'

// SEED-056 Phase A: goldens for every row of the block catalogue (section 2.1),
// the legacy NULL fallback, partial objects and the Valid-until date math.

const bare: DocumentBlocksContext = {
  hasPaymentText: false,
  hasWarrantyText: false,
  hasEstimateTerms: false,
  isAiEstimate: false,
}
const full: DocumentBlocksContext = {
  hasPaymentText: true,
  hasWarrantyText: true,
  hasEstimateTerms: true,
  isAiEstimate: true,
}

describe('resolveDocumentBlocks: system defaults (company document_blocks NULL)', () => {
  it('a blank manual estimate for a bare company starts with nothing but photos', () => {
    expect(resolveDocumentBlocks(null, bare)).toEqual({
      summary: false,
      payment_terms: false,
      warranty_terms: false,
      timeline: false,
      notes: false,
      photos: true,
      estimate_terms: false,
      valid_until: false,
    })
  })

  it('an AI estimate for a bare company gets the summary and nothing else', () => {
    const blocks = resolveDocumentBlocks(null, { ...bare, isAiEstimate: true })
    expect(blocks.summary).toBe(true)
    expect(blocks.payment_terms).toBe(false)
    expect(blocks.warranty_terms).toBe(false)
    expect(blocks.timeline).toBe(false)
    expect(blocks.notes).toBe(false)
  })

  it('payment / warranty / fine print turn on when the company has the text', () => {
    const blocks = resolveDocumentBlocks(null, full)
    expect(blocks.payment_terms).toBe(true)
    expect(blocks.warranty_terms).toBe(true)
    expect(blocks.estimate_terms).toBe(true)
    // ...but timeline / notes / valid_until still need an explicit opt-in.
    expect(blocks.timeline).toBe(false)
    expect(blocks.notes).toBe(false)
    expect(blocks.valid_until).toBe(false)
  })
})

describe('resolveDocumentBlocks: company switches', () => {
  it('"AI summary" off removes the summary from AI estimates', () => {
    expect(resolveDocumentBlocks({ summary: false }, full).summary).toBe(false)
  })

  it('"AI summary" on never gives a blank manual estimate a summary', () => {
    expect(resolveDocumentBlocks({ summary: true }, { ...full, isAiEstimate: false }).summary).toBe(false)
  })

  it('an explicit false beats configured text', () => {
    const blocks = resolveDocumentBlocks(
      { payment_terms: false, warranty_terms: false, estimate_terms: false },
      full,
    )
    expect(blocks.payment_terms).toBe(false)
    expect(blocks.warranty_terms).toBe(false)
    expect(blocks.estimate_terms).toBe(false)
  })

  it('an explicit true cannot conjure a block that has no text behind it', () => {
    const blocks = resolveDocumentBlocks(
      { payment_terms: true, warranty_terms: true, estimate_terms: true },
      bare,
    )
    expect(blocks.payment_terms).toBe(false)
    expect(blocks.warranty_terms).toBe(false)
    expect(blocks.estimate_terms).toBe(false)
  })

  it('timeline / notes / valid_until are opt-in', () => {
    const blocks = resolveDocumentBlocks({ timeline: true, notes: true, valid_until: true }, bare)
    expect(blocks.timeline).toBe(true)
    expect(blocks.notes).toBe(true)
    expect(blocks.valid_until).toBe(true)
  })

  it('photos can be switched off', () => {
    expect(resolveDocumentBlocks({ photos: false }, bare).photos).toBe(false)
  })

  it('the backfilled legacy shape (timeline/notes on, seeded terms off) resolves as documented', () => {
    const backfilled = {
      summary: true,
      payment_terms: false,
      warranty_terms: false,
      timeline: true,
      notes: true,
      photos: true,
      estimate_terms: false,
      valid_until: false,
    }
    const blocks = resolveDocumentBlocks(backfilled, full)
    expect(blocks).toMatchObject({
      summary: true,
      payment_terms: false,
      warranty_terms: false,
      timeline: true,
      notes: true,
      estimate_terms: false,
    })
  })
})

describe('parseDocumentBlocks', () => {
  it('degrades NULL / garbage to an empty object and never throws', () => {
    expect(parseDocumentBlocks(null)).toEqual({})
    expect(parseDocumentBlocks(undefined)).toEqual({})
    expect(parseDocumentBlocks('x')).toEqual({})
    expect(parseDocumentBlocks([true])).toEqual({})
  })

  it('keeps only boolean values for known keys', () => {
    expect(parseDocumentBlocks({ notes: true, timeline: 'yes', bogus: true, summary: false })).toEqual({
      notes: true,
      summary: false,
    })
  })
})

describe('documentBlocksContext', () => {
  it('treats whitespace-only text as absent and requires the fine-print flag AND text', () => {
    expect(
      documentBlocksContext(
        {
          default_payment_terms: '   ',
          default_warranty_terms: '2 years',
          estimate_terms_enabled: true,
          estimate_terms_text: '',
        },
        true,
      ),
    ).toEqual({ hasPaymentText: false, hasWarrantyText: true, hasEstimateTerms: false, isAiEstimate: true })
    expect(
      documentBlocksContext({ estimate_terms_enabled: false, estimate_terms_text: 'x' }, false).hasEstimateTerms,
    ).toBe(false)
  })
})

describe('initialSectionVisibility / aiAuthoredFields', () => {
  it('writes every key explicitly, with line items always on', () => {
    const sections = initialSectionVisibility(resolveDocumentBlocks(null, bare))
    expect(sections).toEqual({
      summary: false,
      sections: true,
      payment_terms: false,
      timeline: false,
      warranty_terms: false,
      notes: false,
      photos: true,
      estimate_terms: false,
      valid_until: false,
    })
  })

  it('aiAuthoredFields mirrors the timeline / notes blocks', () => {
    expect(aiAuthoredFields(resolveDocumentBlocks({ timeline: true }, bare))).toEqual({
      timeline: true,
      notes: false,
    })
  })

  it('materialised settings round-trip through the resolver (hidden stays hidden)', () => {
    const raw = initialPresentationSettings(null, bare)
    const resolved = resolvePresentationSettings(raw)
    expect(isSectionVisible(resolved, 'payment_terms')).toBe(false)
    expect(isSectionVisible(resolved, 'summary')).toBe(false)
    expect(isSectionVisible(resolved, 'sections')).toBe(true)
    expect(isSectionVisible(resolved, 'photos')).toBe(true)
  })
})

describe('legacy safety: the resolver keeps its all-visible fallback', () => {
  it('NULL presentation_settings still shows every legacy block, fine print included', () => {
    const resolved = resolvePresentationSettings(null)
    for (const key of [
      'summary',
      'sections',
      'payment_terms',
      'timeline',
      'warranty_terms',
      'notes',
      'photos',
      'estimate_terms',
    ] as const) {
      expect(isSectionVisible(resolved, key)).toBe(true)
    }
  })

  it('valid_until is absent => hidden (new block, no legacy row carries it)', () => {
    expect(isSectionVisible(resolvePresentationSettings(null), 'valid_until')).toBe(false)
    expect(isSectionVisible(resolvePresentationSettings({ sections: { summary: false } }), 'valid_until')).toBe(false)
    expect(isSectionVisible(resolvePresentationSettings({ sections: { valid_until: true } }), 'valid_until')).toBe(true)
  })

  it('estimate_terms absent (legacy partial object) stays visible', () => {
    expect(
      isSectionVisible(resolvePresentationSettings({ sections: { summary: false } }), 'estimate_terms'),
    ).toBe(true)
  })
})

describe('computeValidUntil', () => {
  const today = new Date(Date.UTC(2026, 10, 6, 23, 30))

  it('uses the estimate date when there is one', () => {
    expect(computeValidUntil('2026-01-15', 30, today)).toBe('2026-02-14')
  })

  it('falls back to today (UTC calendar day)', () => {
    expect(computeValidUntil(null, 30, today)).toBe('2026-12-06')
  })

  it('crosses year boundaries', () => {
    expect(computeValidUntil('2026-12-20', 30, today)).toBe('2027-01-19')
  })

  it('returns null for missing / non-positive validity', () => {
    expect(computeValidUntil(null, 0, today)).toBeNull()
    expect(computeValidUntil(null, null, today)).toBeNull()
    expect(computeValidUntil(null, -5, today)).toBeNull()
  })

  it('ignores a malformed estimate date and uses today', () => {
    expect(computeValidUntil('not-a-date', 10, today)).toBe('2026-11-16')
  })
})
