// tests/unit/pdf/_pages-for-fixture.ts
//
// Phase 184 Plan 05 (PGBRK-01/03/04) — the ONE shared helper every
// direct-call PDF test uses to compute a REAL `pages` prop via the actual
// blocksFromModel() + computePageBreaks() pipeline. Direct-call tests bypass
// lib/pdf/render-estimate-pdf.ts's resolver entirely (they call
// EstimatePDF/EstimatePDFModern as plain functions — see
// components/pdf/shared/pdf-header.tsx's top comment for why), so this
// helper mirrors that resolver's own headerHeightPt/safetyMarginPt/
// continuationTableHeaderHeightPt derivation exactly (see that file's
// comments for the citations behind each term).
//
// Underscore prefix signals: not a test file.

import type { DocumentSection, DocumentSignature } from '@/lib/estimate/document/model'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { LABELS as PDF_LABELS } from '@/lib/estimate/document/labels'
import { createFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/estimator'
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints'
import type { PageAssignment } from '@/lib/estimate/pagination/types'
import { deriveDepositDisplay, type DepositDisplayRow } from '@/lib/estimate/deposit-display'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'

export interface BuildPagesForFixtureCompany extends PdfHeaderCompany {
  estimate_terms_enabled?: boolean
  estimate_terms_text?: string | null
}

export interface BuildPagesForFixtureOpts {
  signature?: DocumentSignature | null
  attachedPhotos?: { url: string; caption: string | null }[]
  preparedBy?: string | null
}

/**
 * Computes a real `PageAssignment[]` for a direct-call PDF test's fixture,
 * running the exact same blocksFromModel() -> computePageBreaks() pipeline
 * lib/pdf/render-estimate-pdf.ts's resolver runs in production.
 */
export function buildPagesForFixture(
  estimate: Record<string, unknown>,
  company: BuildPagesForFixtureCompany,
  templateId: EstimateTemplateId,
  opts: BuildPagesForFixtureOpts = {}
): PageAssignment[] {
  const L = PDF_LABELS.en
  // Phase 185 Plan 01 (PGBRK-01/04) — repointed at the ONE shared constraints
  // function also used by lib/pdf/render-estimate-pdf.ts, instead of this
  // file's own independent copy of the same formula (plan-checker warning
  // 10 — a THIRD copy is exactly the failure mode PGBRK-01/04 must prevent).
  const constraints = computeEstimatePageConstraints(company, templateId)

  const depositRow: DepositDisplayRow = {
    total: (estimate.total as number | undefined) ?? 0,
    deposit_type: (estimate.deposit_type as string | null | undefined) ?? null,
    deposit_value: (estimate.deposit_value as number | null | undefined) ?? null,
    balance_due: (estimate.balance_due as number | null | undefined) ?? null,
  }

  const blocks = blocksFromModel({
    sections: (estimate.sections as DocumentSection[] | undefined) ?? [],
    summary: (estimate.summary as string | null | undefined) ?? null,
    timeline: (estimate.timeline as string | null | undefined) ?? null,
    payment_terms: (estimate.payment_terms as string | null | undefined) ?? null,
    warranty_terms: (estimate.warranty_terms as string | null | undefined) ?? null,
    notes: (estimate.notes as string | null | undefined) ?? null,
    company,
    discount_amount: (estimate.discount_amount as number | undefined) ?? 0,
    tax_amount: (estimate.tax_amount as number | undefined) ?? 0,
    dep: deriveDepositDisplay(depositRow),
    signature: opts.signature ?? null,
    photos: opts.attachedPhotos ?? [],
    resolvedSettings: resolvePresentationSettings(
      (estimate as { presentation_settings?: unknown }).presentation_settings
    ),
    preparedBy: opts.preparedBy ?? null,
    L,
    templateId,
  })

  return computePageBreaks(blocks, constraints, createFontkitMeasurementProvider())
}
