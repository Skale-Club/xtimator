// components/workspace/estimate/use-paginated-preview.ts
//
// Phase 185 Plan 03 (PGMODE-02/03) — usePaginatedPreview() computes the
// SAME PageAssignment[] the PDF pipeline (lib/pdf/render-estimate-pdf.ts)
// produces for the identical document + template, by reusing the identical
// pipeline client-side: blocksFromModel() -> computePageBreaks(), fed by a
// browser-safe, dynamically-imported fontkit measurement provider.
//
// CRITICAL (rules-of-hooks safety): this hook MUST be called UNCONDITIONALLY
// on every render of estimate-editor.tsx — the `enabled` field is how the
// CALLER communicates "should this actually do work", never a guard around
// the hook call itself. When `enabled` is false, this hook's effect returns
// `{ pages: null }` immediately: zero font fetch, zero bundle cost (fontkit/
// linebreak load ONLY via the dynamic import below, gated on enabled===true).
'use client'

import { useEffect, useState } from 'react'
import type { DocumentCompany, EstimateDocumentData } from '@/lib/estimate/document/model'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { MeasurementProvider } from '@/lib/estimate/pagination/measure/types'
import type { PageAssignment } from '@/lib/estimate/pagination/types'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { LABELS as DOC_LABELS } from '@/lib/estimate/document/labels'
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints'
import { ESTIMATE_DESIGN_TOKENS } from '@/lib/estimate/document/tokens'

export interface UsePaginatedPreviewInput {
  data: EstimateDocumentData
  company: DocumentCompany
  templateId: EstimateTemplateId
  preparedBy: string | null
  language: EstimateLanguage
  /** false = do no work at all (no font fetch, no compute) — pages stays null. */
  enabled: boolean
}

export interface UsePaginatedPreviewResult {
  pages: PageAssignment[] | null
}

// Module-scope cache, keyed by template id — toggling paginated mode off and
// back on (or across estimates using the same template) never re-fetches the
// font(s). Shares the fontCache/inFlight discipline browser-estimator.ts
// itself already applies per-family; this cache is one level up (per the
// RESOLVED provider, so the 2-font Promise.all + preload only runs once per
// template for the lifetime of the page).
const providerCache = new Map<EstimateTemplateId, Promise<MeasurementProvider>>()

async function loadMeasurementProvider(templateId: EstimateTemplateId): Promise<MeasurementProvider> {
  const design = ESTIMATE_DESIGN_TOKENS[templateId]
  // Dynamic import — gated on enabled===true (viewMode==='page') via the
  // caller below — NEVER a static top-level import. This is the ONE place
  // fontkit/linebreak enter the client bundle, and only once paginated mode
  // first activates.
  const mod = await import('@/lib/estimate/pagination/measure/browser-estimator')
  return mod.createBrowserFontkitMeasurementProvider([design.fontFamily, design.fontFamilyBold])
}

function getMeasurementProvider(templateId: EstimateTemplateId): Promise<MeasurementProvider> {
  const cached = providerCache.get(templateId)
  if (cached) return cached
  const promise = loadMeasurementProvider(templateId)
  providerCache.set(templateId, promise)
  return promise
}

export function usePaginatedPreview(input: UsePaginatedPreviewInput): UsePaginatedPreviewResult {
  const { data, company, templateId, preparedBy, language, enabled } = input
  const [pages, setPages] = useState<PageAssignment[] | null>(null)

  useEffect(() => {
    if (!enabled) {
      setPages(null)
      return
    }

    let cancelled = false

    getMeasurementProvider(templateId).then((provider) => {
      if (cancelled) return
      const L = DOC_LABELS[language] ?? DOC_LABELS.en
      const blocks = blocksFromModel({
        sections: data.sections,
        summary: data.summary,
        timeline: data.timeline,
        payment_terms: data.payment_terms,
        warranty_terms: data.warranty_terms,
        notes: data.notes,
        company,
        discount_amount: data.discount_amount,
        tax_amount: data.tax_amount,
        dep: deriveDepositDisplay({
          total: data.total,
          deposit_type: data.deposit_type,
          deposit_value: data.deposit_value,
          balance_due: data.balance_due,
        }),
        signature: data.signature ?? null,
        // url never read by height math (185-RESEARCH.md, verified) — no
        // signed-URL resolution needed just to compute page breaks.
        photos: (data.attachedPhotos ?? []).map((p) => ({ url: '', caption: p.caption })),
        resolvedSettings: resolvePresentationSettings(data.presentation_settings),
        preparedBy,
        L,
        templateId,
      })
      const constraints = computeEstimatePageConstraints(company, templateId)
      const computed = computePageBreaks(blocks, constraints, provider)
      if (!cancelled) setPages(computed)
    })

    return () => {
      cancelled = true
    }
    // Recompute on every genuine change to the document, company, template,
    // preparedBy, or language. No immediate-vs-debounce distinction yet
    // (Plan 185-04 adds that refinement) — this task's bar is correctness on
    // every real change, not yet efficiency.
  }, [enabled, data, company, templateId, preparedBy, language])

  return { pages }
}
