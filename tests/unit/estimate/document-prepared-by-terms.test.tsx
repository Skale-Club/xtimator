import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
} from './fixtures/document-fixtures'

// Phase 185 Plan 03 (PGMODE-02/03/05) — preparedBy/companyTerms render as
// real editor content, matching the PDF's content order (Terms(estimate
// FIRST) -> Signature -> Photos -> Prepared-by), and are STRICTLY additive:
// the public share webview's exact call pattern (mode="view", neither prop
// supplied) must stay byte-identical to before this plan — the concrete
// proof PGMODE-05 rests on.

const COMPANY_TERMS_TEXT = 'Estimate valid for 30 days from the date above.'
const PREPARED_BY_NAME = 'Jordan Rivera'

function buildData(): EstimateDocumentData {
  return toFixtureDocumentData(
    buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
  ) as unknown as EstimateDocumentData
}

describe('EstimateDocument — preparedBy + companyTerms (PGMODE-02/03/05)', () => {
  it('renders companyTerms + preparedBy when BOTH props are provided, ordered Terms(estimate-first) -> Signature -> Photos -> Prepared-by', () => {
    const company: DocumentCompany = {
      ...(FIXTURE_COMPANY as DocumentCompany),
      estimate_terms_enabled: true,
      estimate_terms_text: COMPANY_TERMS_TEXT,
    }

    const { container } = render(
      <EstimateDocument
        mode="view"
        data={buildData()}
        company={company}
        client={null}
        projectName="Test Project"
        projectType={null}
        estimateVersion={1}
        estimateCreatedAt="2026-01-01T00:00:00Z"
        preparedBy={PREPARED_BY_NAME}
        companyTerms={{ enabled: true, text: COMPANY_TERMS_TEXT }}
      />
    )

    // Both new blocks render.
    expect(screen.getByText('Estimate Terms')).toBeTruthy()
    expect(screen.getByText(COMPANY_TERMS_TEXT)).toBeTruthy()
    expect(screen.getByText('Prepared by')).toBeTruthy()
    expect(screen.getByText(PREPARED_BY_NAME)).toBeTruthy()

    // Anchors present for the measurement shell (Task 3b).
    expect(container.querySelector('[data-page-block-id="terms-estimate"]')).toBeTruthy()
    expect(container.querySelector('[data-page-block-id="prepared-by"]')).toBeTruthy()
    expect(container.querySelector('[data-page-block-id="terms-payment"]')).toBeTruthy()
    expect(container.querySelector('[data-page-block-id="signature"]')).toBeTruthy()
    expect(container.querySelector('[data-page-block-id="photo-row-0"]')).toBeTruthy()

    // Content order: estimate-terms -> payment-terms -> signature -> photo caption -> prepared-by.
    const text = container.textContent ?? ''
    const iEstimateTerms = text.indexOf(COMPANY_TERMS_TEXT)
    const iPaymentTerms = text.indexOf('Net 30') // fixture's payment_terms value
    const iSigner = text.indexOf(SIGNATURE_FIXTURE.signerName)
    const iCaption = text.indexOf(PHOTO_WITH_CAPTION.caption)
    const iPreparedBy = text.indexOf(PREPARED_BY_NAME)

    expect(iEstimateTerms).toBeGreaterThan(-1)
    expect(iPaymentTerms).toBeGreaterThan(-1)
    expect(iSigner).toBeGreaterThan(-1)
    expect(iCaption).toBeGreaterThan(-1)
    expect(iPreparedBy).toBeGreaterThan(-1)

    expect(iEstimateTerms).toBeLessThan(iPaymentTerms)
    expect(iPaymentTerms).toBeLessThan(iSigner)
    expect(iSigner).toBeLessThan(iCaption)
    expect(iCaption).toBeLessThan(iPreparedBy)
  })

  it('mode="view" with NEITHER new prop (the public share webview\'s exact call pattern) renders neither block and leaves the 4 existing terms fields unaffected', () => {
    const company = FIXTURE_COMPANY as DocumentCompany

    const { container } = render(
      <EstimateDocument
        mode="view"
        data={buildData()}
        company={company}
        client={null}
        projectName="Test Project"
        projectType={null}
        estimateVersion={1}
        estimateCreatedAt="2026-01-01T00:00:00Z"
        // preparedBy/companyTerms intentionally OMITTED — mirrors
        // components/share/estimate-view.tsx's classic call site exactly.
      />
    )

    // Neither new block renders — no orphan container, no anchor.
    expect(screen.queryByText('Estimate Terms')).toBeNull()
    expect(screen.queryByText('Prepared by')).toBeNull()
    expect(container.querySelector('[data-page-block-id="terms-estimate"]')).toBeNull()
    expect(container.querySelector('[data-page-block-id="prepared-by"]')).toBeNull()

    // The 4 existing terms fields render exactly as before this plan —
    // same ordering (payment -> signature -> photos), same content.
    expect(container.querySelector('[data-page-block-id="terms-payment"]')).toBeTruthy()
    const text = container.textContent ?? ''
    const iPaymentTerms = text.indexOf('Net 30')
    const iSigner = text.indexOf(SIGNATURE_FIXTURE.signerName)
    const iCaption = text.indexOf(PHOTO_WITH_CAPTION.caption)
    expect(iPaymentTerms).toBeGreaterThan(-1)
    expect(iSigner).toBeGreaterThan(-1)
    expect(iCaption).toBeGreaterThan(-1)
    expect(iPaymentTerms).toBeLessThan(iSigner)
    expect(iSigner).toBeLessThan(iCaption)
  })
})
