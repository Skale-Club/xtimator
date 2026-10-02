// @vitest-environment node
// tests/unit/pdf/estimate-pdf-pagination-regressions.test.tsx
//
// Real-render regressions found by a randomized engine-vs-renderer fuzz (random
// sections/items/terms/photos/captions/languages/clients, both templates): the
// engine's predicted page count must equal the real PDF's /Type /Page count.
// Inputs live in fixtures/pagination-fuzz-regressions.json (image bytes are
// regenerated here with sharp — only their presence matters).
//
//  - seed7-case59 (Modern, en) and seed99-case6 (Modern, es): 8-9 photos whose
//    captions WRAP to 2-4 lines inside the tile; the photo-row height charged
//    only a single caption line, so the last page overflowed into an extra page.
//    blocksFromModel now measures every caption at the tile width and the row
//    takes the tallest (PageBlock.parallelMeasurements).
//  - seed4242-case38 (Classic, pt), seed8675309-case2 (Modern, en), seed123-case70 (Classic + Modern, es):
//    an 82-char company name. In the page-1 header the name WRAPS to 2+ lines in the left column
//    (right column = logo / language chip), but measureHeaderHeightPt charged ONE line; page 1 then
//    overflowed by a line or two, react-pdf split the (fixed) header onto an extra page 2, and every
//    later page shifted by one. The header's name / contact / address are now measured at the
//    left-column width (lib/pdf/measure-header-height.ts; the photos in these cases were a red herring).
//  - seed7-case83 (Classic, pt): the committed pre-fix model failed it — a totals
//    block with discount + tax + deposit (charged 84.5pt vs a real 161.9pt) plus a
//    signature and several terms cards on the same pages; the flat 89pt margin was
//    the only thing absorbing those uncharged text lines.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildPagesForFixture } from './_pages-for-fixture'
import regressions from './fixtures/pagination-fuzz-regressions.json'

async function img(w: number, h: number, c: string, f: 'png' | 'jpeg') {
  const b = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/></svg>`))[f]().toBuffer()
  return `data:image/${f};base64,${b.toString('base64')}`
}
const countPages = (buf: Buffer) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe('engine page count == real PDF page count (fuzz regressions)', () => {
  for (const [name, c] of Object.entries(regressions as Record<string, any>)) {
    it(name, async () => {
      const logo = c.company.logo_url ? await img(300, 200, '#0f766e', 'png') : null
      const photo = await img(800, 600, '#64748b', 'jpeg')
      const signature = c.signature
        ? { signerName: 'Michael Thompson', signedAt: '2026-09-30', signatureDataUrl: await img(400, 120, '#111111', 'png') }
        : null
      const company = { ...c.company, logo_url: logo }
      const attachedPhotos = (c.photos as (string | null)[]).map((caption) => ({ url: photo, caption }))
      const pages = buildPagesForFixture(c.estimate, company, c.tid, {
        attachedPhotos,
        signature,
        preparedBy: c.preparedBy,
        language: c.language,
      })
      const Comp = c.tid === 'classic' ? EstimatePDF : EstimatePDFModern
      const buf = Buffer.from(
        await renderToBuffer(
          createElement(Comp as typeof EstimatePDF, {
            estimate: c.estimate,
            company,
            client: c.client,
            projectName: c.projectName,
            projectType: 'Remodeling',
            language: c.language,
            preparedBy: c.preparedBy,
            attachedPhotos,
            signature,
            pages,
          }) as never
        )
      )
      expect(countPages(buf)).toBe(pages.length)
    }, 60000)
  }
})
