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
//  - infogrid-* (2026-10-02): the info grid used to be charged a FIXED 5 lines. A 40-word project name
//    (7-8 wrapped lines) or a 40-word client address (8+ lines) overflowed page 1 into an extra page
//    the plan did not know about (OLD plan = 1 page, real = 2; each case was run against the old fixed
//    formula to prove it). blocksFromModel now measures every line of both columns.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildPagesForFixture } from './_pages-for-fixture'
import regressions from './fixtures/pagination-fuzz-regressions.json'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'

async function img(w: number, h: number, c: string, f: 'png' | 'jpeg') {
  const b = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/></svg>`))[f]().toBuffer()
  return `data:image/${f};base64,${b.toString('base64')}`
}
const PROJECT_TYPE = 'Remodeling'
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
        // The info grid is measured line by line — plan with the SAME project / client the render draws.
        projectName: c.projectName,
        projectType: PROJECT_TYPE,
        client: c.client,
      })
      const Comp = c.tid === 'classic' ? EstimatePDF : EstimatePDFModern
      const buf = Buffer.from(
        await renderToBuffer(
          createElement(Comp as typeof EstimatePDF, {
            estimate: c.estimate,
            company,
            client: c.client,
            projectName: c.projectName,
            projectType: PROJECT_TYPE,
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

// A short estimate must NOT be split across two pages by the safety reserve: ONE item, discount 10% + tax
// 8.25% + 30% deposit, no summary/terms, project "Test". The model is exact for it (predicted page-1 usage ==
// real, Modern 520.19pt of 551.85), so the plan is 1 page and the real render is 1 page.
describe('a short one-item estimate prints on exactly ONE page (engine pages == real pages == 1)', () => {
  const section = {
    id: 's0',
    estimate_id: 'e',
    company_id: 'c',
    title: 'Labor',
    sort_order: 1,
    subtotal: 100,
    items: [
      { id: 'i0', section_id: 's0', company_id: 'c', description: 'Install fixture', quantity: 1, unit: 'ea', unit_price: 100, total: 100, sort_order: 1, price_source: null },
    ],
  }
  const tax = Math.round(90 * 0.0825 * 100) / 100
  const total = Math.round((100 - 10 + tax) * 100) / 100
  const estimate = buildFixtureEstimate({
    sections: [section],
    subtotal: 100,
    total,
    discount_type: 'percentage',
    discount_value: 10,
    discount_amount: 10,
    tax_rate: 0.0825,
    tax_amount: tax,
    deposit_type: 'percent',
    deposit_value: 30,
    balance_due: Math.round(total * 0.7 * 100) / 100,
    summary: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    notes: null,
  })
  const typicalClient = {
    name: 'Michael Thompson',
    email: 'm.thompson@email.com',
    phone: '+15125550199',
    address: '4821 Oak Hollow Dr',
    city: 'Austin',
    state: 'TX',
    zip: '78745',
  }
  const cases: { name: string; tid: 'classic' | 'modern'; client: typeof typicalClient | null; logo: boolean }[] = [
    { name: 'Classic, no client', tid: 'classic', client: null, logo: false },
    { name: 'Classic, typical client', tid: 'classic', client: typicalClient, logo: false },
    { name: 'Classic, typical client + logo', tid: 'classic', client: typicalClient, logo: true },
    { name: 'Modern, no client', tid: 'modern', client: null, logo: false },
    { name: 'Modern, no client + logo', tid: 'modern', client: null, logo: true },
  ]
  for (const c of cases) {
    it(c.name, async () => {
      const company = { ...FIXTURE_COMPANY, logo_url: c.logo ? await img(300, 200, '#0f766e', 'png') : null }
      const pages = buildPagesForFixture(estimate, company, c.tid, { projectName: 'Test', client: c.client })
      expect(pages).toHaveLength(1)
      const Comp = c.tid === 'classic' ? EstimatePDF : EstimatePDFModern
      const buf = Buffer.from(
        await renderToBuffer(
          createElement(Comp as typeof EstimatePDF, {
            estimate,
            company,
            client: c.client,
            projectName: 'Test',
            projectType: null,
            language: 'en',
            pages,
          } as never) as never
        )
      )
      expect(countPages(buf)).toBe(1)
    }, 60000)
  }
})
