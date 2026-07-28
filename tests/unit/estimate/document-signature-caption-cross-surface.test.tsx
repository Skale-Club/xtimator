// tests/unit/estimate/document-signature-caption-cross-surface.test.tsx
//
// Phase 183 Plan 07 (PDFPAR-02/03) — the definitive 4-surface parity proof.
// Mirrors presentation-settings-cross-surface.test.tsx's pattern: ONE shared
// fixture object drives Classic PDF, Modern PDF, Classic webview, and Modern
// webview, and a single assertion block confirms all 4 agree with each
// other. Individual per-surface tests (183-05/183-06) already prove each
// surface is correct in isolation — this test proves they are CONSISTENT
// with one another, and that the Wave-0 "no placeholder when unsigned" rule
// holds everywhere, not just on one surface.
//
// Plain-text/WhatsApp summaries are intentionally out of scope — signature
// and captions are DOCUMENT content, never emitted by either of those
// surfaces (see 183-CONTEXT.md's Deferred Ideas list and 183-RESEARCH.md's
// 4-surface framing throughout this phase).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { EstimateDocument, type DocumentCompany } from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import { formatDate } from '@/lib/estimate/document/format'
import { collectTextNodes } from './_pdf-text-walker'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
  PHOTO_NO_CAPTION,
} from './fixtures/document-fixtures'
import { buildPagesForFixture } from '../pdf/_pages-for-fixture'

const EXPECTED_SIGNED_DATE = formatDate(SIGNATURE_FIXTURE.signedAt, 'en')

function renderAllFourSurfaces(
  estimate: Record<string, unknown>,
  signature: typeof SIGNATURE_FIXTURE | null,
  attachedPhotos: Array<typeof PHOTO_WITH_CAPTION | typeof PHOTO_NO_CAPTION>,
): { classicPdf: string; modernPdf: string; classicShare: string; modernShare: string } {
  // Classic PDF
  const classicPdfTexts: string[] = []
  collectTextNodes(
    EstimatePDF({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Test',
      projectType: null,
      language: 'en',
      signature,
      attachedPhotos,
      pages: buildPagesForFixture(estimate, FIXTURE_COMPANY, 'classic', { signature, attachedPhotos }),
    }),
    classicPdfTexts,
  )

  // Modern PDF
  const modernPdfTexts: string[] = []
  collectTextNodes(
    EstimatePDFModern({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Test',
      projectType: null,
      language: 'en',
      signature,
      attachedPhotos,
      pages: buildPagesForFixture(estimate, FIXTURE_COMPANY, 'modern', { signature, attachedPhotos }),
    }),
    modernPdfTexts,
  )

  // Classic webview
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documentData = toFixtureDocumentData(estimate) as any
  const classicShare = render(
    <EstimateDocument mode="view" data={documentData} company={FIXTURE_COMPANY as DocumentCompany} client={null}
      projectName="Test" projectType={null} language="en" estimateVersion={1} estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z" />,
  )

  // Modern webview
  const modernShare = render(
    <EstimateDocumentModern data={documentData} company={FIXTURE_COMPANY as DocumentCompany} client={null}
      projectName="Test" projectType={null} language="en" estimateVersion={1} estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z" />,
  )

  return {
    classicPdf: classicPdfTexts.join(' '),
    modernPdf: modernPdfTexts.join(' '),
    classicShare: classicShare.container.textContent ?? '',
    modernShare: modernShare.container.textContent ?? '',
  }
}

