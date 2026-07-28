// tests/unit/pdf/estimate-pdf-signature.test.tsx
//
// Phase 183 Plan 06 (PDFPAR-02) — Classic PDF signature-block coverage.
// EstimatePDF is a plain function component — call it directly and walk the
// returned element tree (shared _pdf-text-walker helper), matching the
// existing PDF-direct-call test convention (estimate-pdf-totals.test.tsx,
// estimate-pdf-baseline-order.test.tsx). Signed -> signer name + formatted
// date + a real signature <Image>, positioned strictly between Terms
// ('Payment Terms'/'Warranty') and 'Photos'. Unsigned -> no signature text at
// all (no placeholder). The signed-date assertion is always computed via
// formatDate(SIGNATURE_FIXTURE.signedAt, 'en') — never hardcoded (this repo
// has a documented history of timezone-fragile hardcoded-date snapshots).
//
// The third test (this file only) is the REAL renderToBuffer smoke test
// closing 183-RESEARCH.md's "no live render test was performed" caveat —
// proves a genuine base64 PNG signature image renders through the full
// @react-pdf/renderer pipeline (registered fonts included) without throwing.

import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import type { EstimateWithSections } from '@/lib/queries/estimate'
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

describe('EstimatePDF signature block (PDFPAR-02)', () => {
  it('signed estimate: signer name + formatted date rendered, ordered Terms -> Signature -> Photos', () => {
    const tree = EstimatePDF({
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
    const tree = EstimatePDF({
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

  it('renderToBuffer smoke test: real render with a genuine base64 PNG signature succeeds', async () => {
    const element = createElement(EstimatePDF, {
      estimate: buildFixtureEstimate({}) as unknown as EstimateWithSections,
      company: FIXTURE_COMPANY,
      client: null,
      projectName: 'Test',
      projectType: null,
      language: 'en',
      signature: SIGNATURE_FIXTURE,
      attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.toString('latin1', 0, 4)).toBe('%PDF')
  })
})
