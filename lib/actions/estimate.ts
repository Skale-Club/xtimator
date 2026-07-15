'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getEstimateById } from '@/lib/queries/estimate'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/lib/money/currency'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { shareLinkExpiryFromNow } from '@/lib/estimates/share-link'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'
import { copyEstimatePhotos } from '@/lib/queries/estimate-photo'
import { saveEstimateSchema, type SaveEstimateInput } from '@/lib/schemas/estimate'

// ---------------------------------------------------------------------------
// Auth helper (same pattern as recording.ts)
// ---------------------------------------------------------------------------

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id, currency_code, default_tax_rate, default_payment_terms, default_warranty_terms, tax_config')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company, claims }
}

// SaveEstimateInput is now inferred from lib/schemas/estimate.ts's zod schema —
// single source of truth for both the compile-time type and the runtime validation
// below (this is a 'use server' action reachable directly via its RPC endpoint,
// bypassing TypeScript, so runtime validation is a real boundary, not redundant).

// ---------------------------------------------------------------------------
// Action 1: saveEstimate (editor auto-save with full math recalc)
// ---------------------------------------------------------------------------

export async function saveEstimate(rawEstimateData: SaveEstimateInput) {
  const parsed = saveEstimateSchema.safeParse(rawEstimateData)
  if (!parsed.success) {
    return { error: `Invalid estimate data: ${parsed.error.issues[0]?.message ?? 'validation failed'}` }
  }
  const estimateData = parsed.data

  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const companyId = company.id as string

  // GUARD-03: recompute ALL math server-side via the SHARED engine (never trust client).
  // Map the editor/DB discount_type ('percentage'|'fixed') to the engine domain
  // ('percent'|'amount'|'none'). Leave taxConfig undefined → flat retrocompat branch
  // (the editor does not surface per-category tax config this phase).
  const engineDiscountType: 'percent' | 'amount' | 'none' =
    estimateData.discount_type === 'percentage'
      ? 'percent'
      : estimateData.discount_type === 'fixed'
        ? 'amount'
        : 'none'

  // Company per-category tax rule (e.g. labor-exempt), same as generate-estimate.ts:
  // a malformed value degrades to null (flat-rate retrocompat) rather than throwing.
  const taxConfig =
    company.tax_config != null ? (company.tax_config as TaxConfig) : null

  const engineResult = computeEstimateTotals(
    estimateData.sections.map((section) => ({
      title: section.title,
      items: section.items.map((item) => ({
        ...item,
        discount: item.discount ?? 0,
        taxable: item.taxable ?? true,
        tax_category: item.tax_category ?? null,
        cost: item.cost ?? null,
        markup_pct: item.markup_pct ?? null,
      })),
    })),
    {
      taxRate: estimateData.tax_rate,
      taxConfig,
      discountType: engineDiscountType,
      discountValue: estimateData.discount_value,
      depositType: estimateData.deposit_type ?? 'none',
      depositValue: estimateData.deposit_value ?? null,
    }
  )

  const subtotal = engineResult.subtotal
  const discountAmount = engineResult.discountAmount
  const taxAmount = engineResult.taxAmount
  const total = engineResult.grandTotal
  const balanceDue = engineResult.balanceDue

  // Re-attach the engine-resolved per-item totals/unit_price to the original section/item
  // shape (preserving id/sort_order/price_source/isManuallyEdited for the persistence paths).
  const calculatedSections = estimateData.sections.map((section, sIdx) => {
    const engineSection = engineResult.sections[sIdx]
    const items = section.items.map((item, iIdx) => {
      const engineItem = engineSection.items[iIdx]
      return {
        ...item,
        unit_price: engineItem.unit_price,
        total: engineItem.total,
      }
    })
    return { ...section, items, subtotal: engineSection.subtotal }
  })

  // Update estimate row.
  //
  // Pre-launch audit fix (B7): last-write-wins concurrency. When the caller
  // supplies expectedUpdatedAt (the editor always does), scope the UPDATE to
  // it — `.eq('updated_at', expectedUpdatedAt)` — so a STALE save (another
  // tab/session already saved this estimate since this client last loaded
  // it) matches ZERO rows instead of silently overwriting the newer version.
  // This check runs BEFORE any section/item insert/update/delete below, so a
  // stale save never reaches the destructive "delete orphaned items/sections
  // not in this payload" step and can't wipe out content the other writer
  // just added.
  let updateQuery = supabase
    .from('estimates')
    .update({
      summary: estimateData.summary,
      notes: estimateData.notes,
      timeline: estimateData.timeline,
      payment_terms: estimateData.payment_terms,
      warranty_terms: estimateData.warranty_terms,
      discount_type: estimateData.discount_type,
      discount_value: estimateData.discount_value,
      discount_amount: discountAmount,
      estimate_date: estimateData.estimate_date,
      estimate_number: estimateData.estimate_number,
      tax_rate: estimateData.tax_rate,
      tax_amount: taxAmount,
      subtotal,
      total,
      // v4.11 deposit (DEP-01): persist the engine-derived deposit config + balance.
      // Retrocompat: deposit_type 'none' / deposit_value null / balance_due === total.
      deposit_type: estimateData.deposit_type ?? 'none',
      deposit_value: estimateData.deposit_value ?? null,
      balance_due: balanceDue,
      // Phase 161 (PRESENT-01/03): pure pass-through -- never touches the
      // totals-engine call above (GUARD-03).
      presentation_settings: estimateData.presentation_settings ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', estimateData.id)

  if (estimateData.expectedUpdatedAt) {
    updateQuery = updateQuery.eq('updated_at', estimateData.expectedUpdatedAt)
  }

  const { data: updatedRows, error: estimateError } = await updateQuery.select('id, updated_at')

  if (estimateError) return { error: 'Failed to save estimate' }

  if (estimateData.expectedUpdatedAt && (!updatedRows || updatedRows.length === 0)) {
    return {
      error:
        'This estimate was changed elsewhere since you last loaded it. Your unsaved changes were NOT applied — reload to see the latest version before continuing.',
      conflict: true as const,
    }
  }

  const savedUpdatedAt =
    (updatedRows?.[0] as { updated_at?: string } | undefined)?.updated_at ?? new Date().toISOString()

  // Get the project_id for this estimate (for project total update + revalidation)
  const { data: estimateRow } = await supabase
    .from('estimates')
    .select('project_id')
    .eq('id', estimateData.id)
    .single()

  const projectId = (estimateRow?.project_id as string) ?? null

  // Upsert sections
  const incomingSectionIds: string[] = []
  for (const section of calculatedSections) {
    const isNew = section.id.startsWith('temp-')

    if (isNew) {
      const { data: newSection, error: sectionError } = await supabase
        .from('estimate_sections')
        .insert({
          estimate_id: estimateData.id,
          company_id: companyId,
          title: section.title,
          sort_order: section.sort_order,
          subtotal: section.subtotal,
        })
        .select('id')
        .single()

      if (sectionError || !newSection) {
        return { error: 'Failed to save section' }
      }

      const newSectionId = newSection.id as string
      incomingSectionIds.push(newSectionId)

      // Insert items for new section
      if (section.items.length > 0) {
        const itemRows = section.items.map((item, idx) => ({
          section_id: newSectionId,
          company_id: companyId,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total: item.total,
          sort_order: idx,
          price_source: item.isManuallyEdited ? null : (item.price_source ?? null),
          // v4.11 advanced-pricing columns (no-op defaults → byte-identical retrocompat).
          taxable: item.taxable ?? true,
          tax_category: item.tax_category ?? null,
          discount: item.discount ?? 0,
          cost: item.cost ?? null,
          markup_pct: item.markup_pct ?? null,
        }))
        const { error: itemsError } = await supabase
          .from('estimate_items')
          .insert(itemRows)
        if (itemsError) return { error: 'Failed to save items' }
      }
    } else {
      incomingSectionIds.push(section.id)

      // Update existing section
      const { error: sectionError } = await supabase
        .from('estimate_sections')
        .update({
          title: section.title,
          sort_order: section.sort_order,
          subtotal: section.subtotal,
        })
        .eq('id', section.id)

      if (sectionError) return { error: 'Failed to update section' }

      // Upsert items for existing section
      const incomingItemIds: string[] = []
      for (const item of section.items) {
        const isNewItem = item.id.startsWith('temp-')

        if (isNewItem) {
          const { data: newItem, error: itemError } = await supabase
            .from('estimate_items')
            .insert({
              section_id: section.id,
              company_id: companyId,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              total: item.total,
              sort_order: item.sort_order,
              price_source: item.isManuallyEdited ? null : (item.price_source ?? null),
              // v4.11 advanced-pricing columns (no-op defaults → byte-identical retrocompat).
              taxable: item.taxable ?? true,
              tax_category: item.tax_category ?? null,
              discount: item.discount ?? 0,
              cost: item.cost ?? null,
              markup_pct: item.markup_pct ?? null,
            })
            .select('id')
            .single()

          if (itemError || !newItem) return { error: 'Failed to save item' }
          incomingItemIds.push(newItem.id as string)
        } else {
          incomingItemIds.push(item.id)
          const { error: itemError } = await supabase
            .from('estimate_items')
            .update({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              total: item.total,
              sort_order: item.sort_order,
              price_source: item.isManuallyEdited ? null : (item.price_source ?? null),
              // v4.11 advanced-pricing columns (no-op defaults → byte-identical retrocompat).
              taxable: item.taxable ?? true,
              tax_category: item.tax_category ?? null,
              discount: item.discount ?? 0,
              cost: item.cost ?? null,
              markup_pct: item.markup_pct ?? null,
            })
            .eq('id', item.id)
          if (itemError) return { error: 'Failed to update item' }
        }
      }

      // Delete orphaned items within this section
      const { data: existingItems } = await supabase
        .from('estimate_items')
        .select('id')
        .eq('section_id', section.id)

      if (existingItems) {
        const orphanedItemIds = existingItems
          .map((i) => i.id as string)
          .filter((id) => !incomingItemIds.includes(id))

        if (orphanedItemIds.length > 0) {
          await supabase
            .from('estimate_items')
            .delete()
            .in('id', orphanedItemIds)
        }
      }
    }
  }

  // Delete orphaned sections (items cascade-delete with their section)
  const { data: existingSections } = await supabase
    .from('estimate_sections')
    .select('id')
    .eq('estimate_id', estimateData.id)

  if (existingSections) {
    const orphanedSectionIds = existingSections
      .map((s) => s.id as string)
      .filter((id) => !incomingSectionIds.includes(id))

    if (orphanedSectionIds.length > 0) {
      await supabase
        .from('estimate_sections')
        .delete()
        .in('id', orphanedSectionIds)
    }
  }

  // Update project total
  if (projectId) {
    await supabase
      .from('projects')
      .update({ total })
      .eq('id', projectId)

    revalidatePath(`/projects/${projectId}`)
  }

  return { data: { total, updated_at: savedUpdatedAt } }
}

// ---------------------------------------------------------------------------
// Action 2: createBlankEstimate (manual fallback, per D-11 / AI-09)
// ---------------------------------------------------------------------------

export async function createBlankEstimate(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company, claims } = ctx
  const companyId = company.id as string

  // Idempotency guard — the lazy auto-create path (EstimateTab) may fire more
  // than once (React strict-mode double-invoke, double navigation). If a current
  // estimate already exists for this project, return it instead of creating a
  // duplicate blank that would shove the existing one into version history.
  const { data: current } = await supabase
    .from('estimates')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .maybeSingle()
  if (current?.id) {
    return { data: { estimateId: current.id as string } }
  }

  // Version carry-forward (Quick-260704-pt2) — capture the currently-current
  // estimate's id before flipping it, so its attached photos can be copied
  // onto the new version below.
  const { data: previousCurrent } = await supabase
    .from('estimates')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .maybeSingle()

  // Mark existing estimates as not current
  await supabase
    .from('estimates')
    .update({ is_current: false })
    .eq('project_id', projectId)

  // Get next version number
  const { data: existingEstimates } = await supabase
    .from('estimates')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = (existingEstimates?.[0]?.version ?? 0) + 1

  // Company defaults
  const taxRate = Number(company.default_tax_rate) || 0
  const paymentTerms = (company.default_payment_terms as string) ?? null
  const warrantyTerms = (company.default_warranty_terms as string) ?? null

  // Insert estimate
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      project_id: projectId,
      company_id: companyId,
      currency_code: normalizeCurrencyCode(company.currency_code ?? DEFAULT_CURRENCY_CODE),
      version: nextVersion,
      is_current: true,
      status: 'draft',
      workflow_status: 'draft',
      tax_rate: taxRate,
      payment_terms: paymentTerms,
      warranty_terms: warrantyTerms,
      subtotal: 0,
      discount_value: 0,
      discount_amount: 0,
      tax_amount: 0,
      total: 0,
      created_by_user_id: claims.sub,
    })
    .select('id')
    .single()

  if (estimateError || !estimate) {
    return { error: 'Failed to create estimate' }
  }

  const estimateId = estimate.id as string

  // Insert default section
  const { data: section, error: sectionError } = await supabase
    .from('estimate_sections')
    .insert({
      estimate_id: estimateId,
      company_id: companyId,
      title: 'General',
      sort_order: 0,
      subtotal: 0,
    })
    .select('id')
    .single()

  if (sectionError || !section) {
    return { error: 'Failed to create default section' }
  }

  // Insert default item
  const { error: itemError } = await supabase
    .from('estimate_items')
    .insert({
      section_id: section.id,
      company_id: companyId,
      description: '',
      quantity: 1,
      unit: 'each',
      unit_price: 0,
      total: 0,
      sort_order: 0,
    })

  if (itemError) {
    return { error: 'Failed to create default item' }
  }

  // Version carry-forward — copy the previous current version's attached
  // photos onto the new version (independent rows, own remove lifecycle).
  if (previousCurrent?.id) {
    await copyEstimatePhotos(supabase, previousCurrent.id, estimateId, companyId)
  }

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_created_blank',
    metadata: { version: nextVersion },
  })

  // Mirror estimate activity into Xphere CRM (fire-and-forget).
  dispatchXphereSync(companyId, 'estimate.created')

  revalidatePath(`/projects/${projectId}`)
  return { data: { estimateId } }
}

