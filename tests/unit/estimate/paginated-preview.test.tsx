// tests/unit/estimate/paginated-preview.test.tsx
//
// Quick 260806-pgv Task T4 — new coverage for components/workspace/estimate/
// paginated-preview.tsx: block resolution (a PageBlock.ref routes content to
// the correct sheet, never the wrong one), read-only-ness (zero edit/dnd
// affordances inside any sheet), light-token pinning on every sheet root
// (immune to app dark mode), the pages === null skeleton state, and zebra
// striping parity across a page boundary (PageBlockRef.itemIndex, not
// positional array index within the slice).
//
// Fixture strategy: hand-built PageAssignment[] (option (b) from the T4
// brief) — these assertions need EXACT control over which block lands on
// which page and at which itemIndex (in particular, a continuation slice
// that starts at an ODD itemIndex), which a real engine run cannot guarantee
// deterministically without also depending on font metrics. The document
// fixture itself still comes from the shared tests/unit/estimate/fixtures/
// document-fixtures.ts builder (buildFixtureEstimate + toFixtureDocumentData)
// so every non-overridden field (totals, tax, deposit, etc.) stays internally
// consistent, matching every other test in this directory.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { PaginatedPreview, type PaginatedPreviewProps } from '@/components/workspace/estimate/paginated-preview'
import type { DocumentCompany, EstimateDocumentData } from '@/lib/estimate/document/model'
import type { PageAssignment, PageBlock } from '@/lib/estimate/pagination/types'
import { buildFixtureEstimate, toFixtureDocumentData, FIXTURE_COMPANY } from './fixtures/document-fixtures'

const company = FIXTURE_COMPANY as unknown as DocumentCompany

afterEach(cleanup)

const SECTION_ID = 'sec-1'

function itemRowBlock(itemIndex: number, itemId: string): PageBlock {
  return {
    kind: 'item-row',
    id: `${SECTION_ID}-row-${itemIndex}`,
    baseHeightPt: 12,
    atomic: true,
    ref: { sectionId: SECTION_ID, itemId, itemIndex },
  }
}

/**
 * A 2-page fixture: page 0 opens fresh (title-banner/info-grid/section
 * header + the section's first 3 items, indexes 0-2); page 1 CONTINUES the
 * same section's table starting at itemIndex 3 (odd) through itemIndex 4
 * (even), then closes with a section-subtotal/totals/prepared-by — exactly
 * the "section rows split across pages" shape the T4 brief asks for, with a
 * continuation slice that deliberately starts on an ODD itemIndex so the
 * zebra-parity test can catch a positional (restart-at-0) regression.
 */
function buildTwoPageFixture() {
  const items = Array.from({ length: 5 }, (_, i) => ({
    id: `item-${i}`,
    description: `Line item ${i}`,
    quantity: 1,
    unit: 'ea',
    unit_price: 100,
    total: 100,
    sort_order: i + 1,
  }))

  const estimate = buildFixtureEstimate({
    sections: [
      {
        id: SECTION_ID,
        estimate_id: 'fixture-est-1',
        company_id: 'fixture-co-1',
        title: 'Demolition',
        sort_order: 1,
        subtotal: items.reduce((sum, it) => sum + it.total, 0),
        items,
      },
    ],
  })
  const data = toFixtureDocumentData(estimate) as unknown as EstimateDocumentData

  const pages: PageAssignment[] = [
    {
      pageIndex: 0,
      continuesTable: false,
      blocks: [
        { kind: 'title-banner', id: 'banner', baseHeightPt: 40, atomic: true, page1Only: true },
        { kind: 'info-grid', id: 'info', baseHeightPt: 60, atomic: true, page1Only: true },
        {
          kind: 'section-header',
          id: `${SECTION_ID}-header`,
          baseHeightPt: 20,
          atomic: true,
          keepWithNextId: `${SECTION_ID}-row-0`,
          ref: { sectionId: SECTION_ID },
        },
        itemRowBlock(0, items[0].id),
        itemRowBlock(1, items[1].id),
        itemRowBlock(2, items[2].id),
      ],
    },
    {
      pageIndex: 1,
      continuesTable: true,
      blocks: [
        itemRowBlock(3, items[3].id),
        itemRowBlock(4, items[4].id),
        {
          kind: 'section-subtotal',
          id: `${SECTION_ID}-subtotal`,
          baseHeightPt: 18,
          atomic: true,
          keepWithPreviousId: `${SECTION_ID}-row-4`,
          ref: { sectionId: SECTION_ID },
        },
        { kind: 'totals', id: 'totals', baseHeightPt: 80, atomic: true },
        { kind: 'prepared-by', id: 'prepared-by', baseHeightPt: 20, atomic: true },
      ],
    },
  ]

  return { data, items, pages }
}

function renderPreview(overrides: Partial<PaginatedPreviewProps> = {}) {
  const { data, pages } = buildTwoPageFixture()
  return render(
    <PaginatedPreview
      data={data}
      pages={pages}
      company={company}
      language="en"
      client={null}
      projectName="Test Project"
      projectType={null}
      preparedBy="Jamie Lee"
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      companyTerms={null}
      {...overrides}
    />
  )
}

