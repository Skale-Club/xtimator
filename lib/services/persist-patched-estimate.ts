/**
 * lib/services/persist-patched-estimate.ts
 *
 * Phase 4d (ESTIMATOR_PATCH_REFINE): the persistence hook buildEstimateGraph receives for an
 * ACCEPTED section patch. It writes the patched content as a NEW estimate version through the
 * same path generation uses (persistEstimateVersion: totals engine with the company tax config,
 * sections + items with the per-line AI fields, safe insert-non-current-then-promote swap,
 * cleanup on failure), carrying over what the patch does not change from the base estimate.
 *
 * Never throws and never leaves the project without a current estimate: on any failure it
 * returns null and the base draft stays current.
 */
import { requireServiceClient } from '@/lib/supabase/service'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'
import { assertFinitePositive } from '@/lib/estimate/totals'
import { buildAiMeta, parseAiMeta } from '@/lib/estimate/ai-meta'
import { generatePublicSlugToken } from '@/lib/estimate/public-url'
import type { PersistPatch } from '@/lib/estimate/graph/nodes/patch-refine'
import { normalizeCurrencyCode } from '@/lib/money/currency'
import { persistEstimateVersion } from '@/lib/services/persist-estimate-version'
import { resolveProjectStatusForSections } from '@/lib/estimate/project-status'

type BaseRow = {
  currency_code: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  presentation_settings: unknown
  valid_until: string | null
  language: string | null
  ai_meta: unknown
  discount_type: 'amount' | 'percent' | 'none' | null
  discount_value: number | null
  deposit_type: 'none' | 'percent' | 'amount' | null
  deposit_value: number | null
  created_by_user_id: string | null
}

const BASE_COLUMNS =
  'currency_code, notes, timeline, payment_terms, warranty_terms, presentation_settings, valid_until, language, ai_meta, discount_type, discount_value, deposit_type, deposit_value, created_by_user_id'

export const persistPatchedEstimate: PersistPatch = async ({
  companyId,
  projectId,
  baseEstimateId,
  patched,
  structure,
}) => {
  try {
    const supabase = requireServiceClient()

    const [baseResult, companyResult, versionResult] = await Promise.all([
      supabase
        .from('estimates')
        .select(BASE_COLUMNS)
        .eq('id', baseEstimateId)
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .maybeSingle(),
      supabase.from('companies').select('currency_code, default_tax_rate, tax_config').eq('id', companyId).single(),
      supabase
        .from('estimates')
        .select('version')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1),
    ])
    const base = baseResult.data as BaseRow | null
    const company = companyResult.data as
      | { currency_code?: string | null; default_tax_rate?: number | string | null; tax_config?: unknown }
      | null
    if (!base || !company) return null

    const currencyCode = normalizeCurrencyCode(base.currency_code ?? company.currency_code)
    const taxRate = Number(company.default_tax_rate) || 0
    const taxConfig = company.tax_config != null ? (company.tax_config as TaxConfig) : null

    const totals = computeEstimateTotals(patched.sections, {
      taxRate,
      taxConfig,
      currencyCode,
      // A fresh draft has no global discount or deposit; carry them if the base has any.
      discountType: base.discount_type,
      discountValue: base.discount_value,
      depositType: base.deposit_type,
      depositValue: base.deposit_value,
    })
    const safeDiscountAmount = assertFinitePositive(totals.discountAmount)

    // Keep the base's assumptions / exclusions / open questions; the quality block is the
    // patched draft's (written only when it is not 'ok', like generation).
    const aiMeta = buildAiMeta(
      parseAiMeta(base.ai_meta) ?? {},
      structure.band === 'ok'
        ? null
        : { score: structure.score, band: structure.band, findings: structure.findings }
    )

    const nextVersion = ((versionResult.data?.[0] as { version?: number } | undefined)?.version ?? 0) + 1

    const estimateRow = {
      project_id: projectId,
      company_id: companyId,
      currency_code: currencyCode,
      version: nextVersion,
      status: 'draft',
      workflow_status: 'draft',
      summary: patched.summary,
      // Not changed by a patch: carried over from the base draft.
      notes: base.notes,
      timeline: base.timeline,
      payment_terms: base.payment_terms,
      warranty_terms: base.warranty_terms,
      presentation_settings: base.presentation_settings,
      valid_until: base.valid_until,
      language: base.language,
      created_by_user_id: base.created_by_user_id,
      subtotal: assertFinitePositive(totals.subtotal),
      // Same persistence shape as generation: the server-computed global discount as an amount.
      discount_type: safeDiscountAmount > 0 ? 'amount' : null,
      discount_value: safeDiscountAmount,
      discount_amount: safeDiscountAmount,
      tax_rate: taxRate,
      tax_amount: assertFinitePositive(totals.taxAmount),
      total: assertFinitePositive(totals.grandTotal),
      deposit_type: base.deposit_type ?? 'none',
      deposit_value: base.deposit_value ?? null,
      balance_due: assertFinitePositive(totals.balanceDue),
      // A new version gets its own friendly-URL token, exactly like generation.
      public_slug_token: generatePublicSlugToken(),
    }

    const estimateId = await persistEstimateVersion(supabase, {
      companyId,
      projectId,
      estimateRow,
      aiMeta,
      calculatedSections: totals.sections,
      previousCurrentId: baseEstimateId,
    })

    // Keep the project total and status in step with the (now current) estimate. The status uses
    // the same decision as generation (an unpriced line or a total over the ceiling ->
    // awaiting_details). Generation counts unpriced lines from price research; the patch path has
    // no research outcome, so it counts lines without a positive unit_price instead. Best-effort.
    try {
      const { status } = resolveProjectStatusForSections(patched.sections, estimateRow.total, currencyCode)
      await supabase.from('projects').update({ total: estimateRow.total, status }).eq('id', projectId)
    } catch (err) {
      console.warn('[persist-patched-estimate] project total update failed (non-fatal):', err)
    }

    return { estimateId }
  } catch (err) {
    console.warn('[persist-patched-estimate] failed; the base draft stays current:', err)
    return null
  }
}
