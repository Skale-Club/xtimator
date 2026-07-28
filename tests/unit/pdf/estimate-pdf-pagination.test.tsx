// tests/unit/pdf/estimate-pdf-pagination.test.tsx
//
// Phase 184 Plan 05 (PGBRK-01/03/04) — the phase's payoff structural test:
// proves the N-explicit-<Page> composition wired in Task 2 actually holds
// for a GENUINELY multi-page fixture, for both templates:
//   - real page count (both the direct-call element tree AND the REAL
//     generated PDF byte stream's /Type /Page object count, not merely
//     "renderToBuffer didn't throw")
//   - the repeated items-table column header on every continuation page
//   - determinism of the blocksFromModel()+computePageBreaks() pipeline
//
// Uses tests/unit/pdf/_pages-for-fixture.ts's buildPagesForFixture (the same
// shared helper every other direct-call PDF test uses) so this test exercises
// the identical pipeline lib/pdf/render-estimate-pdf.ts's resolver runs in
// production.

import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToBuffer, Page as PDFPage } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { LABELS as PDF_LABELS } from '@/lib/estimate/document/labels'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import {
  buildFixtureEstimate,
  buildMultiPageFixtureEstimate,
  FIXTURE_COMPANY,
} from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type PDFComponent = typeof EstimatePDF
type ElementWithChildren = ReactElement<{ children?: ReactNode }>

const L = PDF_LABELS.en
// L.total ('Total') is EXCLUDED from the exact-per-occurrence check below —
// it collides with L.grandTotal (also 'Total' in English), which can add ONE
// MORE legitimate 'Total' occurrence on any page that also contains the
// totals block. Description/Qty/Unit/Unit Price are unambiguous (used
// nowhere else in either template).
const UNAMBIGUOUS_HEADER_LABELS = [L.description, L.qty, L.unit, L.unitPrice]

/**
 * A GENUINELY single-page fixture (unlike buildFixtureEstimate({}), which —
 * once real fontkit measurement + the full title-banner/info-grid/summary/
 * 2-sections/totals/2-terms-cards content is accounted for — actually spans
 * 2 real pages under Classic/Modern's real page geometry with FIXTURE_COMPANY's
 * full header; see this plan's SUMMARY "Deviations" for the empirical
 * finding). One section, one short item, no summary/terms/discount/tax/
 * deposit — comfortably fits on 1 page for both templates.
 */
function buildSmallSinglePageFixture(): Record<string, unknown> {
  return buildFixtureEstimate({
    summary: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sections: [
      {
        id: 'small-sec-1',
        estimate_id: 'fixture-est-1',
        company_id: 'fixture-co-1',
        title: 'Labor',
        sort_order: 1,
        subtotal: 750,
        items: [
          {
            id: 'small-item-1',
            section_id: 'small-sec-1',
            company_id: 'fixture-co-1',
            description: 'Labor - framing and installation',
            quantity: 10,
            unit: 'hr',
            unit_price: 75,
            total: 750,
            sort_order: 1,
            price_source: null,
          },
        ],
      },
    ],
  })
}

function isPageElement(node: ReactNode): node is ElementWithChildren {
  if (node == null || typeof node !== 'object' || !('props' in (node as object))) return false
  const el = node as ElementWithChildren
  const displayName = (el.type as { displayName?: string } | undefined)?.displayName
  return el.type === PDFPage || displayName === 'Page'
}

/** DFS counting every <Page> element anywhere in the tree. */
function countPages(node: ReactNode): number {
  if (node == null || typeof node === 'boolean') return 0
  if (Array.isArray(node)) return node.reduce<number>((sum, n) => sum + countPages(n), 0)
  if (typeof node !== 'object' || !('props' in (node as object))) return 0
  const el = node as ElementWithChildren
  return (isPageElement(el) ? 1 : 0) + countPages(el.props.children)
}

