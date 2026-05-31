'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getEstimateById } from '@/lib/queries/estimate'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/lib/money/currency'
import { getActiveCompanyId } from '@/lib/queries/active-company'

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
    .select('id, currency_code, default_tax_rate, default_payment_terms, default_warranty_terms')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

interface SaveItemInput {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  sort_order: number
  price_source: 'price_book' | 'ai_estimate' | null
  isManuallyEdited?: boolean
}

interface SaveSectionInput {
  id: string
  title: string
  sort_order: number
  items: SaveItemInput[]
}

interface SaveEstimateInput {
  id: string
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  discount_type: string | null
  discount_value: number
  tax_rate: number
  sections: SaveSectionInput[]
  estimate_date: string | null
  estimate_number: string | null
}

// ---------------------------------------------------------------------------
// Action 1: saveEstimate (editor auto-save with full math recalc)
// ---------------------------------------------------------------------------

export async function saveEstimate(estimateData: SaveEstimateInput) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const companyId = company.id as string

  // SEED-028 Phase A: block writes on consolidated estimates.
  const { data: workflowRow } = await supabase
    .from('estimates')
    .select('workflow_status')
    .eq('id', estimateData.id)
    .single()
  if (workflowRow?.workflow_status === 'consolidated') {
    return { error: 'This estimate is consolidated. Create a new version to make changes.' }
  }

  // Recalculate all math server-side (never trust client)
  const calculatedSections = estimateData.sections.map((section) => {
    const items = section.items.map((item) => ({
      ...item,
      total: roundCents(item.quantity * item.unit_price),
    }))
    const sectionSubtotal = roundCents(
      items.reduce((sum, item) => sum + item.total, 0)
    )
    return { ...section, items, subtotal: sectionSubtotal }
  })

  const subtotal = roundCents(
    calculatedSections.reduce((sum, s) => sum + s.subtotal, 0)
  )

  let discountAmount = 0
  if (estimateData.discount_type === 'percentage') {
    discountAmount = roundCents(
      (subtotal * estimateData.discount_value) / 100
    )
  } else if (estimateData.discount_type === 'fixed') {
    discountAmount = estimateData.discount_value
  }

  const taxAmount = roundCents(
    (subtotal - discountAmount) * estimateData.tax_rate
  )
  const total = roundCents(subtotal - discountAmount + taxAmount)

  // Update estimate row
  const { error: estimateError } = await supabase
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', estimateData.id)

  if (estimateError) return { error: 'Failed to save estimate' }

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

  return { data: { total } }
}

// ---------------------------------------------------------------------------
// Action 2: createBlankEstimate (manual fallback, per D-11 / AI-09)
// ---------------------------------------------------------------------------

export async function createBlankEstimate(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const companyId = company.id as string

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

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_created_blank',
    metadata: { version: nextVersion },
  })

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

  // Recalculate section subtotal
  const { data: remainingItems } = await supabase
    .from('estimate_items')
    .select('total')
    .eq('section_id', sectionId)

  const sectionSubtotal = roundCents(
    (remainingItems ?? []).reduce(
      (sum, i) => sum + Number(i.total),
      0
    )
  )

  await supabase
    .from('estimate_sections')
    .update({ subtotal: sectionSubtotal })
    .eq('id', sectionId)

  // Get estimate_id from section
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

