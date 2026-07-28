// tests/unit/pagination/measure/browser-estimator-parity.test.ts
//
// Phase 185 Plan 01 (PGBRK-01/04) — the phase's single most important test:
// proves the browser measurement provider (genuinely exercising fontkit's
// REAL browser build, forced under Node/Vitest) produces byte-identical
// PageAssignment[] to the server provider, for both templates, on a
// deliberately multi-page, every-block-kind fixture.
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

// Forces fontkit's REAL browser build for THIS test file's `create` calls
// only (plan-checker Blocker 2 — under a plain Node/Vitest resolver, the
// bare 'fontkit' specifier browser-estimator.ts imports would otherwise
// silently resolve to the SERVER build via the "node" export condition,
// defeating this test's entire purpose).
//
// CRITICAL correction vs. a naive full-module `vi.mock('fontkit', ...)`:
// measure/estimator.ts (the SERVER provider this test compares against)
// ALSO imports the bare 'fontkit' specifier, and its `getFont()` calls
// `fontkit.openSync(...)` — a function the browser build does not export.
// Replacing the ENTIRE 'fontkit' module for this test file's module graph
// would silently break the server provider too (both providers resolve the
// SAME mocked module — there is no "only browser-estimator.ts sees this"
// scoping via vi.mock's module-id-keyed cache). Instead, `importOriginal()`
// preserves the genuine, unmocked Node build (`openSync` and everything
// else) and ONLY `create` (the sole API browser-estimator.ts calls) is
// overridden with the REAL browser build's own implementation — an
// absolute filesystem path, which bypasses fontkit's exports-map
// restriction entirely (that restriction governs bare/relative
// package-specifier resolution, never a direct absolute-path file load).
vi.mock('fontkit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const browserBuildPath = path.resolve(process.cwd(), 'node_modules/fontkit/dist/browser.cjs')
  const browserBuild = (await import(/* @vite-ignore */ browserBuildPath)) as { create: unknown }
  return { ...actual, create: browserBuild.create }
})

import { blocksFromModel, type BlocksFromModelInput, type BlocksFromModelPhoto } from '@/lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints'
import { createFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/estimator'
import { createBrowserFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/browser-estimator'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { LABELS } from '@/lib/estimate/document/labels'
import type { DocumentSection, DocumentItem, DocumentSignature } from '@/lib/estimate/document/model'
import type { DepositDisplay } from '@/lib/estimate/deposit-display'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'

// A company fixture satisfying BOTH BlocksFromModelCompany (estimate terms)
// AND PdfHeaderCompany (computeEstimatePageConstraints's header-height
// derivation) — mirrors _pages-for-fixture.ts's own fixture-shape pattern.
const FIXTURE_COMPANY: PdfHeaderCompany & { estimate_terms_enabled: boolean; estimate_terms_text: string } = {
  name: 'Acme Construction LLC',
  phone: '5551234567',
  email: 'hello@acme.test',
  website: 'https://acme.test',
  address: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62704',
  logo_url: null,
  estimate_terms_enabled: true,
  estimate_terms_text:
    'These general estimate terms and conditions apply to this proposal, including validity period, change-order handling, and cancellation policy.',
}

function buildFixtureSections(): DocumentSection[] {
  const sections: DocumentSection[] = []
  for (let s = 0; s < 3; s++) {
    const items: DocumentItem[] = []
    for (let i = 0; i < 10; i++) {
      const description =
        i === 0
          ? 'This is a deliberately long, line-wrapping description that spans many words on purpose, so the greedy line-packer must wrap it across several visual lines within the narrow description column width — exercising the multi-line measurement path for both templates and both measurement providers alike.'
          : `Standard scope-of-work line item ${s}-${i} covering labor and materials for this portion of the job.`
      items.push({
        id: `s${s}-i${i}`,
        description,
        quantity: 1,
        unit: null,
        unit_price: 100 + i,
        total: 100 + i,
      })
    }
    sections.push({
      id: `sec-${s}`,
      title: `Section ${s + 1} — Scope of Work`,
      subtotal: items.reduce((sum, it) => sum + it.total, 0),
      items,
    })
  }
  return sections
}

const FIXTURE_PHOTOS: BlocksFromModelPhoto[] = [
  { url: 'https://example.test/photo-1.jpg', caption: 'Before' },
  { url: 'https://example.test/photo-2.jpg', caption: null },
  { url: 'https://example.test/photo-3.jpg', caption: 'After completion' },
]

const FIXTURE_SIGNATURE: DocumentSignature = {
  signerName: 'Jane Doe',
  signedAt: '2026-07-20T12:00:00Z',
  signatureDataUrl: 'data:image/png;base64,AAAA',
}

// discount AND tax AND deposit all present -> totals block at its maximum
// row count (subtotal + discount + tax + deposit + balance-due).
const FIXTURE_DEPOSIT: DepositDisplay = { showDeposit: true, depositAmount: 500, balanceDue: 2500 }

function buildFixtureInput(templateId: EstimateTemplateId): BlocksFromModelInput {
  return {
    sections: buildFixtureSections(),
    summary:
      'A comprehensive summary of the scope of work covering all sections, materials, and labor required to complete this project from start to finish, including site preparation and final cleanup.',
    timeline: 'Estimated completion within 4-6 weeks from the signed start date, weather permitting.',
    payment_terms: '50% deposit due at signing, balance due upon completion of all work.',
    warranty_terms: 'All labor is warrantied for 2 years; materials are covered per manufacturer warranty terms.',
    notes: 'Additional notes about site access, parking, and scheduling considerations for this project.',
    company: FIXTURE_COMPANY,
    discount_amount: 150,
    tax_amount: 220,
    dep: FIXTURE_DEPOSIT,
    signature: FIXTURE_SIGNATURE,
    photos: FIXTURE_PHOTOS,
    resolvedSettings: resolvePresentationSettings(undefined),
    preparedBy: 'John Smith',
    L: LABELS.en,
    templateId,
  }
}

/** Serves the REAL vendored TTFs from public/fonts/** for the browser
 *  provider's fetch() calls — a real ArrayBuffer slice, mirroring what an
 *  actual fetch() response gives (never a Node Buffer). */
function stubFontFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    const filePath = path.join(process.cwd(), 'public', url)
    const buf = readFileSync(filePath)
    return {
      ok: true,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    }
  })
}

describe.each(['classic', 'modern'] as const)(
  'browser vs. server measurement provider parity — %s',
  (templateId) => {
    it('produces byte-identical PageAssignment[] for a multi-page, every-block-kind fixture', async () => {
      const input = buildFixtureInput(templateId)
      const blocks = blocksFromModel(input)
      const constraints = computeEstimatePageConstraints(FIXTURE_COMPANY, templateId)

      const serverPages = computePageBreaks(blocks, constraints, createFontkitMeasurementProvider())
      expect(serverPages.length).toBeGreaterThan(1)

      stubFontFetch()
      const browserProvider = await createBrowserFontkitMeasurementProvider()
      const browserPages = computePageBreaks(blocks, constraints, browserProvider)

      expect(browserPages).toEqual(serverPages)
    })
  }
)