/** Returns each top-level <Page> element's own children subtree, in
 * document order — used to scope a text-content assertion to ONE page at a
 * time (rather than the whole multi-page document). */
function collectPageSubtrees(node: ReactNode, out: ReactNode[] = []): ReactNode[] {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((n) => collectPageSubtrees(n, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as ElementWithChildren
  if (isPageElement(el)) {
    out.push(el.props.children)
    return out
  }
  collectPageSubtrees(el.props.children, out)
  return out
}

describe.each([
  ['Classic', EstimatePDF, 'classic'],
  ['Modern', EstimatePDFModern, 'modern'],
] as const)('%s PDF pagination structural tests (PGBRK-01/03/04)', (_label, component: PDFComponent, templateId: EstimateTemplateId) => {
  function renderDirect(estimate: Record<string, unknown>) {
    const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
    const tree = component({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Pagination Test',
      projectType: null,
      language: 'en',
      pages,
    })
    return { pages, tree }
  }

  it('single-page fixture renders exactly 1 <Page> element', () => {
    const { pages, tree } = renderDirect(buildSmallSinglePageFixture())
    expect(pages.length).toBe(1)
    expect(countPages(tree)).toBe(1)
  })

  it('multi-page fixture forces pages.length >= 3 and renders exactly that many <Page> elements', () => {
    const { pages, tree } = renderDirect(buildMultiPageFixtureEstimate())
    // This is the ONE place this assertion lives — document-fixtures.ts
    // itself carries no pipeline-invoking assertion.
    expect(pages.length >= 3, 'buildMultiPageFixtureEstimate() must force at least 3 pages').toBe(true)
    expect(countPages(tree)).toBe(pages.length)
  })

  it('every genuine continuation page repeats the items-table column header — once for the continuation trigger, plus once per section-header that also starts on that same page', () => {
    const { pages, tree } = renderDirect(buildMultiPageFixtureEstimate())
    const pageSubtrees = collectPageSubtrees(tree)
    expect(pageSubtrees.length).toBe(pages.length)

    const continuationPageIndexes = pages
      .map((page, i) => (page.continuesTable ? i : -1))
      .filter((i) => i !== -1)
    expect(continuationPageIndexes.length, 'fixture must produce at least 1 continuation page').toBeGreaterThan(0)

    for (const i of continuationPageIndexes) {
      const page = pages[i]
      // The page-top continuesTable trigger (1) + one more per section-header
      // that ALSO starts on this same page (a section can finish an earlier
      // section's continuation and then start its own section on the same
      // page — each independently triggers its own table header).
      const sectionHeaderCount = page.blocks.filter((b) => b.kind === 'section-header').length
      const expectedOccurrences = 1 + sectionHeaderCount

      const texts: string[] = []
      collectTextNodes(pageSubtrees[i], texts)
      for (const label of UNAMBIGUOUS_HEADER_LABELS) {
        const occurrences = texts.filter((t) => t === label).length
        expect(occurrences, `page ${i} ("${label}", expected ${expectedOccurrences})`).toBe(expectedOccurrences)
      }
    }
  })

  it('real PDF bytes: /Type /Page object count matches the engine-computed page count (multi-page)', async () => {
    const estimate = buildMultiPageFixtureEstimate()
    const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
    const element = createElement(component, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Pagination Test',
      projectType: null,
      language: 'en',
      pages,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await renderToBuffer(element as any)
    const matches = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []
    expect(matches.length).toBe(pages.length)
  })

  it('real PDF bytes: /Type /Page object count is exactly 1 for the single-page fixture', async () => {
    const estimate = buildSmallSinglePageFixture()
    const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
    const element = createElement(component, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Pagination Test',
      projectType: null,
      language: 'en',
      pages,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await renderToBuffer(element as any)
    const matches = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('is deterministic — computing pages twice for the identical multi-page fixture input yields identical output', () => {
    const estimate = buildMultiPageFixtureEstimate()
    const run1 = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
    const run2 = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2))
  })
})