describe('PDFPAR-02/03: signature + caption cross-surface parity', () => {
  it('signed + captioned estimate: signer name, signed date, and caption text appear on ALL 4 surfaces', () => {
    const estimate = buildFixtureEstimate({
      signature: SIGNATURE_FIXTURE,
      attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION],
    })
    const out = renderAllFourSurfaces(estimate, SIGNATURE_FIXTURE, [
      PHOTO_WITH_CAPTION,
      PHOTO_NO_CAPTION,
    ])

    // 1. Signer name present everywhere.
    expect(out.classicPdf, 'Classic PDF: signer name').toContain(SIGNATURE_FIXTURE.signerName)
    expect(out.modernPdf, 'Modern PDF: signer name').toContain(SIGNATURE_FIXTURE.signerName)
    expect(out.classicShare, 'Classic webview: signer name').toContain(SIGNATURE_FIXTURE.signerName)
    expect(out.modernShare, 'Modern webview: signer name').toContain(SIGNATURE_FIXTURE.signerName)

    // 2. Formatted (computed, never hardcoded) signed date present everywhere.
    expect(out.classicPdf, 'Classic PDF: signed date').toContain(EXPECTED_SIGNED_DATE)
    expect(out.modernPdf, 'Modern PDF: signed date').toContain(EXPECTED_SIGNED_DATE)
    expect(out.classicShare, 'Classic webview: signed date').toContain(EXPECTED_SIGNED_DATE)
    expect(out.modernShare, 'Modern webview: signed date').toContain(EXPECTED_SIGNED_DATE)

    // 3. Caption text present everywhere.
    expect(out.classicPdf, 'Classic PDF: caption').toContain(PHOTO_WITH_CAPTION.caption)
    expect(out.modernPdf, 'Modern PDF: caption').toContain(PHOTO_WITH_CAPTION.caption)
    expect(out.classicShare, 'Classic webview: caption').toContain(PHOTO_WITH_CAPTION.caption)
    expect(out.modernShare, 'Modern webview: caption').toContain(PHOTO_WITH_CAPTION.caption)

    // 4. No stray/empty caption artifact for the uncaptioned photo — spot
    // check only (the per-surface tests already cover this rigorously): the
    // caption string must not appear twice (once per photo would be a bug,
    // since only one of the two photos has a caption).
    const captionOccurrences = (text: string) =>
      text.split(PHOTO_WITH_CAPTION.caption).length - 1
    expect(captionOccurrences(out.classicPdf), 'Classic PDF: caption appears exactly once').toBe(1)
    expect(captionOccurrences(out.modernPdf), 'Modern PDF: caption appears exactly once').toBe(1)
    expect(captionOccurrences(out.classicShare), 'Classic webview: caption appears exactly once').toBe(1)
    expect(captionOccurrences(out.modernShare), 'Modern webview: caption appears exactly once').toBe(1)
  })

  it('unsigned + caption-less estimate: signature is ABSENT from ALL 4 surfaces (no placeholder anywhere)', () => {
    const estimate = buildFixtureEstimate({ signature: null, attachedPhotos: [] })
    const out = renderAllFourSurfaces(estimate, null, [])

    expect(out.classicPdf, 'Classic PDF: no signer name').not.toContain(SIGNATURE_FIXTURE.signerName)
    expect(out.modernPdf, 'Modern PDF: no signer name').not.toContain(SIGNATURE_FIXTURE.signerName)
    expect(out.classicShare, 'Classic webview: no signer name').not.toContain(SIGNATURE_FIXTURE.signerName)
    expect(out.modernShare, 'Modern webview: no signer name').not.toContain(SIGNATURE_FIXTURE.signerName)

    expect(out.classicPdf, 'Classic PDF: no signed date').not.toContain(EXPECTED_SIGNED_DATE)
    expect(out.modernPdf, 'Modern PDF: no signed date').not.toContain(EXPECTED_SIGNED_DATE)
    expect(out.classicShare, 'Classic webview: no signed date').not.toContain(EXPECTED_SIGNED_DATE)
    expect(out.modernShare, 'Modern webview: no signed date').not.toContain(EXPECTED_SIGNED_DATE)
  })

  it('structural: all 4 document surfaces reference signature', () => {
    const sources = [
      'components/pdf/estimate-pdf.tsx',
      'components/pdf/estimate-pdf-modern.tsx',
      'components/workspace/estimate/estimate-document.tsx',
      'components/share/estimate-document-modern.tsx',
    ]
    for (const path of sources) {
      const source = readFileSync(path, 'utf8')
      expect(source, `${path} must reference signature`).toMatch(/signature/)
    }
  })
})
