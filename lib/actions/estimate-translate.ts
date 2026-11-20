'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { getEstimateById } from '@/lib/queries/estimate'
import { assertWritable } from '@/lib/demo/guard'
import { billingCreateDenied } from '@/lib/billing/access-guard'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'
import { isEstimateLocked } from '@/lib/estimate/lock'
import { translateEstimateTextsOR } from '@/lib/ai/openrouter-client'
import { saveEstimate } from '@/lib/actions/estimate'
import type { SaveEstimateInput } from '@/lib/schemas/estimate'
import {
  collectEstimateTexts,
  applyEstimateTranslations,
  type EstimateLanguageCode,
} from '@/lib/estimate/translate-texts'

// ---------------------------------------------------------------------------
// Change one estimate's language (owner request 2026-11-20): Estimate options
// offers en / pt / es. The document labels follow `estimates.language`; the
// owner's own texts (summary, terms, section titles, line descriptions) are
// translated by the cheap model and charged as an AI estimate edit.
//
// Order: translate first (nothing is written if the model fails), then save
// the translated texts through saveEstimate (same compare-and-set, lock and
// totals path as an editor save), then set the language. The editor reloads
// afterwards, so it never keeps a stale copy.
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  estimateId: z.string().uuid(),
  targetLanguage: z.enum(['en', 'pt', 'es']),
  expectedUpdatedAt: z.string().min(1),
})

/** Strings sent to the model per call: keeps each answer far below max_tokens. */
const CHUNK = 60

export type TranslateEstimateResult = { ok: true; translated: number } | { error: string; code?: string }

export async function translateEstimate(raw: z.infer<typeof inputSchema>): Promise<TranslateEstimateResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Invalid request' }
  const { estimateId, targetLanguage, expectedUpdatedAt } = parsed.data

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { error: 'Not authenticated' }
  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' }

  const writeDenied = await assertWritable()
  if (writeDenied) return writeDenied
  // Gate at the cheap-helper estimate: a translation costs a few credits.
  const billingDenied = await billingCreateDenied(companyId, 'chat')
  if (billingDenied) return billingDenied

  const estimate = await getEstimateById(supabase, estimateId)
  if (!estimate || estimate.company_id !== companyId) return { error: 'Estimate not found' }
  if (estimate.is_current === false) return { error: 'Only the current version can change language.' }
  if (isEstimateLocked(estimate) || estimate.hasSignature) {
    return {
      error: 'This estimate was already answered by the client and can no longer change.',
      code: 'locked',
    }
  }
  if (estimate.updated_at !== expectedUpdatedAt) {
    return {
      error: 'This estimate changed elsewhere. Reload and try again.',
      code: 'conflict',
    }
  }

  const source = ((estimate.language as EstimateLanguageCode | null) ?? 'en') as EstimateLanguageCode
  if (source === targetLanguage) return { ok: true, translated: 0 }

  const texts = collectEstimateTexts(estimate)
  const attemptId = randomUUID()
  let translations: string[] = []
  let costUsd: number | null = null

  if (texts.length > 0) {
    try {
      const chunks: string[][] = []
      for (let i = 0; i < texts.length; i += CHUNK) chunks.push(texts.slice(i, i + CHUNK))
      const results = await Promise.all(
        chunks.map((chunk) =>
          translateEstimateTextsOR(chunk, source, targetLanguage, {
            attemptId,
            companyId,
            projectId: estimate.project_id,
          }),
        ),
      )
      translations = results.flatMap((r) => r.translations)
      const costs = results.map((r) => r.costUsd)
      costUsd = costs.every((c) => c == null) ? null : costs.reduce<number>((sum, c) => sum + (c ?? 0), 0)
    } catch (err) {
      console.warn('[translateEstimate] translation failed:', err)
      return {
        error: 'The translation failed. Nothing was changed. Try again.',
      }
    }
  }

  // The model ran: charge it whether or not the save below succeeds.
  await recordCreditDebit({
    companyId,
    operationType: 'refine',
    realCostUsd: costUsd,
    attemptId,
  })

  if (texts.length > 0) {
    const translated = applyEstimateTranslations(estimate, translations)
    const payload: SaveEstimateInput = {
      id: estimate.id,
      expectedUpdatedAt,
      summary: translated.summary,
      notes: translated.notes,
      timeline: translated.timeline,
      payment_terms: translated.payment_terms,
      warranty_terms: translated.warranty_terms,
      discount_type: (estimate.discount_type ?? null) as SaveEstimateInput['discount_type'],
      discount_value: estimate.discount_value ?? null,
      deposit_type: (estimate.deposit_type ?? 'none') as SaveEstimateInput['deposit_type'],
      deposit_value: estimate.deposit_value ?? null,
      tax_rate: estimate.tax_rate ?? 0,
      estimate_date: estimate.estimate_date ?? null,
      estimate_number: estimate.estimate_number ?? null,
      presentation_settings: (estimate.presentation_settings ??
        null) as SaveEstimateInput['presentation_settings'],
      sections: translated.sections.map((s) => ({
        id: s.id,
        title: s.title,
        sort_order: s.sort_order,
        items: s.items.map((row) => {
          // select('*') rows carry the v4.11 pricing columns the EstimateItem type omits.
          const i = row as typeof row & {
            discount?: number | null
            taxable?: boolean | null
            tax_category?: 'labor' | 'materials' | 'other' | null
            cost?: number | null
            markup_pct?: number | null
          }
          return {
            id: i.id,
            description: i.description,
            quantity: Number(i.quantity),
            unit: i.unit,
            unit_price: Number(i.unit_price),
            sort_order: i.sort_order,
            price_source: i.price_source ?? null,
            isManuallyEdited: false,
            discount: Number(i.discount ?? 0),
            taxable: i.taxable ?? true,
            tax_category: i.tax_category ?? null,
            cost: i.cost == null ? null : Number(i.cost),
            markup_pct: i.markup_pct == null ? null : Number(i.markup_pct),
          }
        }),
      })),
    }
    const saved = await saveEstimate(payload)
    if (saved && 'error' in saved && saved.error) return { error: saved.error }
  }

  const { error: langError } = await supabase
    .from('estimates')
    .update({ language: targetLanguage })
    .eq('id', estimate.id)
    .eq('company_id', companyId)
  if (langError) {
    console.warn('[translateEstimate] language update failed:', langError)
    return {
      error: 'The texts were translated but the language could not be saved. Try again.',
    }
  }

  revalidatePath(`/projects/${estimate.project_id}`)
  return { ok: true, translated: texts.length }
}
