// tests/unit/pagination/page-constraints.test.ts
//
// Phase 185 Plan 01 (PGBRK-01/04) — proves computeEstimatePageConstraints()
// introduced ZERO drift from the ORIGINAL inline formula it replaced (the
// exact formula this plan's PLAN.md <interfaces> block quotes verbatim).
// Independently recomputes the expected PageConstraints in this test file
// itself, using the same imported constants but NOT calling the function
// under test to derive its own expectation.
import { describe, it, expect } from 'vitest'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints'
import { measureHeaderHeightPt, CONTINUATION_TABLE_HEADER_HEIGHT_PT, PDF_RENDER_SAFETY_MARGIN_PT } from '@/lib/pdf/measure-header-height'
import { SAFETY_MARGIN_LINES } from '@/lib/estimate/pagination/measure/safety-margin'
import { ESTIMATE_DESIGN_TOKENS, ESTIMATE_PAGE_GEOMETRY, LINE_HEIGHT, LETTER_HEIGHT_PT } from '@/lib/estimate/document/tokens'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'

function company(overrides: Partial<PdfHeaderCompany> = {}): PdfHeaderCompany {
  return {
    name: 'Acme Construction LLC',
    phone: '5551234567',
    email: 'hello@acme.test',
    website: 'https://acme.test',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62704',
    logo_url: null,
    ...overrides,
  }
}

/** Independently recomputes PageConstraints via the ORIGINAL inline formula
 *  (mirrors lib/pdf/render-estimate-pdf.ts's pre-extraction derivation
 *  verbatim) — proves the extraction introduced zero drift. */
function expectedConstraints(c: PdfHeaderCompany, templateId: EstimateTemplateId) {
  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  const headerHeightPt = measureHeaderHeightPt(c, templateId)
  const fontFamily = ESTIMATE_DESIGN_TOKENS[templateId].fontFamily
  const safetyMarginPt =
    SAFETY_MARGIN_LINES * (geometry.tableCellFontSizePt * LINE_HEIGHT[fontFamily]) + PDF_RENDER_SAFETY_MARGIN_PT
  return {
    contentHeightPt: LETTER_HEIGHT_PT - geometry.topPaddingPt - geometry.bottomPaddingPt - headerHeightPt,
    continuationTableHeaderHeightPt: CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId],
    safetyMarginPt,
  }
}

describe('computeEstimatePageConstraints — zero drift from the original inline formula', () => {
  const templateIds: EstimateTemplateId[] = ['classic', 'modern']

  for (const templateId of templateIds) {
    it(`${templateId}: with logo_url and a single-line address matches the independently recomputed formula`, () => {
      const c = company({ logo_url: 'https://acme.test/logo.png', address: '123 Main St', city: 'Springfield', state: 'IL', zip: '62704' })
      expect(computeEstimatePageConstraints(c, templateId)).toEqual(expectedConstraints(c, templateId))
    })

    it(`${templateId}: without logo_url matches the independently recomputed formula`, () => {
      const c = company({ logo_url: null })
      expect(computeEstimatePageConstraints(c, templateId)).toEqual(expectedConstraints(c, templateId))
    })

    it(`${templateId}: with a multi-line address (street + city/state/zip) matches the independently recomputed formula`, () => {
      const c = company({ address: '456 Oak Ave, Suite 200', city: 'Metropolis', state: 'NY', zip: '10001' })
      expect(computeEstimatePageConstraints(c, templateId)).toEqual(expectedConstraints(c, templateId))
    })

    it(`${templateId}: without an address matches the independently recomputed formula`, () => {
      const c = company({ address: null, city: null, state: null, zip: null })
      expect(computeEstimatePageConstraints(c, templateId)).toEqual(expectedConstraints(c, templateId))
    })

    it(`${templateId}: returns numeric contentHeightPt/continuationTableHeaderHeightPt/safetyMarginPt`, () => {
      const result = computeEstimatePageConstraints(company(), templateId)
      expect(typeof result.contentHeightPt).toBe('number')
      expect(typeof result.continuationTableHeaderHeightPt).toBe('number')
      expect(typeof result.safetyMarginPt).toBe('number')
    })
  }
})