// ---------------------------------------------------------------------------
// Action 3: deleteEstimateSection
// ---------------------------------------------------------------------------

export async function deleteEstimateSection(sectionId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get section's estimate_id before deletion
  const { data: section } = await supabase
    .from('estimate_sections')
    .select('estimate_id')
    .eq('id', sectionId)
    .single()

  if (!section) return { error: 'Section not found' }

  const estimateId = section.estimate_id as string

  // Delete section (items cascade via FK)
  const { error: deleteError } = await supabase
    .from('estimate_sections')
    .delete()
    .eq('id', sectionId)

  if (deleteError) return { error: 'Failed to delete section' }

  // Recalculate estimate totals
  return recalculateEstimateTotals(supabase, estimateId)
}

// ---------------------------------------------------------------------------
// Action 4: deleteEstimateItem
// ---------------------------------------------------------------------------

export async function deleteEstimateItem(itemId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get item's section_id before deletion
  const { data: item } = await supabase
    .from('estimate_items')
    .select('section_id')
    .eq('id', itemId)
    .single()

  if (!item) return { error: 'Item not found' }

  const sectionId = item.section_id as string

  // Delete item
  const { error: deleteError } = await supabase
    .from('estimate_items')
    .delete()
    .eq('id', itemId)

  if (deleteError) return { error: 'Failed to delete item' }

  // Get estimate_id from section — recalculateEstimateTotals recomputes this
  // section's subtotal (and every other section's) itself, so no separate
  // manual subtotal patch is needed here.
  const { data: sectionRow } = await supabase
    .from('estimate_sections')
    .select('estimate_id')
    .eq('id', sectionId)
    .single()

  if (!sectionRow) return { error: 'Section not found after update' }

  return recalculateEstimateTotals(
    supabase,
    sectionRow.estimate_id as string
  )
}

