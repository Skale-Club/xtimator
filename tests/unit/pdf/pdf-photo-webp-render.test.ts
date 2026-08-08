// @vitest-environment node
//
// PDF-PHOTO-01 — the END-TO-END proof that stored WebP job-site photos actually
// appear in a generated estimate PDF.
//
// WHY THIS FILE RENDERS REAL PDFs AND SERVES REAL HTTP: the photo bug had a
// DIFFERENT mechanism from PDF-LOGO-01's. Photos never became a data URI at all
// — `renderEstimatePdf` minted a short-lived SIGNED REMOTE URL and let react-pdf
// fetch it, so the failure lived inside `@react-pdf/image`'s `resolveImageFromUrl`,
// which sniffs the fetched bytes with a format check that knows only JPEG and
// PNG. Every intermediate signal was healthy: a valid signed URL, a reachable
// object, `renderToBuffer` resolving without throwing, and `blocksFromModel`
// dutifully reserving 150pt+ per photo row. A test asserting "a data URI was
// produced" would pass while the customer's PDF showed a blank grid. So this
// file asserts on the PDF BYTES, and the negative control below drives react-pdf
// over a real loopback HTTP server so it exercises the exact remote-fetch path
// production used.
//
// `node` environment: sharp is a native binding, lib/pdf/register-fonts.ts reads
// real files off disk, and the negative control binds a loopback socket.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer, Document, Page, Image, View } from '@react-pdf/renderer'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'

import { resolvePdfPhotos, PHOTO_CELL_EDGE_PX } from '@/lib/pdf/resolve-pdf-photos'
import { willPdfRenderPhoto, drawablePdfPhotos } from '@/lib/pdf/pdf-image-support'
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { LABELS } from '@/lib/estimate/document/labels'
import type { StorageProvider } from '@/lib/storage'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

// --- fixtures -------------------------------------------------------------

/**
 * Photo-LIKE bytes: incompressible noise, DISTINCT per seed. Both properties are
 * load-bearing.
 *   - distinct, because react-pdf de-duplicates identical `src` values into ONE
 *     image XObject — six copies of the same photo would embed once and make an
 *     exact-count assertion meaningless.
 *   - noise, because a flat-colour test image compresses to ~1 kB and would make
 *     the "does not balloon" bound pass no matter what. Noise is the WORST case
 *     for JPEG, so the byte bounds below are conservative against real photos.
 */
function noisyWebp(seed: number, width = 1600, height = 1200): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  let s = (seed * 2654435761) >>> 0
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    raw[i] = (s >>> 16) & 0xff
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).webp({ quality: 80 }).toBuffer()
}

/** Exactly what the `photos` bucket holds today (lib/actions/photo.ts). */
function storageServing(objects: Record<string, Buffer>): StorageProvider {
  return {
    async download(bucket: string, path: string) {
      expect(bucket).toBe('photos')
      const bytes = objects[path]
      if (!bytes) throw new Error(`no such object: ${path}`)
      return new Blob([new Uint8Array(bytes)])
    },
  } as unknown as StorageProvider
}

function imageXObjects(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length
}

function pdfContains(pdf: Buffer, needle: string): boolean {
  return pdf.toString('latin1').includes(needle)
}

