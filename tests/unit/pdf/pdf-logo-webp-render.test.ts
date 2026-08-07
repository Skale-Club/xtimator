// @vitest-environment node
//
// PDF-LOGO-01 — the END-TO-END proof that a stored WebP company logo actually
// appears in a generated PDF.
//
// WHY THIS FILE RENDERS REAL PDFs: the whole bug was that every intermediate
// signal looked healthy. `resolveAssetForRenderer` returned a perfectly valid
// `data:image/webp;base64,...`; `logo_url` was a non-empty string; the header
// reserved 64-72pt for it; `renderToBuffer` resolved without throwing. A unit
// test asserting "a data URI was produced" would have passed on every one of
// those days, while every customer's PDF had a blank box. So this file asserts
// on the PDF BYTES: an embedded image XObject with the source's real pixel
// dimensions. Nothing short of that distinguishes the two states.
//
// The `webp -> no XObject` case is kept as a live NEGATIVE CONTROL rather than
// deleted with the bug: it is what proves the positive assertion is sensitive to
// the thing it claims to measure. It also pins react-pdf's actual behaviour
// (`Base64 image invalid format: webp`, caught by @react-pdf/layout's
// `fetchImage`, document still produced) so a dependency bump that changes it
// fails here instead of in production.
//
// `node` environment: sharp is a native binding and the font registration in
// lib/pdf/register-fonts.ts reads real files off disk.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer, Document, Page, Image, View } from '@react-pdf/renderer'
import sharp from 'sharp'

// The storage backend is the ONE thing stubbed — asset-source.ts is the R2/
// Supabase reader, not part of what is under test. Everything downstream of it
// (resolveAssetForRenderer, resolvePdfLogo, the transcode, willPdfRenderLogo,
// PdfHeader, the real @react-pdf pipeline) runs for real.
vi.mock('@/lib/storage/asset-source', () => ({ fetchStoredAsset: vi.fn() }))

import { fetchStoredAsset } from '@/lib/storage/asset-source'
import { resolvePdfLogo } from '@/lib/pdf/resolve-pdf-logo'
import { willPdfRenderLogo } from '@/lib/pdf/pdf-image-support'
import { measureHeaderHeightPt } from '@/lib/pdf/measure-header-height'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

const mockFetch = vi.mocked(fetchStoredAsset)

const LOGO_PATH = '/storage/logos/571b4fc7-0000-4000-8000-000000000000/logo.webp'
/** Distinctive, and both edges under resolve-pdf-logo's 320px cap, so the
 *  embedded XObject must carry these EXACT dimensions — a resize bug or a
 *  different image sneaking in cannot pass. */
const LOGO_W = 300
const LOGO_H = 200

async function makeWebp(opts: { alpha: boolean; width?: number; height?: number }): Promise<Buffer> {
  const width = opts.width ?? LOGO_W
  const height = opts.height ?? LOGO_H
  return sharp({
    create: {
      width,
      height,
      channels: opts.alpha ? 4 : 3,
      background: opts.alpha
        ? { r: 220, g: 40, b: 40, alpha: 0.5 }
        : { r: 220, g: 40, b: 40 },
    },
  })
    .webp()
    .toBuffer()
}

/** Exactly what the `logos` bucket holds today: WebP bytes, `image/webp`. */
function serveWebp(bytes: Buffer) {
  mockFetch.mockResolvedValue({
    body: new Blob([new Uint8Array(bytes)]),
    contentType: 'image/webp',
    contentLength: bytes.byteLength,
    source: 'r2',
  } as never)
}

/**
 * Image XObjects actually embedded in the produced PDF.
 *
 * Asserted as >= 1 rather than == 1 everywhere below, for two independently
 * verified reasons — both empirical, from running this file:
 *   - a PNG carrying real alpha embeds TWO image XObjects, the image and its
 *     `/SMask` soft mask (an opaque PNG embeds one);
 *   - the header is `fixed`, so a multi-page document repeats it.
 * The signal that matters is 1-vs-0: an unembedded logo produces NO image
 * XObject at all, which is exactly what the logo-less and WebP cases assert.
 */
function embeddedImageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length
}

function pdfContains(pdf: Buffer, needle: string): boolean {
  return pdf.toString('latin1').includes(needle)
}

