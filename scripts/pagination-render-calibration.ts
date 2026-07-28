/**
 * Plan 184-05 (PGBRK-01/03/04) — PDF-render safety-margin calibration.
 *
 * Quantifies the residual drift between:
 *   (a) blocksFromModel()'s computed page count (computePageBreaks(), fed by
 *       the real fontkit-based measurement provider), and
 *   (b) the REAL @react-pdf/renderer (Yoga layout + @react-pdf/pdfkit)
 *       rendered PDF's actual page count (real /Type /Page object count).
 *
 * Distinct from scripts/pagination-drift-spike.ts (Plan 184-01), which
 * measured fontkit vs a REAL CHROMIUM DOM for the unrelated FUTURE web
 * preview (Phase 185) — THIS script measures fontkit-driven height
 * estimates vs react-pdf's OWN internal PDFKit/Yoga layout, the actual
 * rendering path THIS PDF renderer uses. Per-line text measurement itself
 * was independently verified byte-identical against
 * `@react-pdf/pdfkit`'s own `heightOfString()`/`currentLineHeight()` across
 * Inter/Inter-Bold/Lora/Lora-Bold at multiple widths/font sizes (zero
 * drift) — so this script's ONLY job is to bound the residual, cumulative
 * per-page drift that additive box-model height formulas (Plan 184-03)
 * inevitably accrue against Yoga's real flexbox layout.
 *
 * Method: build 3 fixture families per template (a single-section sweep of
 * 1..60 items, a 4-section/40-item multi-page fixture, and a content-rich
 * single-page-ish baseline fixture with summary/2-terms-cards/discount/tax/
 * deposit), sweep a range of candidate extra safety-margin values, and
 * report the SMALLEST candidate that produces ZERO mismatches between the
 * engine's page count and the real rendered PDF's page count, across every
 * fixture, for BOTH templates.
 *
 * Usage:
 *   npx tsx scripts/pagination-render-calibration.ts
 *
 * Output: a console.table of { marginPt, mismatches }, plus per-mismatch
 * detail lines. The verbatim result of the run AFTER the GAP-1 header
 * address-line-count fix (2026-07-28) is cited in
 * lib/pdf/measure-header-height.ts's PDF_RENDER_SAFETY_MARGIN_PT comment —
 * re-run this script and update that comment/constant if any of
 * blocks-from-model.ts / measure-header-height.ts / either template's
 * StyleSheet ever changes.
 */
import path from 'node:path'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
// fontkit ships ONLY named ESM exports (no default) — a namespace import
// mirrors pagination-drift-spike.ts's own convention.
import * as fontkit from 'fontkit'
import LineBreaker from 'linebreak'
import EstimatePDF from '../components/pdf/estimate-pdf'
import EstimatePDFModern from '../components/pdf/estimate-pdf-modern'
import {
  ESTIMATE_DESIGN_TOKENS,
  ESTIMATE_PAGE_GEOMETRY,
  LINE_HEIGHT,
  LETTER_HEIGHT_PT,
} from '../lib/estimate/document/tokens'
import { measureHeaderHeightPt, CONTINUATION_TABLE_HEADER_HEIGHT_PT } from '../lib/pdf/measure-header-height'
import { SAFETY_MARGIN_LINES } from '../lib/estimate/pagination/measure/safety-margin'
import { blocksFromModel } from '../lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '../lib/estimate/pagination/engine'
import type { PageConstraints, PageAssignment } from '../lib/estimate/pagination/types'
import type { MeasurementProvider } from '../lib/estimate/pagination/measure/types'
import { deriveDepositDisplay, type DepositDisplayRow } from '../lib/estimate/deposit-display'
import { resolvePresentationSettings } from '../lib/estimate/presentation-settings'
import { LABELS as PDF_LABELS } from '../lib/estimate/document/labels'
import type { EstimateTemplateId } from '../lib/estimate/templates/registry'