async function recalculateEstimateTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string
) {
  // Get all sections for this estimate
  const { data: sections } = await supabase
    .from('estimate_sections')
    .select('subtotal')
    .eq('estimate_id', estimateId)

  const subtotal = roundCents(
    (sections ?? []).reduce(
      (sum, s) => sum + Number(s.subtotal),
      0
    )
  )

  // Get current estimate for discount and tax info
  const { data: estimate } = await supabase
    .from('estimates')
    .select(
      'discount_type, discount_value, tax_rate, project_id'
    )
    .eq('id', estimateId)
    .single()

  if (!estimate) return { error: 'Estimate not found' }

  let discountAmount = 0
  if (estimate.discount_type === 'percentage') {
    discountAmount = roundCents(
      (subtotal * Number(estimate.discount_value)) / 100
    )
  } else if (estimate.discount_type === 'fixed') {
    discountAmount = Number(estimate.discount_value)
  }

  const taxAmount = roundCents(
    (subtotal - discountAmount) * Number(estimate.tax_rate)
  )
  const total = roundCents(subtotal - discountAmount + taxAmount)

  await supabase
    .from('estimates')
    .update({
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
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

  // Update estimate sent_at
  const { error: updateError } = await supabase
    .from('estimates')
    .update({ sent_at: new Date().toISOString() })
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

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Action 7: consolidateEstimate (SEED-028 Phase A)
//
// Locks a draft estimate to read-only. After consolidation, the estimate
// becomes sendable (PDF / email / SMS / share) and cannot be edited in place.
// To make further changes, the user creates a new draft version from this one.
// ---------------------------------------------------------------------------

export async function consolidateEstimate(estimateId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const companyId = company.id as string

  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id, company_id, workflow_status, version')
    .eq('id', estimateId)
    .single()

  if (!estimate) return { error: 'Estimate not found' }
  if (estimate.company_id !== companyId) return { error: 'Unauthorized' }
  if (estimate.workflow_status === 'consolidated') {
    return { error: 'Estimate is already consolidated' }
  }

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = (claimsData?.claims?.sub as string | undefined) ?? null

  const { error: updateError } = await supabase
    .from('estimates')
    .update({
      workflow_status: 'consolidated',
      consolidated_at: new Date().toISOString(),
      consolidated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', estimateId)

  if (updateError) return { error: 'Failed to consolidate estimate' }

  await supabase.from('estimate_activity').insert({
    project_id: estimate.project_id,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_consolidated',
    metadata: { version: estimate.version },
  })

  revalidatePath(`/projects/${estimate.project_id}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Action 8: createNewDraftVersion (SEED-028 Phase A)
//
// Creates a fresh draft v(n+1) by deep-copying a source estimate (typically a
// consolidated one). If a draft already exists for the project, returns its
// id instead — there is at most one active draft per project.
// ---------------------------------------------------------------------------

export async function createNewDraftVersion(sourceEstimateId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const companyId = company.id as string

  const source = await getEstimateById(supabase, sourceEstimateId)
  if (!source) return { error: 'Source estimate not found' }
  if (source.company_id !== companyId) return { error: 'Unauthorized' }

  const projectId = source.project_id

  // If a draft already exists for this project, return it — only one active
  // draft per project (matches the SQL unique index).
  const { data: existingDraft } = await supabase
    .from('estimates')
    .select('id')
    .eq('project_id', projectId)
    .eq('workflow_status', 'draft')
    .eq('is_current', true)
    .maybeSingle()

  if (existingDraft?.id) {
    return { data: { estimateId: existingDraft.id as string, reused: true } }
  }

  // Mark all existing estimates as not current before creating the new draft.
  await supabase
    .from('estimates')
    .update({ is_current: false })
    .eq('project_id', projectId)

  const { data: latest } = await supabase
    .from('estimates')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = (latest?.[0]?.version ?? source.version) + 1

  const { data: newEstimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      project_id: projectId,
      company_id: companyId,
      currency_code: normalizeCurrencyCode(source.currency_code ?? company.currency_code),
      version: nextVersion,
      is_current: true,
      status: 'draft',
      workflow_status: 'draft',
      language: source.language,
      summary: source.summary,
      notes: source.notes,
      timeline: source.timeline,
      payment_terms: source.payment_terms,
      warranty_terms: source.warranty_terms,
      subtotal: source.subtotal,
      discount_type: source.discount_type,
      discount_value: source.discount_value,
      discount_amount: source.discount_amount,
      tax_rate: source.tax_rate,
      tax_amount: source.tax_amount,
      total: source.total,
    })
    .select('id')
    .single()

  if (estimateError || !newEstimate) {
    return { error: 'Failed to create new draft version' }
  }

  const newEstimateId = newEstimate.id as string

  // Deep-copy sections and items.
  for (const section of source.sections) {
    const { data: newSection, error: sectionError } = await supabase
      .from('estimate_sections')
      .insert({
        estimate_id: newEstimateId,
        company_id: companyId,
        title: section.title,
        sort_order: section.sort_order,
        subtotal: section.subtotal,
      })
      .select('id')
      .single()

    if (sectionError || !newSection) {
      return { error: 'Failed to copy section into new draft' }
    }

    if (section.items.length > 0) {
      const itemRows = section.items.map((item, idx) => ({
        section_id: newSection.id as string,
        company_id: companyId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: idx,
        price_source: item.price_source ?? null,
      }))
      const { error: itemsError } = await supabase
        .from('estimate_items')
        .insert(itemRows)
      if (itemsError) {
        return { error: 'Failed to copy items into new draft' }
      }
    }
  }

  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: companyId,
    estimate_id: newEstimateId,
    event_type: 'estimate_new_version_created',
    metadata: { version: nextVersion, source_version: source.version },
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: { estimateId: newEstimateId, reused: false } }
}