/** A REAL full-template PDF (registered fonts, real pagination pipeline). */
async function renderRealPdf(
  photos: { url: string; caption: string | null }[],
  templateId: EstimateTemplateId = 'classic'
): Promise<Buffer> {
  const estimate = buildFixtureEstimate({})
  // logo_url null: the ONLY images in this document are the photos, so an exact
  // XObject count is a statement about photos and nothing else.
  const company = { ...FIXTURE_COMPANY, logo_url: null }
  const pages = buildPagesForFixture(estimate, company, templateId, {
    signature: null,
    attachedPhotos: photos,
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
    attachedPhotos: photos,
    pages,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await renderToBuffer(element as any))
}

// --- the negative control: the exact production mechanism -----------------

describe('PDF-PHOTO-01 — the negative control: react-pdf genuinely cannot draw a WebP fetched from a signed URL', () => {
  let server: http.Server
  let base: string
  let webp: Buffer
  let jpeg: Buffer

  beforeAll(async () => {
    webp = await noisyWebp(1, 400, 300)
    jpeg = await sharp(webp).jpeg({ quality: 85 }).toBuffer()
    server = http.createServer((req, res) => {
      if ((req.url ?? '').startsWith('/photo.webp')) {
        res.writeHead(200, { 'content-type': 'image/webp', 'content-length': webp.length })
        res.end(webp)
      } else if ((req.url ?? '').startsWith('/photo.jpg')) {
        res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': jpeg.length })
        res.end(jpeg)
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function renderBareImage(src: string): Promise<Buffer> {
    const element = createElement(
      Document,
      null,
      createElement(
        Page,
        { size: 'LETTER' as const },
        createElement(View, null, createElement(Image, { src, style: { width: 150, height: 150 } }))
      )
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Buffer.from(await renderToBuffer(element as any))
  }

  it('a signed remote URL to a WebP embeds NO image, and does not throw', async () => {
    // Query string included: a signed storage URL always carries one, and it is
    // what makes an extension-only guess unreliable.
    const pdf = await renderBareImage(`${base}/photo.webp?token=abc&X-Amz-Expires=3600`)

    // A document IS produced — @react-pdf/layout's fetchImage catches the
    // decoder error and warns. That silence is exactly why this shipped.
    expect(pdf.length).toBeGreaterThan(0)
    expect(imageXObjects(pdf)).toBe(0)
  })

  it('the SAME bytes served as JPEG DO embed — so the failure is the format, nothing else', async () => {
    const pdf = await renderBareImage(`${base}/photo.jpg?token=abc&X-Amz-Expires=3600`)

    expect(imageXObjects(pdf)).toBe(1)
    expect(pdfContains(pdf, '/Width 400')).toBe(true)
  })
})

// --- the payoff -----------------------------------------------------------

describe('PDF-PHOTO-01 — stored WebP photos now render in a real estimate PDF', () => {
  it('resolvePdfPhotos turns stored WebP into JPEG data URIs cropped to the grid cell', async () => {
    const objects = { 'co/proj/a.webp': await noisyWebp(1), 'co/proj/b.webp': await noisyWebp(2) }

    const resolved = await resolvePdfPhotos(
      [
        { storage_path: 'co/proj/a.webp', caption: 'Before' },
        { storage_path: 'co/proj/b.webp', caption: null },
      ],
      storageServing(objects)
    )

    expect(resolved).toHaveLength(2)
    expect(resolved.map((p) => p.caption)).toEqual(['Before', null])
    for (const photo of resolved) {
      expect(photo.url).toMatch(/^data:image\/jpeg;base64,/)
      expect(willPdfRenderPhoto(photo)).toBe(true)
      const meta = await sharp(Buffer.from(photo.url.split(',')[1], 'base64')).metadata()
      // Square, at the grid's own tile size — NOT the 1600x1200 source.
      expect(meta.width).toBe(PHOTO_CELL_EDGE_PX)
      expect(meta.height).toBe(PHOTO_CELL_EDGE_PX)
    }
  })

  it.each<EstimateTemplateId>(['classic', 'modern'])(
    'THE PAYOFF (%s): every photo is a real image XObject in the produced PDF, at the cell size',
    async (templateId) => {
      const objects: Record<string, Buffer> = {}
      const stored: { storage_path: string; caption: string | null }[] = []
      for (let i = 0; i < 6; i++) {
        const key = `co/proj/${i}.webp`
        objects[key] = await noisyWebp(i + 10)
        stored.push({ storage_path: key, caption: i === 0 ? 'Kitchen, north wall' : null })
      }

      const photos = await resolvePdfPhotos(stored, storageServing(objects))
      expect(photos).toHaveLength(6)

      const pdf = await renderRealPdf(photos, templateId)

      // EXACT, not >=: the sources are distinct so react-pdf cannot dedupe them,
      // the logo is null, and JPEG carries no alpha (so no /SMask companion).
      expect(imageXObjects(pdf)).toBe(6)
      expect(pdfContains(pdf, `/Width ${PHOTO_CELL_EDGE_PX}`)).toBe(true)
      expect(pdfContains(pdf, `/Height ${PHOTO_CELL_EDGE_PX}`)).toBe(true)

      // Sensitivity: the SAME document, same fixture, photos removed -> zero.
      // Without this the assertion above could be passing on some other image.
      expect(imageXObjects(await renderRealPdf([], templateId))).toBe(0)
    }
  )

  it('the SAME estimate with the RAW signed WebP URLs embeds nothing — the resolver is what fixes it', async () => {
    // This is production before the fix, reconstructed exactly: the array
    // renderEstimatePdf used to build from storage.getSignedUrl('photos', ...).
    const raw = Array.from({ length: 6 }, (_, i) => ({
      url: `https://storage.example.test/photos/co/proj/${i}.webp?token=abc`,
      caption: null,
    }))

    const pdf = await renderRealPdf(raw)

    expect(imageXObjects(pdf)).toBe(0)
    // ...and the desync this fix is about: the layout DID charge for them.
    expect(raw.every((p) => willPdfRenderPhoto(p))).toBe(true)
  })

  it('does not balloon the PDF: 6 photos stay far under the full-resolution cost', async () => {
    const objects: Record<string, Buffer> = {}
    const stored: { storage_path: string; caption: string | null }[] = []
    for (let i = 0; i < 6; i++) {
      const key = `co/proj/${i}.webp`
      objects[key] = await noisyWebp(i + 100)
      stored.push({ storage_path: key, caption: null })
    }

    const photos = await resolvePdfPhotos(stored, storageServing(objects))
    const pdf = await renderRealPdf(photos)

    // Measured ~370 kB for six NOISE tiles (the worst case JPEG has); a real
    // job-site photo is a third of that. A regression that stops downscaling —
    // or that switches the photo branch to PNG — blows straight through this.
    expect(pdf.length).toBeLessThan(900_000)

    // The bound is only meaningful if it is sensitive: the same six sources,
    // inlined at full resolution, must FAIL it. (Measured ~8.9 MB.)
    const fullRes = await Promise.all(
      stored.map(async (photo) => ({
        url: `data:image/jpeg;base64,${(await sharp(objects[photo.storage_path]).jpeg({ quality: 90 }).toBuffer()).toString('base64')}`,
        caption: null,
      }))
    )
    const bloated = await renderRealPdf(fullRes)
    expect(bloated.length).toBeGreaterThan(900_000)
    expect(bloated.length / pdf.length).toBeGreaterThan(5)
  })

  it('an already-JPEG stored photo is still normalised to the cell size (no free pass for big JPEGs)', async () => {
    const jpeg = await sharp(await noisyWebp(7, 2400, 1800)).jpeg({ quality: 90 }).toBuffer()

    const [photo] = await resolvePdfPhotos(
      [{ storage_path: 'co/proj/big.jpg', caption: null }],
      storageServing({ 'co/proj/big.jpg': jpeg })
    )

    const meta = await sharp(Buffer.from(photo.url.split(',')[1], 'base64')).metadata()
    expect(meta.width).toBe(PHOTO_CELL_EDGE_PX)
    expect(imageXObjects(await renderRealPdf([photo]))).toBe(1)
  })

  it('never enlarges a photo smaller than the cell', async () => {
    const [photo] = await resolvePdfPhotos(
      [{ storage_path: 'co/proj/tiny.webp', caption: null }],
      storageServing({ 'co/proj/tiny.webp': await noisyWebp(8, 120, 90) })
    )

    const meta = await sharp(Buffer.from(photo.url.split(',')[1], 'base64')).metadata()
    expect(meta.width).toBe(90)
    expect(meta.height).toBe(90)
  })
})

// --- failure never costs the user the document ----------------------------

describe('PDF-PHOTO-01 — a broken photo never costs the user the document', () => {
  it('drops the unreadable photo and keeps the rest, in order', async () => {
    const objects = {
      'co/proj/ok1.webp': await noisyWebp(21),
      'co/proj/ok2.webp': await noisyWebp(22),
    }

    const resolved = await resolvePdfPhotos(
      [
        { storage_path: 'co/proj/ok1.webp', caption: 'first' },
        { storage_path: 'co/proj/missing.webp', caption: 'gone' },
        { storage_path: 'co/proj/ok2.webp', caption: 'last' },
      ],
      storageServing(objects)
    )

    expect(resolved.map((p) => p.caption)).toEqual(['first', 'last'])
    expect(imageXObjects(await renderRealPdf(resolved))).toBe(2)
  })

  it('drops a photo whose bytes are not a decodable image', async () => {
    const junk = Buffer.from('this is not an image at all, not even close')

    const resolved = await resolvePdfPhotos(
      [{ storage_path: 'co/proj/junk.webp', caption: null }],
      storageServing({ 'co/proj/junk.webp': junk })
    )

    expect(resolved).toEqual([])
  })

  it('a storage provider that throws for EVERY photo still yields a rendered document', async () => {
    const exploding = {
      async download() {
        throw new Error('R2 exploded')
      },
    } as unknown as StorageProvider

    const resolved = await resolvePdfPhotos(
      [
        { storage_path: 'a.webp', caption: null },
        { storage_path: 'b.webp', caption: null },
      ],
      exploding
    )
    expect(resolved).toEqual([])

    const pdf = await renderRealPdf(resolved)
    expect(pdf.length).toBeGreaterThan(0)
    expect(imageXObjects(pdf)).toBe(0)
  })

  it('empty in -> empty out, with no storage call at all', async () => {
    let calls = 0
    const counting = {
      async download() {
        calls++
        return new Blob([])
      },
    } as unknown as StorageProvider

    expect(await resolvePdfPhotos([], counting)).toEqual([])
    expect(calls).toBe(0)
  })
})

// --- the measurement desync ----------------------------------------------

describe('PDF-PHOTO-01 — the measurement desync', () => {
  function photoRows(photos: { url: string; caption: string | null; storage_path?: string | null }[]) {
    return blocksFromModel({
      sections: [],
      summary: null,
      timeline: null,
      payment_terms: null,
      warranty_terms: null,
      notes: null,
      company: {},
      discount_amount: 0,
      tax_amount: 0,
      dep: deriveDepositDisplay({ total: 100, deposit_type: null, deposit_value: null, balance_due: null }),
      signature: null,
      photos,
      resolvedSettings: resolvePresentationSettings(undefined),
      preparedBy: null,
      L: LABELS.en,
      templateId: 'classic',
    }).filter((b) => b.kind === 'photo-row')
  }

  it('an un-transcoded WebP data URI buys NO page budget', () => {
    expect(photoRows([{ url: 'data:image/webp;base64,AAAA', caption: null }])).toHaveLength(0)
  })

  it('a photo with no source at all buys NO page budget', () => {
    expect(photoRows([{ url: '', caption: null }])).toHaveLength(0)
  })

  it('a transcoded JPEG data URI IS charged (the fix does not just delete the reservation)', () => {
    expect(photoRows([{ url: 'data:image/jpeg;base64,AAAA', caption: null }])).toHaveLength(1)
  })

  it('MEASURE/RENDER PARITY: the web preview shape (storage_path, no url) is charged too', () => {
    // components/workspace/estimate/use-paginated-preview.ts measures BEFORE any
    // signed URL exists. Charging nothing here would silently delete every photo
    // row from the paginated preview while the PDF still drew them.
    expect(photoRows([{ url: '', caption: null, storage_path: 'co/proj/a.webp' }])).toHaveLength(1)
  })

  it('a signed remote .webp URL IS charged — the PDF resolver transcodes it, unlike a logo', () => {
    expect(
      photoRows([{ url: 'https://storage.example.test/photos/a.webp?token=x', caption: null }])
    ).toHaveLength(1)
  })

  it('SHARED INDEX DOMAIN: measurement and the render slice filter the same array identically', () => {
    // photoRange is a pair of INDEXES. If measurement filtered and the renderer
    // sliced the unfiltered array, the wrong photos would be drawn — worse than
    // the blank grid this fix removes.
    const mixed = [
      { url: 'data:image/webp;base64,AAAA', caption: 'undrawable' },
      { url: 'data:image/jpeg;base64,AAAA', caption: 'first drawn' },
      { url: 'data:image/jpeg;base64,BBBB', caption: 'second drawn' },
    ]
    const rows = photoRows(mixed)
    expect(rows).toHaveLength(1)

    const range = rows[0].ref?.photoRange
    expect(range).toBeDefined()
    expect(drawablePdfPhotos(mixed).slice(range![0], range![1]).map((p) => p.caption)).toEqual([
      'first drawn',
      'second drawn',
    ])
  })
})