// lib/estimate/pagination/measure/estimator.ts's createFontkitMeasurementProvider()
// carries `import 'server-only'`, which throws when required outside
// Next.js's webpack alias resolution (plain `tsx` execution, not vitest —
// vitest.config.ts aliases 'server-only' to an empty stub, tsx does not).
// This standalone script needs the SAME algorithm without that import guard
// — duplicated here byte-for-byte from estimator.ts, mirroring
// pagination-drift-spike.ts's own embedded estimateLineCount() for the
// identical reason. Keep these two in sync if estimator.ts's algorithm ever
// changes (tests/unit/pagination/measure/estimator.test.ts is the source of
// truth both must match).
const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')
const FONT_FAMILY_TO_PATH: Record<string, string> = {
  Inter: path.join(FONTS_DIR, 'inter', 'Inter-Regular.ttf'),
  'Inter-Bold': path.join(FONTS_DIR, 'inter', 'Inter-Bold.ttf'),
  Lora: path.join(FONTS_DIR, 'lora', 'Lora-Regular.ttf'),
  'Lora-Bold': path.join(FONTS_DIR, 'lora', 'Lora-Bold.ttf'),
}
const fontCache = new Map<string, fontkit.Font>()
function getFont(fontFamily: string): fontkit.Font {
  const cached = fontCache.get(fontFamily)
  if (cached) return cached
  const fontPath = FONT_FAMILY_TO_PATH[fontFamily]
  const opened = fontkit.openSync(fontPath)
  if (!('layout' in opened)) throw new Error(`unexpected font collection at ${fontPath}`)
  fontCache.set(fontFamily, opened)
  return opened
}
function estimateLineCount(text: string, fontFamily: string, fontSizePt: number, maxWidthPt: number): number {
  if (text.length === 0) return 0
  const font = getFont(fontFamily)
  const scale = fontSizePt / font.unitsPerEm
  const breaker = new LineBreaker(text)
  let lineWidthPt = 0
  let lines = 1
  let last = 0
  let bk: { position: number } | null
  while ((bk = breaker.nextBreak())) {
    const chunk = text.slice(last, bk.position)
    const { advanceWidth } = font.layout(chunk)
    const chunkWidthPt = advanceWidth * scale
    if (lineWidthPt + chunkWidthPt > maxWidthPt && lineWidthPt > 0) {
      lines += 1
      lineWidthPt = chunkWidthPt
    } else {
      lineWidthPt += chunkWidthPt
    }
    last = bk.position
  }
  return lines
}
function createLocalFontkitMeasurementProvider(): MeasurementProvider {
  return { lineCount: estimateLineCount }
}

// Self-contained fixture data (this script deliberately does NOT import
// tests/unit/estimate/fixtures/document-fixtures.ts — scripts/ stays
// independent of tests/, mirroring pagination-drift-spike.ts's own
// self-contained style).
const FIXTURE_COMPANY = {
  name: 'Acme Renovations',
  owner_name: 'Jamie Lee',
  phone: '+15125550100',
  email: 'jamie@acme.test',
  website: 'https://acme.test',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  logo_url: null as string | null,
  brand_primary_color: '#2563eb',
}

function baseEstimateFields(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'cal-est-1',
    project_id: 'cal-proj-1',
    company_id: 'cal-co-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'cal-share-tok',
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
    tax_rate: 0,
    tax_amount: 0,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    presentation_settings: null,
    attachedPhotos: [],
    ...overrides,
  }
}

function buildSingleSectionEstimate(n: number): Record<string, unknown> {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    section_id: 'sec-1',
    company_id: 'cal-co-1',
    description: `Line item ${i}: detailed scope of work covering labor and materials for this phase of the project, including site prep and cleanup`,
    quantity: 1,
    unit: 'ea',
    unit_price: 100,
    total: 100,
    sort_order: i + 1,
    price_source: null,
  }))
  return baseEstimateFields({
    subtotal: n * 100,
    total: n * 100,
    sections: [
      { id: 'sec-1', estimate_id: 'cal-est-1', company_id: 'cal-co-1', title: 'Demolition', sort_order: 1, subtotal: n * 100, items },
    ],
  })
}

function buildMultiSectionEstimate(): Record<string, unknown> {
  const sectionTitles = ['Demolition', 'Framing', 'Electrical', 'Finishing']
  const sections = sectionTitles.map((title, sIdx) => {
    const items = Array.from({ length: 10 }, (_, iIdx) => {
      const n = sIdx * 10 + iIdx + 1
      return {
        id: `mp-item-${sIdx}-${iIdx}`,
        section_id: `mp-sec-${sIdx}`,
        company_id: 'cal-co-1',
        description: `Line item ${n}: detailed scope of work covering labor and materials for this phase of the project, including site prep and cleanup`,
        quantity: 1,
        unit: 'ea',
        unit_price: 100,
        total: 100,
        sort_order: iIdx + 1,
        price_source: null,
      }
    })
    return {
      id: `mp-sec-${sIdx}`,
      estimate_id: 'cal-est-1',
      company_id: 'cal-co-1',
      title,
      sort_order: sIdx + 1,
      subtotal: items.reduce((sum, item) => sum + item.total, 0),
      items,
    }
  })
  const total = sections.reduce((sum, s) => sum + s.subtotal, 0)
  return baseEstimateFields({ subtotal: total, total, sections })
}

