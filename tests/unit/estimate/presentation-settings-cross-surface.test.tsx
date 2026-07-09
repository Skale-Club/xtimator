// tests/unit/estimate/presentation-settings-cross-surface.test.tsx
// Phase 163 (SENDHUB-04 + SENDHUB-05): cross-surface parity + retrocompat
// + structural-grep tests for the presentation-settings resolver rollout.
//
// Post-Wave-2 state: all 4 `it` blocks GREEN. The 6 renderers each import
// resolvePresentationSettings (structural grep enforces this), and each
// gates its output on isSectionVisible so a single toggle propagates
// identically across every surface.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { EstimateDocument } from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import { buildItemsBreakdown, resolveTemplate } from '@/lib/utils/estimate-template'
import { formatEstimateForWhatsApp } from '@/lib/whatsapp/formatter'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { collectTextNodes } from './_pdf-text-walker'
import type { PresentationSettings } from '@/lib/estimate/presentation-settings'

const SECRET_ITEM_DESCRIPTION = 'CROSS_SURFACE_ITEM_DESC_XYZ_98723'
const SECRET_SUMMARY = 'CROSS_SURFACE_SUMMARY_XYZ_98724'

// Partial fixture; renderers only touch the fields we assert against.
function baseEstimate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'est-1',
    project_id: 'p-1',
    company_id: 'c-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    public_slug_token: null,
    status: 'sent',
    language: 'en',
    summary: SECRET_SUMMARY,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 1000,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 1000,
    deposit_type: 'none',
    deposit_value: null,
    deposit: 0,
    balance_due: 1000,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    presentation_settings: null,
    sections: [
      {
        id: 'sec-1',
        estimate_id: 'est-1',
        company_id: 'c-1',
        title: 'Labor',
        sort_order: 1,
        subtotal: 1000,
        items: [
          {
            id: 'i-1',
            section_id: 'sec-1',
            company_id: 'c-1',
            description: SECRET_ITEM_DESCRIPTION,
            quantity: 1,
            unit: null,
            unit_price: 1000,
            total: 1000,
            sort_order: 1,
            price_source: null,
          },
        ],
      },
    ],
    attachedPhotos: [],
    ...overrides,
  }
}

function toDocumentData(estimate: Record<string, unknown>): Record<string, unknown> {
  // Mirror the classic-share estimate-view.tsx:157-161 construction pattern
  // (cast-with-fallback for presentation_settings).
  return {
    summary: estimate.summary,
    notes: estimate.notes,
    timeline: estimate.timeline,
    payment_terms: estimate.payment_terms,
    warranty_terms: estimate.warranty_terms,
    discount_type: estimate.discount_type,
    discount_value: estimate.discount_value,
    discount_amount: estimate.discount_amount,
    tax_rate: estimate.tax_rate,
    tax_amount: estimate.tax_amount,
    subtotal: estimate.subtotal,
    total: estimate.total,
    deposit_type: estimate.deposit_type ?? 'none',
    deposit_value: estimate.deposit_value ?? null,
    deposit: estimate.deposit ?? 0,
    balance_due: estimate.balance_due ?? estimate.total,
    currency_code: estimate.currency_code,
    sections: estimate.sections,
    estimate_date: estimate.estimate_date ?? null,
    estimate_number: estimate.estimate_number ?? null,
    attachedPhotos: estimate.attachedPhotos ?? [],
    presentation_settings:
      (estimate as { presentation_settings?: PresentationSettings | null }).presentation_settings ?? null,
  }
}

const COMPANY = {
  name: 'Acme',
  owner_name: null,
  phone: null,
  email: null,
  website: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  logo_url: null,
  brand_primary_color: null,
} as const