describe('PaginatedPreview — block resolution', () => {
  it('routes item-row blocks to their assigned sheet — page-2 items render inside sheet 2, never sheet 1 (and vice versa)', () => {
    const { items } = buildTwoPageFixture()
    const { container } = renderPreview()

    const sheet0 = container.querySelector('[data-page-sheet="0"]')
    const sheet1 = container.querySelector('[data-page-sheet="1"]')
    expect(sheet0, 'sheet 0 must exist').toBeTruthy()
    expect(sheet1, 'sheet 1 must exist').toBeTruthy()

    const page0ItemIds = [items[0].id, items[1].id, items[2].id]
    const page1ItemIds = [items[3].id, items[4].id]

    for (const id of page0ItemIds) {
      expect(sheet0!.querySelector(`[data-item-id="${id}"]`), `item ${id} must render inside sheet 0`).toBeTruthy()
      expect(sheet1!.querySelector(`[data-item-id="${id}"]`), `item ${id} must NOT render inside sheet 1`).toBeNull()
    }
    for (const id of page1ItemIds) {
      expect(sheet1!.querySelector(`[data-item-id="${id}"]`), `item ${id} must render inside sheet 1`).toBeTruthy()
      expect(sheet0!.querySelector(`[data-item-id="${id}"]`), `item ${id} must NOT render inside sheet 0`).toBeNull()
    }
  })
})

describe('PaginatedPreview — read-only', () => {
  it('contains zero input/textarea/select/contenteditable/dnd affordances inside any sheet', () => {
    const { container } = renderPreview()
    const sheets = container.querySelectorAll('[data-page-sheet]')
    expect(sheets.length).toBe(2)

    for (const sheet of Array.from(sheets)) {
      expect(sheet.querySelectorAll('input').length).toBe(0)
      expect(sheet.querySelectorAll('textarea').length).toBe(0)
      expect(sheet.querySelectorAll('select').length).toBe(0)
      expect(sheet.querySelectorAll('[contenteditable="true"]').length).toBe(0)
      expect(sheet.querySelectorAll('[draggable="true"]').length).toBe(0)
      // dnd-kit's useSortable spreads role/aria-roledescription="sortable" onto
      // the draggable node — absent here since PaginatedPreview imports no
      // dnd-kit primitives at all.
      expect(sheet.querySelectorAll('[aria-roledescription]').length).toBe(0)
    }
  })
})

describe('PaginatedPreview — light-token pinning', () => {
  it('pins the dark-mode-immune CSS custom properties and colorScheme: light on every sheet root', () => {
    const { container } = renderPreview()
    const sheets = container.querySelectorAll<HTMLElement>('[data-page-sheet]')
    expect(sheets.length).toBe(2)

    for (const sheet of Array.from(sheets)) {
      expect(sheet.style.colorScheme).toBe('light')
      expect(sheet.style.getPropertyValue('--muted')).not.toBe('')
      expect(sheet.style.getPropertyValue('--muted-foreground')).not.toBe('')
      expect(sheet.style.getPropertyValue('--foreground')).not.toBe('')
      expect(sheet.style.getPropertyValue('--border')).not.toBe('')
      expect(sheet.style.getPropertyValue('--card')).not.toBe('')
    }
  })
})

describe('PaginatedPreview — null pages', () => {
  it('pages === null renders the skeleton sheet: no crash, no sheet elements, no editable tree', () => {
    const { container } = renderPreview({ pages: null })

    expect(container.querySelectorAll('[data-page-sheet]').length).toBe(0)
    expect(container.querySelectorAll('input, textarea, select, [contenteditable="true"]').length).toBe(0)
    expect(container.querySelector('.animate-pulse'), 'skeleton must render its pulse placeholder').toBeTruthy()
  })
})

describe('PaginatedPreview — zebra striping', () => {
  it('follows PageBlockRef.itemIndex parity — a continuation slice starting at an odd itemIndex keeps GLOBAL parity, not restart-at-0', () => {
    const { items } = buildTwoPageFixture()
    const { container } = renderPreview()

    const sheet1 = container.querySelector('[data-page-sheet="1"]')!
    const row3 = sheet1.querySelector(`[data-item-id="${items[3].id}"]`) as HTMLElement
    const row4 = sheet1.querySelector(`[data-item-id="${items[4].id}"]`) as HTMLElement
    expect(row3, 'itemIndex 3 row must exist on sheet 1').toBeTruthy()
    expect(row4, 'itemIndex 4 row must exist on sheet 1').toBeTruthy()

    // itemIndex 3 is ODD -> zebra, even though it is the FIRST row rendered
    // in page 1's own <table> (positional index 0 within that slice). A
    // regression that keyed zebra off position-within-slice instead of
    // ref.itemIndex would incorrectly compute this as unstriped.
    expect(row3.className).toContain('bg-muted/40')
    // itemIndex 4 is EVEN -> no zebra.
    expect(row4.className).not.toContain('bg-muted/40')

    // Cross-check page 0's own parity too, so the full 0..4 sequence is
    // provably continuous across the page boundary (0 unstriped, 1 striped,
    // 2 unstriped, 3 striped, 4 unstriped).
    const sheet0 = container.querySelector('[data-page-sheet="0"]')!
    const row0 = sheet0.querySelector(`[data-item-id="${items[0].id}"]`) as HTMLElement
    const row1 = sheet0.querySelector(`[data-item-id="${items[1].id}"]`) as HTMLElement
    const row2 = sheet0.querySelector(`[data-item-id="${items[2].id}"]`) as HTMLElement
    expect(row0.className).not.toContain('bg-muted/40')
    expect(row1.className).toContain('bg-muted/40')
    expect(row2.className).not.toContain('bg-muted/40')
  })
})
