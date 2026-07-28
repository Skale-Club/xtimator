import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import { formatDate } from '@/lib/estimate/document/format'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
} from './fixtures/document-fixtures'

// Phase 183 Plan 05 (PDFPAR-02) — webview signature block coverage. Both
// templates: signed -> signature image + signer name + formatted date,
// positioned strictly between Terms and Photos; unsigned -> no block at all
// (no placeholder, no DOM node). The signed-date assertion is always computed
// via formatDate(SIGNATURE_FIXTURE.signedAt, 'en') — never hardcoded (this
// repo has a documented history of timezone-fragile hardcoded-date snapshots).

const company = FIXTURE_COMPANY as DocumentCompany
const EXPECTED_SIGNED_DATE = formatDate(SIGNATURE_FIXTURE.signedAt, 'en')

function renderClassic(data: EstimateDocumentData) {
  return render(
    <EstimateDocument
      mode="view"
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />
  )
}

function renderModern(data: EstimateDocumentData) {
  return render(
    <EstimateDocumentModern
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />
  )
}

describe('Signature block — Classic webview (PDFPAR-02)', () => {
  it('signed estimate: renders signature image + signer name + formatted date, ordered Terms -> Signature -> Photos', () => {
    const data = toFixtureDocumentData(
      buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
    ) as unknown as EstimateDocumentData
    const { container } = renderClassic(data)

    expect(container.querySelector('img[src^="data:image/png"]')).toBeTruthy()
    expect(screen.getByText(SIGNATURE_FIXTURE.signerName)).toBeTruthy()
    expect(screen.getByText(EXPECTED_SIGNED_DATE)).toBeTruthy()

    const text = container.textContent ?? ''
    const iTerms = text.indexOf('Net 30') // fixture's payment_terms value
    const iSigner = text.indexOf(SIGNATURE_FIXTURE.signerName)
    const iCaption = text.indexOf(PHOTO_WITH_CAPTION.caption)
    expect(iTerms).toBeGreaterThan(-1)
    expect(iSigner).toBeGreaterThan(-1)
    expect(iCaption).toBeGreaterThan(-1)
    expect(iTerms).toBeLessThan(iSigner)
    expect(iSigner).toBeLessThan(iCaption)
  })

  it('unsigned estimate: renders no signature image, no signer name', () => {
    const data = toFixtureDocumentData(
      buildFixtureEstimate({ signature: null })
    ) as unknown as EstimateDocumentData
    const { container } = renderClassic(data)

    expect(container.querySelector('img[src^="data:image/png"]')).toBeNull()
    expect(screen.queryByText(SIGNATURE_FIXTURE.signerName)).toBeNull()
  })
})

describe('Signature block — Modern webview (PDFPAR-02)', () => {
  it('signed estimate: renders signature image + signer name + formatted date, ordered Terms -> Signature -> Photos', () => {
    const data = toFixtureDocumentData(
      buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
    ) as unknown as EstimateDocumentData
    const { container } = renderModern(data)

    expect(container.querySelector('img[src^="data:image/png"]')).toBeTruthy()
    expect(screen.getByText(SIGNATURE_FIXTURE.signerName)).toBeTruthy()
    expect(screen.getByText(EXPECTED_SIGNED_DATE)).toBeTruthy()

    const text = container.textContent ?? ''
    const iTerms = text.indexOf('Net 30')
    const iSigner = text.indexOf(SIGNATURE_FIXTURE.signerName)
    const iCaption = text.indexOf(PHOTO_WITH_CAPTION.caption)
    expect(iTerms).toBeGreaterThan(-1)
    expect(iSigner).toBeGreaterThan(-1)
    expect(iCaption).toBeGreaterThan(-1)
    expect(iTerms).toBeLessThan(iSigner)
    expect(iSigner).toBeLessThan(iCaption)
  })

  it('unsigned estimate: renders no signature image, no signer name', () => {
    const data = toFixtureDocumentData(
      buildFixtureEstimate({ signature: null })
    ) as unknown as EstimateDocumentData
    const { container } = renderModern(data)

    expect(container.querySelector('img[src^="data:image/png"]')).toBeNull()
    expect(screen.queryByText(SIGNATURE_FIXTURE.signerName)).toBeNull()
  })
})
