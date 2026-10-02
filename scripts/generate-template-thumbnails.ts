/**
 * Estimate-template picker thumbnails (Settings > Company > Estimate Design).
 *
 * Renders page 1 of a neutral demo estimate through the REAL PDF pipeline
 * (blocksFromModel -> computePageBreaks -> @react-pdf/renderer, with the same
 * computeEstimatePageConstraints the production renderer uses), rasterizes it
 * with `pdftoppm`, and writes one WebP per template:
 *
 *   public/estimate-templates/classic.webp
 *   public/estimate-templates/modern.webp
 *
 * The images are NOT hand-drawn mock-ups, so they cannot drift from the real
 * templates in style - only go stale until this script is re-run.
 *
 * Regenerate:   npx --yes tsx scripts/generate-template-thumbnails.ts
 *
 * RE-RUN AFTER changing either PDF template (components/pdf/estimate-pdf.tsx,
 * components/pdf/estimate-pdf-modern.tsx, components/pdf/shared/**), the design
 * tokens (lib/estimate/document/tokens.ts), the document labels, or
 * SYSTEM_COLORS.primary - then commit the two updated .webp files.
 *
 * Requirements: `pdftoppm` (poppler-utils) on PATH; `sharp` (a project dep).
 *
 * Import resolution: tsx honours tsconfig.json `paths`, so the project's own
 * '@/...' aliases (used inside the PDF components) resolve. This script itself
 * uses relative imports, like scripts/pagination-render-calibration.ts.
 *
 * `lib/estimate/pagination/measure/estimator.ts` starts with
 * `import 'server-only'`, which throws outside a React Server Components
 * build. This standalone script stubs that marker module (below) and loads the
 * estimator with a dynamic import, so the REAL fontkit measurement provider is
 * used - no duplicated copy of it.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'
import { SYSTEM_COLORS } from '../lib/system-colors'
import { LABELS as PDF_LABELS } from '../lib/estimate/document/labels'
import { blocksFromModel } from '../lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '../lib/estimate/pagination/engine'
import { computeEstimatePageConstraints } from '../lib/estimate/pagination/page-constraints'
import { deriveDepositDisplay } from '../lib/estimate/deposit-display'
import { resolvePresentationSettings } from '../lib/estimate/presentation-settings'
import type { EstimateTemplateId } from '../lib/estimate/templates/registry'

const OUT_DIR = path.resolve(__dirname, '../public/estimate-templates')
const RASTER_DPI = 100
const THUMB_WIDTH_PX = 480
const WEBP_QUALITY = 80
const MAX_BYTES = 60 * 1024

// Stub the `server-only` marker BEFORE anything imports the estimator.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moduleAny = Module as any
const originalLoad = moduleAny._load
moduleAny._load = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, ...rest)
}

const DEMO_COMPANY = {
  name: 'Your Company',
  owner_name: null as string | null,
  phone: '+15125550123',
  email: 'hello@yourcompany.com',
  website: null as string | null,
  address: '123 Main Street',
  city: 'Anytown',
  state: 'CA',
  zip: '90210',
  logo_url: null as string | null,
  brand_primary_color: SYSTEM_COLORS.primary as string,
  estimate_terms_enabled: false,
  estimate_terms_text: null as string | null,
}

const DEMO_CLIENT = {
  name: 'Jordan Smith',
  email: 'jordan.smith@example.com',
  phone: '+15125550187',
  address: null as string | null,
  city: null as string | null,
  state: null as string | null,
  zip: null as string | null,
}

const DEMO_PROJECT_NAME = 'Kitchen Remodel'

function item(sectionId: string, i: number, description: string, quantity: number, unit: string, unitPrice: number) {
  return {
    id: `${sectionId}-item-${i}`,
    section_id: sectionId,
    company_id: 'demo-co',
    description,
    quantity,
    unit,
    unit_price: unitPrice,
    total: quantity * unitPrice,
    sort_order: i + 1,
    price_source: null,
  }
}

function buildDemoEstimate(): Record<string, unknown> {
  // ONE section: page 1 of both templates has a tall banner + totals block, so
  // a second section (or a terms card) pushes the totals onto page 2 (the
  // thumbnail must show page 1 WITH totals). Verified by the page-count check in renderPdf().
  const scope = [
    item('sec-1', 0, 'Supply and install new fixtures', 4, 'ea', 320),
    item('sec-1', 1, 'Final cleanup and walkthrough', 1, 'ea', 250),
  ]
  const sum = (items: { total: number }[]) => items.reduce((s, it) => s + it.total, 0)
  const sections = [
    { id: 'sec-1', estimate_id: 'demo-est', company_id: 'demo-co', title: 'Fixture Replacement', sort_order: 1, subtotal: sum(scope), items: scope },
  ]
  const subtotal = sum(scope)
  const taxRate = 0.08
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100
  const total = subtotal + taxAmount
  return {
    id: 'demo-est',
    project_id: 'demo-proj',
    company_id: 'demo-co',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: '2026-01-15',
    is_current: true,
    share_token: 'demo-share-token',
    public_slug_token: null,
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    subtotal,
    total,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    presentation_settings: null,
    attachedPhotos: [],
    sections,
  }
}

async function renderPdf(templateId: EstimateTemplateId): Promise<Buffer> {
  // Dynamic imports: the stub above must be installed before these load.
  const { createFontkitMeasurementProvider } = await import('../lib/estimate/pagination/measure/estimator')
  const { default: EstimatePDF } = await import('../components/pdf/estimate-pdf')
  const { default: EstimatePDFModern } = await import('../components/pdf/estimate-pdf-modern')
  const component = templateId === 'modern' ? EstimatePDFModern : EstimatePDF

  const estimate = buildDemoEstimate()
  const provider = createFontkitMeasurementProvider()
  const constraints = computeEstimatePageConstraints(DEMO_COMPANY, templateId, 'en', provider)
  const blocks = blocksFromModel({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sections: estimate.sections as any,
    summary: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    notes: null,
    company: DEMO_COMPANY,
    discount_amount: 0,
    tax_amount: estimate.tax_amount as number,
    dep: deriveDepositDisplay({
      total: estimate.total as number,
      deposit_type: 'none',
      deposit_value: null,
      balance_due: null,
    }),
    signature: null,
    photos: [],
    resolvedSettings: resolvePresentationSettings(null),
    preparedBy: null,
    L: PDF_LABELS.en,
    templateId,
    // The SAME project/client/estimate the element below renders with.
    infoGrid: {
      projectName: DEMO_PROJECT_NAME,
      projectType: null,
      client: DEMO_CLIENT,
      estimate: {
        estimate_date: (estimate.estimate_date as string | null) ?? null,
        created_at: estimate.created_at as string,
        estimate_number: (estimate.estimate_number as string | null) ?? null,
        estimate_seq: estimate.estimate_seq as number,
      },
      language: 'en',
    },
  })
  const pages = computePageBreaks(blocks, constraints, provider)
  if (pages.length !== 1) {
    console.warn(`  ! ${templateId}: demo estimate spans ${pages.length} pages (expected 1); page 1 is still used`)
  }

  const element = createElement(component, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    company: DEMO_COMPANY,
    client: DEMO_CLIENT,
    projectName: DEMO_PROJECT_NAME,
    projectType: null,
    language: 'en',
    preparedBy: null,
    attachedPhotos: [],
    signature: null,
    pages,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await renderToBuffer(element as any))
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'tpl-thumbs-'))
  try {
    for (const templateId of ['classic', 'modern'] as const) {
      const pdf = await renderPdf(templateId)
      const pdfPath = path.join(tmp, `${templateId}.pdf`)
      writeFileSync(pdfPath, pdf)
      const pngBase = path.join(tmp, templateId)
      execFileSync('pdftoppm', ['-r', String(RASTER_DPI), '-png', '-f', '1', '-l', '1', '-singlefile', pdfPath, pngBase])
      const webp = await sharp(readFileSync(`${pngBase}.png`))
        .resize({ width: THUMB_WIDTH_PX })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
      const outPath = path.join(OUT_DIR, `${templateId}.webp`)
      writeFileSync(outPath, webp)
      const meta = await sharp(webp).metadata()
      console.log(`${templateId}: ${meta.width}x${meta.height}, ${(webp.length / 1024).toFixed(1)} KB -> ${path.relative(process.cwd(), outPath)}`)
      if (webp.length > MAX_BYTES) {
        throw new Error(`${templateId}.webp is ${webp.length} bytes (> ${MAX_BYTES}); lower WEBP_QUALITY/THUMB_WIDTH_PX`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