function buildBaselineEstimate(): Record<string, unknown> {
  return baseEstimateFields({
    summary: 'Full kitchen renovation including framing, materials, and finish work.',
    payment_terms: 'Net 30',
    warranty_terms: '1 year labor',
    discount_type: 'percentage',
    discount_value: 10,
    discount_amount: 150,
    tax_rate: 0.0825,
    tax_amount: 111.38,
    subtotal: 1500,
    total: 1461.38,
    deposit_type: 'percent',
    deposit_value: 30,
    balance_due: 1022.97,
    sections: [
      {
        id: 'bl-sec-labor',
        estimate_id: 'cal-est-1',
        company_id: 'cal-co-1',
        title: 'Labor',
        sort_order: 1,
        subtotal: 750,
        items: [
          {
            id: 'bl-item-labor-1',
            section_id: 'bl-sec-labor',
            company_id: 'cal-co-1',
            description: 'Labor - framing and installation',
            quantity: 10,
            unit: 'hr',
            unit_price: 75,
            total: 750,
            sort_order: 1,
            price_source: null,
          },
        ],
      },
      {
        id: 'bl-sec-materials',
        estimate_id: 'cal-est-1',
        company_id: 'cal-co-1',
        title: 'Materials',
        sort_order: 2,
        subtotal: 750,
        items: [
          {
            id: 'bl-item-mat-1',
            section_id: 'bl-sec-materials',
            company_id: 'cal-co-1',
            description: 'Lumber - 2x4 studs',
            quantity: 50,
            unit: 'ea',
            unit_price: 10,
            total: 500,
            sort_order: 1,
            price_source: null,
          },
          {
            id: 'bl-item-mat-2',
            section_id: 'bl-sec-materials',
            company_id: 'cal-co-1',
            description: 'Drywall sheets',
            quantity: 25,
            unit: 'ea',
            unit_price: 10,
            total: 250,
            sort_order: 2,
            price_source: null,
          },
        ],
      },
    ],
  })
}

// GAP 1b follow-up finding (2026-07-28): individually, a summary block and a
// deposit-bearing totals block each fit their own page's budget with margin
// to spare — but COMBINED (no terms, no discount/tax) they land almost
// exactly on a page-capacity boundary, a worse case than the full baseline
// fixture above (which also has terms + discount/tax, landing at a
// DIFFERENT, less marginal boundary point). Included explicitly so the
// calibration covers this discovered worst-case combination.
function buildSummaryPlusDepositEstimate(): Record<string, unknown> {
  return baseEstimateFields({
    summary: 'Full kitchen renovation including framing, materials, and finish work.',
    subtotal: 1500,
    total: 1500,
    deposit_type: 'percent',
    deposit_value: 30,
    balance_due: 1050,
    sections: [
      {
        id: 'sd-sec-labor',
        estimate_id: 'cal-est-1',
        company_id: 'cal-co-1',
        title: 'Labor',
        sort_order: 1,
        subtotal: 750,
        items: [
          {
            id: 'sd-item-labor-1',
            section_id: 'sd-sec-labor',
            company_id: 'cal-co-1',
            description: 'Labor - framing and installation',
            quantity: 10,
            unit: 'hr',
            unit_price: 75,
            total: 750,
            sort_order: 1,
            price_source: null,
          },
        ],
      },
      {
        id: 'sd-sec-materials',
        estimate_id: 'cal-est-1',
        company_id: 'cal-co-1',
        title: 'Materials',
        sort_order: 2,
        subtotal: 750,
        items: [
          {
            id: 'sd-item-mat-1',
            section_id: 'sd-sec-materials',
            company_id: 'cal-co-1',
            description: 'Lumber - 2x4 studs',
            quantity: 50,
            unit: 'ea',
            unit_price: 10,
            total: 500,
            sort_order: 1,
            price_source: null,
          },
          {
            id: 'sd-item-mat-2',
            section_id: 'sd-sec-materials',
            company_id: 'cal-co-1',
            description: 'Drywall sheets',
            quantity: 25,
            unit: 'ea',
            unit_price: 10,
            total: 250,
            sort_order: 2,
            price_source: null,
          },
        ],
      },
    ],
  })
}