function renderAllSurfaces(estimate: Record<string, unknown>): {
  classicPdf: string
  modernPdf: string
  classicShare: string
  modernShare: string
  plainText: string
  whatsapp: string
} {
  const resolved = resolvePresentationSettings(
    (estimate as { presentation_settings?: unknown }).presentation_settings,
  )

  // 1. Classic PDF — walk element tree
  const classicPdfBuf: string[] = []
  const classicPdfTree = EstimatePDF({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: COMPANY as any,
    client: null,
    projectName: 'Test',
    projectType: null,
    language: 'en',
  })
  collectTextNodes(classicPdfTree, classicPdfBuf)

  // 2. Modern PDF
  const modernPdfBuf: string[] = []
  const modernPdfTree = EstimatePDFModern({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: COMPANY as any,
    client: null,
    projectName: 'Test',
    projectType: null,
    language: 'en',
  })
  collectTextNodes(modernPdfTree, modernPdfBuf)

  // 3. Classic share (JSX) — build EstimateDocumentData from the estimate
  const documentData = toDocumentData(estimate)
  const classic = render(
    <EstimateDocument
      mode="view"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={documentData as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company={COMPANY as any}
      client={null}
      projectName="Test"
      projectType={null}
      language="en"
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />,
  )

  // 4. Modern share (JSX)
  const modern = render(
    <EstimateDocumentModern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={documentData as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company={COMPANY as any}
      client={null}
      projectName="Test"
      projectType={null}
      language="en"
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />,
  )

  // 5. Plain-text template
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = buildItemsBreakdown(estimate as any, resolved)
  const plainText = resolveTemplate(
    { greeting: null, opener: null, closer: null, signature: null },
    {
      client_name: 'Alice',
      company_name: 'Acme',
      owner_name: 'Bob',
      total: '$1,000.00',
      items_breakdown: items,
    },
  )

  // 6. WhatsApp formatter
  const whatsapp = formatEstimateForWhatsApp(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate as any,
    'Alice',
    'Acme',
    'Bob',
    null,
    (estimate as { presentation_settings?: PresentationSettings | null }).presentation_settings,
  )

  return {
    classicPdf: classicPdfBuf.join(' '),
    modernPdf: modernPdfBuf.join(' '),
    classicShare: classic.container.textContent ?? '',
    modernShare: modern.container.textContent ?? '',
    plainText,
    whatsapp,
  }
}

describe('SENDHUB-04/-05: presentation-settings cross-surface parity', () => {
  it('when sections.sections = false, the item description is absent from ALL 6 surfaces', () => {
    const est = baseEstimate({
      presentation_settings: { sections: { sections: false } },
    })
    const out = renderAllSurfaces(est)

    expect(out.classicPdf).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernPdf).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.classicShare).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernShare).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.plainText).not.toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.whatsapp).not.toContain(SECRET_ITEM_DESCRIPTION)
  })

  it('when sections.summary = false, the summary text is absent from ALL 6 surfaces', () => {
    // NOTE: plain-text/WhatsApp don't emit summary today — assertion is
    // trivially true. Still asserted for parity: if a future change adds
    // summary emission, it stays gated.
    const est = baseEstimate({
      presentation_settings: { sections: { summary: false } },
    })
    const out = renderAllSurfaces(est)

    expect(out.classicPdf).not.toContain(SECRET_SUMMARY)
    expect(out.modernPdf).not.toContain(SECRET_SUMMARY)
    expect(out.classicShare).not.toContain(SECRET_SUMMARY)
    expect(out.modernShare).not.toContain(SECRET_SUMMARY)
    expect(out.plainText).not.toContain(SECRET_SUMMARY)
    expect(out.whatsapp).not.toContain(SECRET_SUMMARY)
  })

  it('retrocompat: presentation_settings = null → the item description IS emitted by all 6 surfaces (byte-identical to today)', () => {
    const est = baseEstimate({ presentation_settings: null })
    const out = renderAllSurfaces(est)

    expect(out.classicPdf).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernPdf).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.classicShare).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.modernShare).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.plainText).toContain(SECRET_ITEM_DESCRIPTION)
    expect(out.whatsapp).toContain(SECRET_ITEM_DESCRIPTION)
  })

  it('structural: all 6 render/format sources import resolvePresentationSettings', () => {
    const sources = [
      'components/pdf/estimate-pdf.tsx',
      'components/pdf/estimate-pdf-modern.tsx',
      'components/workspace/estimate/estimate-document.tsx',
      'components/share/estimate-document-modern.tsx',
      'lib/utils/estimate-template.ts',
      'lib/whatsapp/formatter.ts',
    ]
    for (const path of sources) {
      const source = readFileSync(path, 'utf8')
      expect(source, `${path} must import resolvePresentationSettings`).toContain(
        'resolvePresentationSettings',
      )
    }
  })
})