/** A REAL full-template PDF (registered fonts, real pagination pipeline). */
async function renderRealPdf(
  logoUrl: string | null,
  templateId: EstimateTemplateId = 'classic'
): Promise<Buffer> {
  const estimate = buildFixtureEstimate({})
  const company = { ...FIXTURE_COMPANY, logo_url: logoUrl }
  const pages = buildPagesForFixture(estimate, company, templateId, {
    signature: null,
    attachedPhotos: [],
  })
  const Component = templateId === 'classic' ? EstimatePDF : EstimatePDFModern
  const element = createElement(Component, {
    estimate: estimate as unknown as EstimateWithSections,
    company,
    client: null,
    projectName: 'Kitchen Reno',
    projectType: null,
    language: 'en' as const,
    signature: null,
    attachedPhotos: [],
    pages,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await renderToBuffer(element as any))
}

/** A minimal document holding ONLY the given src — isolates react-pdf's own
 *  decoder from PdfHeader's gate, which is what the negative control needs. */
async function renderBareImage(src: string): Promise<Buffer> {
  const element = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'LETTER' as const },
      createElement(View, null, createElement(Image, { src, style: { width: 72, height: 72 } }))
    )
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await renderToBuffer(element as any))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PDF-LOGO-01 — the negative control: react-pdf genuinely cannot draw WebP', () => {
  it('a data:image/webp URI embeds NO image, and does not throw', async () => {
    const webp = await makeWebp({ alpha: true })
    const uri = `data:image/webp;base64,${webp.toString('base64')}`

    const pdf = await renderBareImage(uri)

    // A document IS produced — @react-pdf/layout's fetchImage catches the
    // decoder error and warns. That silence is exactly why this shipped.
    expect(pdf.length).toBeGreaterThan(0)
    expect(embeddedImageCount(pdf)).toBe(0)
  })

  it('the SAME bytes transcoded to PNG DO embed — so the failure is the format, nothing else', async () => {
    const webp = await makeWebp({ alpha: true })
    const png = await sharp(webp).png().toBuffer()

    const pdf = await renderBareImage(`data:image/png;base64,${png.toString('base64')}`)

    expect(embeddedImageCount(pdf)).toBeGreaterThanOrEqual(1)
  })
})