function buildPages(
  estimate: Record<string, unknown>,
  templateId: EstimateTemplateId,
  extraMarginPt: number
): PageAssignment[] {
  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  const headerHeightPt = measureHeaderHeightPt(FIXTURE_COMPANY, templateId)
  const fontFamily = ESTIMATE_DESIGN_TOKENS[templateId].fontFamily
  const safetyMarginPt = SAFETY_MARGIN_LINES * (geometry.tableCellFontSizePt * LINE_HEIGHT[fontFamily]) + extraMarginPt
  const constraints: PageConstraints = {
    contentHeightPt: LETTER_HEIGHT_PT - geometry.topPaddingPt - geometry.bottomPaddingPt - headerHeightPt,
    continuationTableHeaderHeightPt: CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId],
    safetyMarginPt,
  }
  const depositRow: DepositDisplayRow = {
    total: estimate.total as number,
    deposit_type: (estimate.deposit_type as string | null) ?? null,
    deposit_value: (estimate.deposit_value as number | null) ?? null,
    balance_due: (estimate.balance_due as number | null) ?? null,
  }
  const blocks = blocksFromModel({
    sections: estimate.sections as any,
    summary: (estimate.summary as string | null) ?? null,
    timeline: (estimate.timeline as string | null) ?? null,
    payment_terms: (estimate.payment_terms as string | null) ?? null,
    warranty_terms: (estimate.warranty_terms as string | null) ?? null,
    notes: (estimate.notes as string | null) ?? null,
    // estimate_terms_enabled: false ≡ the previous undefined at runtime (no
    // estimate-terms card); the explicit field satisfies the weak-type check.
    company: { ...FIXTURE_COMPANY, estimate_terms_enabled: false },
    discount_amount: (estimate.discount_amount as number) ?? 0,
    tax_amount: (estimate.tax_amount as number) ?? 0,
    dep: deriveDepositDisplay(depositRow),
    signature: null,
    photos: [],
    resolvedSettings: resolvePresentationSettings((estimate as { presentation_settings?: unknown }).presentation_settings),
    preparedBy: null,
    L: PDF_LABELS.en,
    templateId,
  })
  return computePageBreaks(blocks, constraints, createLocalFontkitMeasurementProvider())
}

async function realPageCount(
  component: typeof EstimatePDF,
  estimate: Record<string, unknown>,
  pages: PageAssignment[]
): Promise<number> {
  const element = createElement(component, {
    estimate: estimate as any,
    company: FIXTURE_COMPANY as any,
    client: null,
    projectName: 'Calibration Test',
    projectType: null,
    language: 'en',
    pages,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await renderToBuffer(element as any)
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function main() {
  const candidates = [0, 10, 20, 30, 40, 50, 60, 70, 78, 80, 90, 100]
  const summary: { marginPt: number; mismatches: number }[] = []

  for (const marginPt of candidates) {
    let mismatches = 0
    const details: string[] = []

    for (const templateId of ['classic', 'modern'] as const) {
      const component = templateId === 'classic' ? EstimatePDF : EstimatePDFModern

      for (let n = 1; n <= 60; n++) {
        const estimate = buildSingleSectionEstimate(n)
        const pages = buildPages(estimate, templateId, marginPt)
        const real = await realPageCount(component, estimate, pages)
        if (real !== pages.length) {
          mismatches += 1
          details.push(`${templateId} single-section n=${n}: engine=${pages.length} real=${real}`)
        }
      }

      for (const [label, estimate] of [
        ['multi-section (4x10 items)', buildMultiSectionEstimate()],
        ['baseline (content-rich)', buildBaselineEstimate()],
        ['summary + deposit only (worst-case boundary combo)', buildSummaryPlusDepositEstimate()],
      ] as const) {
        const pages = buildPages(estimate, templateId, marginPt)
        const real = await realPageCount(component, estimate, pages)
        if (real !== pages.length) {
          mismatches += 1
          details.push(`${templateId} ${label}: engine=${pages.length} real=${real}`)
        }
      }
    }

    summary.push({ marginPt, mismatches })
    console.log(`marginPt=${marginPt} mismatches=${mismatches}`)
    if (details.length > 0) console.log(details.join('\n'))
  }

  console.table(summary)
  const winner = summary.find((r) => r.mismatches === 0)
  console.log(
    winner
      ? `Recommended PDF_RENDER_SAFETY_MARGIN_PT: smallest zero-mismatch candidate = ${winner.marginPt}pt. Add a small documented buffer on top for real-world content this sweep didn't cover.`
      : 'No candidate eliminated all mismatches within the swept range — widen the candidates array.'
  )
}

main().catch((err) => {
  console.error('pagination-render-calibration FAILED:', err)
  process.exit(1)
})
