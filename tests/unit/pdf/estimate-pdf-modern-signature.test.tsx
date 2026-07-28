// tests/unit/pdf/estimate-pdf-modern-signature.test.tsx
//
// Phase 183 Plan 06 (PDFPAR-02) — Modern PDF signature-block coverage,
// mirroring tests/unit/pdf/estimate-pdf-signature.test.tsx (Classic) but
// importing EstimatePDFModern. Proves Modern's signature block uses the same
// shared PdfSignatureBlock — same data, same order — as Classic. Signed ->
// signer name + formatted date rendered, positioned strictly between Terms
// ('Payment Terms'/'Warranty') and 'Photos'. Unsigned -> no signature text at
// all. The signed-date assertion is always computed via
// formatDate(SIGNATURE_FIXTURE.signedAt, 'en') — never hardcoded.

import { describe, it, expect } from 'vitest'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { formatDate } from '@/lib/estimate/document/format'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import {
  buildFixtureEstimate,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
  PHOTO_NO_CAPTION,
} from '../estimate/fixtures/document-fixtures'

const EXPECTED_SIGNED_DATE = formatDate(SIGNATURE_FIXTURE.signedAt, 'en')

describe('EstimatePDFModern signature block (PDFPAR-02)', () => {
  it('signed estimate: signer name + formatted date rendered, ordered Terms -> Signature -> Photos', () => {
    const tree = EstimatePDFModern({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: buildFixtureEstimate({}) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Test',
      projectType: null,
      language: 'en',
      signature: SIGNATURE_FIXTURE,
      attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION],
    })
    const texts: string[] = []
    collectTextNodes(tree, texts)

    expect(texts).toContain(SIGNATURE_FIXTURE.signerName)
    expect(texts).toContain(EXPECTED_SIGNED_DATE)

    const iPaymentTerms = texts.indexOf('Payment Terms')
    const iWarranty = texts.indexOf('Warranty')
    const iSigner = texts.indexOf(SIGNATURE_FIXTURE.signerName)
    const iSignedDate = texts.indexOf(EXPECTED_SIGNED_DATE)
    const iPhotos = texts.indexOf('Photos')

    expect(iPaymentTerms).toBeGreaterThan(-1)
    expect(iWarranty).toBeGreaterThan(-1)
    expect(iPhotos).toBeGreaterThan(-1)

    expect(iPaymentTerms).toBeLessThan(iSigner)
    expect(iWarranty).toBeLessThan(iSigner)
    expect(iPaymentTerms).toBeLessThan(iSignedDate)
    expect(iWarranty).toBeLessThan(iSignedDate)
    expect(iSigner).toBeLessThan(iPhotos)
    expect(iSignedDate).toBeLessThan(iPhotos)
  })

  it('unsigned estimate: no signer name / signed date rendered', () => {
    const tree = EstimatePDFModern({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: buildFixtureEstimate({}) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Test',
      projectType: null,
      language: 'en',
      signature: null,
      attachedPhotos: [],
    })
    const texts: string[] = []
    collectTextNodes(tree, texts)

    expect(texts).not.toContain(SIGNATURE_FIXTURE.signerName)
    expect(texts).not.toContain(EXPECTED_SIGNED_DATE)
  })
})
