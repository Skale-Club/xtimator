// tests/unit/estimate/paginated-view-engine-parity.test.tsx
//
// Quick 260806-pgv Task T4 — rewrite of the deleted engine-parity test's
// INTENT against the new read-only PaginatedPreview (components/workspace/
// estimate/paginated-preview.tsx). The old test bound the async
// usePaginatedPreview()+PaginatedDocumentOverlay pipeline to a direct engine
// computation via a browser-fontkit mock + waitFor. That machinery is gone:
// PaginatedPreview takes `pages: PageAssignment[] | null` as a plain prop, so
// this test computes a REAL PageAssignment[] synchronously (via the same
// blocksFromModel()->computePageBreaks() pipeline tests/unit/pdf/** uses,
// through the shared tests/unit/pdf/_pages-for-fixture.ts helper) and passes
// it straight in — no async wait, no fontkit browser-build mock needed
// (buildPagesForFixture uses the SERVER fontkit provider, which already runs
// fine under plain Vitest/jsdom, exactly as tests/unit/pdf/
// estimate-pdf-pagination.test.tsx proves).
//
// Covers exactly what the deleted file's docstring promised for the VIEW
// side: exactly pages.length rendered sheets, the repeated items-table
// column-header appearing ONLY on continuesTable pages, and the "Page N of
// M" caption (language-aware) under every sheet.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import React from 'react'
import { PaginatedPreview } from '@/components/workspace/estimate/paginated-preview'
import type { DocumentCompany, EstimateDocumentData } from '@/lib/estimate/document/model'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { LABELS } from '@/lib/estimate/document/labels'
import { buildPagesForFixture } from '../pdf/_pages-for-fixture'
import { buildMultiPageFixtureEstimate, toFixtureDocumentData, FIXTURE_COMPANY } from './fixtures/document-fixtures'

const company = FIXTURE_COMPANY as unknown as DocumentCompany

afterEach(cleanup)

function buildFixture(templateId: EstimateTemplateId) {
  const estimate = buildMultiPageFixtureEstimate()
  const data = toFixtureDocumentData(estimate) as unknown as EstimateDocumentData
  const pages = buildPagesForFixture(estimate, company, templateId)
  return { data, pages }
}

function renderPreview(data: EstimateDocumentData, pages: ReturnType<typeof buildPagesForFixture>) {
  return render(
    <PaginatedPreview
      data={data}
      pages={pages}
      company={company}
      language="en"
      client={null}
      projectName="Test Project"
      projectType={null}
      preparedBy={null}
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      companyTerms={null}
    />
  )
}

describe.each(['classic', 'modern'] as const)(
  'PaginatedPreview — engine parity (%s, real blocksFromModel()->computePageBreaks() pipeline)',
  (templateId) => {
    it('renders exactly pages.length sheet elements for a genuinely multi-page fixture', () => {
      const { data, pages } = buildFixture(templateId)
      expect(pages.length, 'buildMultiPageFixtureEstimate() must force a multi-page fixture').toBeGreaterThan(1)

      const { container } = renderPreview(data, pages)

      expect(container.querySelectorAll('[data-page-sheet]').length).toBe(pages.length)
    })

    it('renders the repeated items-table column-header row ONLY on pages whose PageAssignment.continuesTable is true', () => {
      const { data, pages } = buildFixture(templateId)
      const continuationIndexes = pages.map((p, i) => (p.continuesTable ? i : -1)).filter((i) => i !== -1)
      expect(continuationIndexes.length, 'fixture must produce at least 1 continuation page').toBeGreaterThan(0)

      const { container } = renderPreview(data, pages)

      const allHeaders = container.querySelectorAll('[data-testid="continuation-header"]')
      expect(allHeaders.length).toBe(continuationIndexes.length)

      pages.forEach((page, i) => {
        const sheet = container.querySelector(`[data-page-sheet="${i}"]`)
        expect(sheet, `sheet ${i} must exist`).toBeTruthy()
        const header = sheet!.querySelector('[data-testid="continuation-header"]')
        if (page.continuesTable) {
          expect(header, `page ${i} has continuesTable: true and must show the repeated column header`).toBeTruthy()
        } else {
          expect(header, `page ${i} has continuesTable: false and must NOT show the repeated column header`).toBeNull()
        }
      })
    })

    it('shows the "Page N of M" caption under every sheet, using the resolved language labels', () => {
      const { data, pages } = buildFixture(templateId)
      renderPreview(data, pages)

      const L = LABELS.en
      pages.forEach((_, i) => {
        expect(screen.getByText(`${L.page} ${i + 1} ${L.of} ${pages.length}`)).toBeTruthy()
      })
    })

    it('shows the "Page N of M" caption in Portuguese labels when language="pt"', () => {
      const estimate = buildMultiPageFixtureEstimate()
      const data = toFixtureDocumentData(estimate) as unknown as EstimateDocumentData
      const pages = buildPagesForFixture(estimate, company, templateId)

      render(
        <PaginatedPreview
          data={data}
          pages={pages}
          company={company}
          language="pt"
          client={null}
          projectName="Test Project"
          projectType={null}
          preparedBy={null}
          estimateVersion={1}
          estimateSeq={1}
          estimateCreatedAt="2026-01-01T00:00:00Z"
          companyTerms={null}
        />
      )

      const L = LABELS.pt
      pages.forEach((_, i) => {
        expect(screen.getByText(`${L.page} ${i + 1} ${L.of} ${pages.length}`)).toBeTruthy()
      })
    })
  }
)