// ---------------------------------------------------------------------------
// Helper: recalculate estimate totals from its sections
// ---------------------------------------------------------------------------

/**
 * Delegates to the SAME shared engine as saveEstimate (GUARD-03) instead of
 * reimplementing totals math. The prior inline version summed persisted
 * section.subtotal values and applied a flat discount+tax formula, which
 * silently ignored the company's per-category tax_config and never touched
 * deposit_type/deposit_value — so balance_due went stale (still reflecting
 * the pre-delete total) whenever a deposit was configured.
 */
async function recalculateEstimateTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string
) {
  const { data: estimate } = await supabase
    .from('estimates')
    .select(
      'discount_type, discount_value, tax_rate, deposit_type, deposit_value, project_id, company_id'
    )
    .eq('id', estimateId)
    .single()

  if (!estimate) return { error: 'Estimate not found' }

  const { data: company } = await supabase
    .from('companies')
    .select('tax_config')
    .eq('id', estimate.company_id as string)
    .single()

  const { data: sections } = await supabase
    .from('estimate_sections')
    .select(
      'id, title, items:estimate_items(quantity, unit_price, discount, taxable, tax_category, cost, markup_pct)'
    )
    .eq('estimate_id', estimateId)

  // Editor/DB domain ('percentage'|'fixed') → engine domain ('percent'|'amount'|'none'),
  // same mapping as saveEstimate.
  const engineDiscountType: 'percent' | 'amount' | 'none' =
    estimate.discount_type === 'percentage'
      ? 'percent'
      : estimate.discount_type === 'fixed'
        ? 'amount'
        : 'none'

  const taxConfig =
    company?.tax_config != null ? (company.tax_config as TaxConfig) : null

  const engineResult = computeEstimateTotals(
    (sections ?? []).map((section) => ({
      title: section.title as string,
      items: ((section.items ?? []) as Array<Record<string, unknown>>).map((item) => ({
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount: (item.discount as number | null) ?? 0,
        taxable: (item.taxable as boolean | null) ?? true,
        tax_category: (item.tax_category as 'labor' | 'materials' | 'other' | null) ?? null,
        cost: (item.cost as number | null) ?? null,
        markup_pct: (item.markup_pct as number | null) ?? null,
      })),
    })),
    {
      taxRate: Number(estimate.tax_rate),
      taxConfig,
      discountType: engineDiscountType,
      discountValue: Number(estimate.discount_value ?? 0),
      depositType: (estimate.deposit_type as 'none' | 'percent' | 'amount' | null) ?? 'none',
      depositValue: (estimate.deposit_value as number | null) ?? null,
    }
  )

  const { subtotal, discountAmount, taxAmount, grandTotal: total, balanceDue } = engineResult

  await Promise.all(
    (sections ?? []).map((section, idx) =>
      supabase
        .from('estimate_sections')
        .update({ subtotal: engineResult.sections[idx].subtotal })
        .eq('id', section.id as string)
    )
  )

  await supabase
    .from('estimates')
    .update({
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
      balance_due: balanceDue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', estimateId)

  // Update project total
  const projectId = estimate.project_id as string
  if (projectId) {
    await supabase
      .from('projects')
      .update({ total })
      .eq('id', projectId)

    revalidatePath(`/projects/${projectId}`)
  }

  return { data: { total } }
}

// ---------------------------------------------------------------------------
// Action 5: getEstimateByIdAction (for version switching in the editor)
// ---------------------------------------------------------------------------

export async function getEstimateByIdAction(
  estimateId: string
): Promise<{ data?: EstimateWithSections; error?: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const estimate = await getEstimateById(supabase, estimateId)
  if (!estimate) return { error: 'Estimate not found' }

  return { data: estimate }
}

// ---------------------------------------------------------------------------
// Action 6: markAsSentAction (mark estimate as sent without emailing)
// ---------------------------------------------------------------------------

export async function markAsSentAction(estimateId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const companyId = company.id as string

  // Fetch estimate to get project_id
  const { data: estimate } = await supabase
    .from('estimates')
    .select('project_id')
    .eq('id', estimateId)
    .single()

  if (!estimate) return { error: 'Estimate not found' }

  const projectId = estimate.project_id as string

  // Update estimate sent_at + refresh the share-link expiry (re-sending revives
  // an expired link — the natural "regenerate link" path).
  const { error: updateError } = await supabase
    .from('estimates')
    .update({ sent_at: new Date().toISOString(), share_expires_at: shareLinkExpiryFromNow() })
    .eq('id', estimateId)

  if (updateError) return { error: 'Failed to mark estimate as sent' }

  // Update project status to 'sent'
  await supabase
    .from('projects')
    .update({ status: 'sent' })
    .eq('id', projectId)

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_marked_sent',
    metadata: { marked_manually: true },
  })

  // Mirror the estimate-sent activity into Xphere CRM (fire-and-forget).
  dispatchXphereSync(companyId, 'estimate.sent')

  // Phase 163 (SENDHUB-03): also record this as an estimate_deliveries row.
  // channel: 'manual' + format: null are the widened enum values from the
  // 20260709000001 migration. provider: 'client' -- no network provider used.
  // This is the 6th side effect; it fires AFTER the 5 existing ones (sent_at
  // update, projects.status, estimate_activity, Xphere sync) but BEFORE the
  // revalidatePath below, so the revalidated view sees the new row.
  // Non-fatal: mark-as-sent already succeeded via the 5 side-effects above --
  // a delivery-log insert failure must NEVER regress the mark-as-sent path.
  try {
    const { error: delErr } = await supabase.from('estimate_deliveries').insert({
      estimate_id: estimateId,
      company_id: companyId,
      channel: 'manual',
      format: null,
      provider: 'client',
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    if (delErr) {
      console.error('[163-05] markAsSentAction delivery-log insert failed', delErr)
    }
  } catch (err) {
    console.error('[163-05] markAsSentAction delivery-log insert threw', err)
  }

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Action 7 (Phase 163 SENDHUB-03): logDeliveryAction
// ---------------------------------------------------------------------------
//
// Records a copy/open/download client-side delivery-action into
// estimate_deliveries. Provider 'client' + widened channel enum ('copy',
// 'open', 'download') come from the 20260709000001 migration.
//
// Non-throwing: the caller (hub button) should never see a failure toast for
// a delivery-log write. If it fails, we log to server console and move on --
// the UX has already succeeded (the URL was copied / the tab was opened / the
// PDF is downloading). Returns `void`.
//
// Auth: reuses getAuthContext -- the caller must be an authenticated company
// member, and the estimate must belong to that company (RLS enforces it).

export async function logDeliveryAction(input: {
  estimateId: string
  format: 'online_link' | 'pdf' | 'plain_text'
  channel: 'copy' | 'open' | 'download'
}): Promise<void> {
  try {
    // Narrow-guard the input at the action boundary. Callers are TypeScript-
    // typed but this is a server action -- browser payload is untrusted.
    if (!input || typeof input.estimateId !== 'string' || !input.estimateId) {
      console.error('[163-05] logDeliveryAction: missing estimateId')
      return
    }
    if (!['online_link', 'pdf', 'plain_text'].includes(input.format)) {
      console.error('[163-05] logDeliveryAction: invalid format', input.format)
      return
    }
    if (!['copy', 'open', 'download'].includes(input.channel)) {
      console.error('[163-05] logDeliveryAction: invalid channel', input.channel)
      return
    }

    const ctx = await getAuthContext()
    if ('error' in ctx) {
      console.error('[163-05] logDeliveryAction: auth failed', ctx.error)
      return
    }
    const { supabase, company } = ctx
    const companyId = company.id as string

    // Verify the estimate belongs to this company (RLS also enforces it, but
    // this gives us a clear early-return path with logging).
    const { data: est, error: estErr } = await supabase
      .from('estimates')
      .select('id, company_id')
      .eq('id', input.estimateId)
      .single()
    if (estErr || !est || est.company_id !== companyId) {
      console.error(
        '[163-05] logDeliveryAction: estimate not found or wrong company',
        estErr,
      )
      return
    }

    const { error: insErr } = await supabase.from('estimate_deliveries').insert({
      estimate_id: input.estimateId,
      company_id: companyId,
      channel: input.channel,
      format: input.format,
      provider: 'client',
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    if (insErr) {
      console.error('[163-05] logDeliveryAction insert failed', insErr)
    }
  } catch (err) {
    console.error('[163-05] logDeliveryAction threw', err)
  }
}