describe('PDF-LOGO-01 — a stored WebP logo now renders in a real estimate PDF', () => {
  it('resolvePdfLogo turns the stored WebP into a PNG data URI (no re-upload required)', async () => {
    serveWebp(await makeWebp({ alpha: true }))

    const resolved = await resolvePdfLogo(LOGO_PATH)

    expect(resolved).toMatch(/^data:image\/png;base64,/)
    expect(willPdfRenderLogo(resolved)).toBe(true)
  })

  it.each<EstimateTemplateId>(['classic', 'modern'])(
    'THE PAYOFF (%s): the logo is a real image XObject in the produced PDF, at its true dimensions',
    async (templateId) => {
      serveWebp(await makeWebp({ alpha: true }))
      const resolved = await resolvePdfLogo(LOGO_PATH)

      const pdf = await renderRealPdf(resolved, templateId)

      expect(embeddedImageCount(pdf)).toBeGreaterThanOrEqual(1)
      expect(pdfContains(pdf, `/Width ${LOGO_W}`)).toBe(true)
      expect(pdfContains(pdf, `/Height ${LOGO_H}`)).toBe(true)

      // Sensitivity: the SAME document, same fixture, logo removed -> zero.
      // Without this the assertion above could be passing on some other image.
      const logoless = await renderRealPdf(null, templateId)
      expect(embeddedImageCount(logoless)).toBe(0)
      expect(pdfContains(logoless, `/Width ${LOGO_W}`)).toBe(false)
    }
  )

  it('the SAME estimate with the RAW stored path embeds nothing — the resolver is what fixes it', async () => {
    const pdf = await renderRealPdf(LOGO_PATH)

    expect(embeddedImageCount(pdf)).toBe(0)
  })

  it('an opaque source takes the JPEG branch and still embeds', async () => {
    serveWebp(await makeWebp({ alpha: false }))

    const resolved = await resolvePdfLogo(LOGO_PATH)
    expect(resolved).toMatch(/^data:image\/jpeg;base64,/)

    expect(embeddedImageCount(await renderRealPdf(resolved))).toBeGreaterThanOrEqual(1)
  })

  it('an already-PNG stored logo is passed through byte-identically (the rows that render today)', async () => {
    const png = await sharp({
      create: { width: LOGO_W, height: LOGO_H, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    })
      .png()
      .toBuffer()
    const expected = `data:image/png;base64,${png.toString('base64')}`
    mockFetch.mockResolvedValue({
      body: new Blob([new Uint8Array(png)]),
      contentType: 'image/png',
      contentLength: png.byteLength,
      source: 'r2',
    } as never)

    const resolved = await resolvePdfLogo('/storage/logos/1b038660-0000-4000-8000-000000000000/logo.png')

    expect(resolved).toBe(expected)
    expect(embeddedImageCount(await renderRealPdf(resolved))).toBeGreaterThanOrEqual(1)
  })

  it('downscales an oversized logo instead of embedding megapixels in every page', async () => {
    serveWebp(await makeWebp({ alpha: true, width: 2000, height: 1000 }))

    const resolved = await resolvePdfLogo(LOGO_PATH)
    const meta = await sharp(Buffer.from(resolved!.split(',')[1], 'base64')).metadata()

    expect(meta.width).toBe(320)
    expect(meta.height).toBe(160)
    expect(embeddedImageCount(await renderRealPdf(resolved))).toBeGreaterThanOrEqual(1)
  })
})

describe('PDF-LOGO-01 — failure never costs the user the document', () => {
  it('returns null when the object is missing', async () => {
    mockFetch.mockResolvedValue(null as never)
    expect(await resolvePdfLogo(LOGO_PATH)).toBeNull()
  })

  it('returns null when the storage reader throws', async () => {
    mockFetch.mockRejectedValue(new Error('R2 exploded'))
    expect(await resolvePdfLogo(LOGO_PATH)).toBeNull()
  })

  it('returns null when the stored bytes are not a decodable image', async () => {
    const junk = Buffer.from('this is not an image at all, not even close')
    mockFetch.mockResolvedValue({
      body: new Blob([new Uint8Array(junk)]),
      contentType: 'image/webp',
      contentLength: junk.byteLength,
      source: 'r2',
    } as never)

    expect(await resolvePdfLogo(LOGO_PATH)).toBeNull()
  })

  it('null/undefined/empty in -> null out', async () => {
    expect(await resolvePdfLogo(null)).toBeNull()
    expect(await resolvePdfLogo(undefined)).toBeNull()
    expect(await resolvePdfLogo('')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('the PDF still renders, logo-less, when resolution fails', async () => {
    mockFetch.mockRejectedValue(new Error('R2 exploded'))
    const resolved = await resolvePdfLogo(LOGO_PATH)

    const pdf = await renderRealPdf(resolved)

    expect(pdf.length).toBeGreaterThan(0)
    expect(embeddedImageCount(pdf)).toBe(0)
  })
})

describe('PDF-LOGO-01 — the measurement desync', () => {
  const base = {
    name: 'Acme',
    phone: null,
    email: null,
    website: null,
    address: null,
    city: null,
    state: null,
    zip: null,
  }

  it('a WebP data URI no longer buys 64-72pt of blank reserved header', () => {
    const withWebp = { ...base, logo_url: 'data:image/webp;base64,AAAA' }
    const withNone = { ...base, logo_url: null }

    for (const templateId of ['classic', 'modern'] as EstimateTemplateId[]) {
      expect(measureHeaderHeightPt(withWebp, templateId)).toBe(
        measureHeaderHeightPt(withNone, templateId)
      )
    }
  })

  it('a legacy absolute *.supabase.co WebP URL is charged nothing either', () => {
    const legacy = {
      ...base,
      logo_url: 'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/co-1/logo.webp',
    }
    expect(measureHeaderHeightPt(legacy, 'classic')).toBe(
      measureHeaderHeightPt({ ...base, logo_url: null }, 'classic')
    )
  })

  it('a logo that WILL be drawn is still charged (the fix does not just delete the reservation)', () => {
    const drawn = { ...base, logo_url: 'data:image/png;base64,AAAA' }
    // Classic: styles.headerRight.gap 6 + styles.logo.height 72.
    expect(measureHeaderHeightPt(drawn, 'classic')).toBeGreaterThan(
      measureHeaderHeightPt({ ...base, logo_url: null }, 'classic')
    )
  })

  it('MEASURE/RENDER PARITY: the raw same-origin path and its resolved data URI measure IDENTICALLY', async () => {
    // This is what keeps the client paginated preview (raw path) and the PDF
    // renderer (resolved data URI) computing the same page breaks.
    serveWebp(await makeWebp({ alpha: true }))
    const resolved = await resolvePdfLogo(LOGO_PATH)

    for (const templateId of ['classic', 'modern'] as EstimateTemplateId[]) {
      expect(measureHeaderHeightPt({ ...base, logo_url: LOGO_PATH }, templateId)).toBe(
        measureHeaderHeightPt({ ...base, logo_url: resolved }, templateId)
      )
    }
  })
})
