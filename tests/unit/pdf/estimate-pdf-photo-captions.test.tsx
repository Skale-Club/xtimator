// tests/unit/pdf/estimate-pdf-photo-captions.test.tsx
//
// Phase 183 Plan 06 (PDFPAR-03) — PDF photo-grid caption coverage, both
// templates. A captioned photo renders its caption as visible <Text>; an
// uncaptioned photo emits no extra/empty <Text> node (conditional render —
// no empty space when a caption is absent).

import { describe, it, expect } from 'vitest'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import {
  buildFixtureEstimate,
  FIXTURE_COMPANY,
  PHOTO_WITH_CAPTION,
  PHOTO_NO_CAPTION,
} from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type PDFComponent = typeof EstimatePDF

function renderTexts(
  component: PDFComponent,
  attachedPhotos: { id: string; storage_path: string; caption: string | null; url: string }[]
): string[] {
  const templateId = component === EstimatePDF ? 'classic' : 'modern'
  const estimate = buildFixtureEstimate({})
  const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId, { attachedPhotos })
  const tree = component({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: FIXTURE_COMPANY as any,
    client: null,
    projectName: 'Test',
    projectType: null,
    language: 'en',
    attachedPhotos,
    pages,
  })
  const out: string[] = []
  collectTextNodes(tree, out)
  return out
}

describe.each([
  ['Classic', EstimatePDF],
  ['Modern', EstimatePDFModern],
] as const)('%s PDF photo captions (PDFPAR-03)', (_label, component) => {
  it('captioned photo renders its caption text exactly once', () => {
    const texts = renderTexts(component, [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION])
    const matches = texts.filter((t) => t === PHOTO_WITH_CAPTION.caption)
    expect(matches).toHaveLength(1)
  })

  it('caption-less photo emits zero extra text nodes (no empty <Text>)', () => {
    const withCaptionOnly = renderTexts(component, [PHOTO_WITH_CAPTION])
    const withBoth = renderTexts(component, [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION])

    const emptyCountCaptionOnly = withCaptionOnly.filter((t) => t === '').length
    const emptyCountBoth = withBoth.filter((t) => t === '').length

    expect(emptyCountBoth).toBe(emptyCountCaptionOnly)
  })
})
