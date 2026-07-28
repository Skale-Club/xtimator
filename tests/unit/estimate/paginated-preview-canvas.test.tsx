import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { PaginatedDocumentOverlay } from '@/components/workspace/estimate/paginated-document-overlay'
import type { PageAssignment, PageBlock } from '@/lib/estimate/pagination/types'
import type { DocumentCompany } from '@/components/workspace/estimate/estimate-document'
import { FIXTURE_COMPANY } from './fixtures/document-fixtures'

// Phase 185 Plan 03 (PGMODE-02) — jsdom performs NO real layout (offsetTop/
// scrollHeight are always 0 here), so NONE of this test's assertions depend
// on real measurement succeeding — it proves ONLY sheet count/chrome/
// fail-soft/prop-optionality. The REAL positional-binding claim is proven by
// scripts/pagination-binding-check.ts (a standalone Playwright script), not
// here.

const company = FIXTURE_COMPANY as DocumentCompany

function block(id: string): PageBlock {
  return { kind: 'item-row', id, baseHeightPt: 10, atomic: true }
}

function buildPages(count: number, continuesTableIndexes: number[] = []): PageAssignment[] {
  return Array.from({ length: count }, (_, i) => ({
    pageIndex: i,
    blocks: [block(`block-${i}`)],
    continuesTable: continuesTableIndexes.includes(i),
  }))
}

afterEach(cleanup)

describe('PaginatedDocumentOverlay — structure/chrome/fail-soft (jsdom-provable only)', () => {
  it('renders exactly pages.length decorative sheets, regardless of measurement outcome', () => {
    const pages = buildPages(3)
    const { container } = render(
      <PaginatedDocumentOverlay pages={pages} company={company} templateId="classic" language="en">
        <div data-page-block-id="block-0">Page 0 content</div>
        <div data-page-block-id="block-1">Page 1 content</div>
        <div data-page-block-id="block-2">Page 2 content</div>
      </PaginatedDocumentOverlay>
    )
    expect(container.querySelectorAll('[data-page-sheet]').length).toBe(3)
  })

  it('renders "Page N of M" below every sheet, including the last', () => {
    const pages = buildPages(3)
    render(
      <PaginatedDocumentOverlay pages={pages} company={company} templateId="classic" language="en">
        <div data-page-block-id="block-0" />
        <div data-page-block-id="block-1" />
        <div data-page-block-id="block-2" />
      </PaginatedDocumentOverlay>
    )
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
  })

  it('renders the continuation-table-header chrome ONLY on entries with continuesTable: true', () => {
    const pages = buildPages(3, [1]) // only page index 1 continues a table
    const { container } = render(
      <PaginatedDocumentOverlay pages={pages} company={company} templateId="classic" language="en">
        <div data-page-block-id="block-0" />
        <div data-page-block-id="block-1" />
        <div data-page-block-id="block-2" />
      </PaginatedDocumentOverlay>
    )
    const headers = container.querySelectorAll('[data-testid="continuation-header"]')
    expect(headers.length).toBe(1)
    // Confirms it sits inside page index 1's own sheet, not any other page's.
    const sheetForPage1 = container.querySelector('[data-page-sheet="1"]')
    expect(sheetForPage1?.querySelector('[data-testid="continuation-header"]')).toBeTruthy()
  })

  it('never sets overflow: hidden anywhere in the decoration layer', () => {
    const pages = buildPages(2)
    const { container } = render(
      <PaginatedDocumentOverlay pages={pages} company={company} templateId="classic" language="en">
        <div data-page-block-id="block-0" />
        <div data-page-block-id="block-1" />
      </PaginatedDocumentOverlay>
    )
    const all = container.querySelectorAll<HTMLElement>('*')
    for (const el of Array.from(all)) {
      expect(el.className.toString()).not.toMatch(/overflow-hidden/)
      expect(el.style.overflow).not.toBe('hidden')
    }
  })

  it('with pages={null}, renders children with ZERO decoration elements (185-UI-SPEC.md §3 fail-soft)', () => {
    const { container } = render(
      <PaginatedDocumentOverlay pages={null} company={company} templateId="classic" language="en">
        <div data-page-block-id="block-0">Unwrapped content</div>
      </PaginatedDocumentOverlay>
    )
    expect(container.querySelectorAll('[data-page-sheet]').length).toBe(0)
    expect(screen.getByText('Unwrapped content')).toBeTruthy()
  })
})
