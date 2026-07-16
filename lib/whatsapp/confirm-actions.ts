/**
 * Pure DB action functions for the WhatsApp confirmation flow.
 * Each function performs its DB work and side effects (e.g. delivering to the client),
 * but does NOT send any WhatsApp message to the owner. The agent in agent.ts reads
 * the return value and crafts a single owner reply that may combine multiple actions.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { generateAndUploadEstimatePDF } from '@/lib/whatsapp/pdf-delivery'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import { formatMoney } from '@/lib/money/currency'
import { getWhatsAppAccountStatus } from '@/lib/whatsapp/account-registry'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'
import {
  getNumberedEstimate,
  resolveItem,
  resolveSection,
  type NumberedEstimate,
} from '@/lib/whatsapp/estimate-numbering'

export type Session = {
  id: string
  state: string
  draft_project_id: string | null
  draft_estimate_id: string | null
}

// ---------------------------------------------------------------------------
// Estimate context — read-only snapshot used in the agent system prompt
// ---------------------------------------------------------------------------

export type EstimateContext = {
  total: number | null
  currency_code: string | null
  summary: string | null
  timeline: string | null
  payment_terms: string | null
  deposit_type: string | null
  deposit_value: number | null
  balance_due: number | null
  sections: Array<{ title: string; subtotal: number }> | null
}

export async function actionGetEstimateContext(
  supabase: SupabaseClient,
  estimateId: string
): Promise<EstimateContext | null> {
  const { data } = await supabase
    .from('estimates')
    .select('total, currency_code, summary, timeline, payment_terms, deposit_type, deposit_value, balance_due, sections:estimate_sections(title, subtotal)')
    .eq('id', estimateId)
    .single()
  return data as EstimateContext | null
}

export function formatEstimateContext(ctx: EstimateContext | null): string {
  if (!ctx) return 'No estimate loaded.'
  const total = formatMoney(ctx.total ?? 0, ctx.currency_code)
  const sections = (ctx.sections ?? [])
    .map((s) => `  • ${s.title}: ${formatMoney(s.subtotal, ctx.currency_code)}`)
    .join('\n')
  return [
    `Total: ${total}`,
    ctx.summary ? `Summary: ${ctx.summary}` : null,
    ctx.timeline ? `Timeline: ${ctx.timeline}` : null,
    ctx.payment_terms ? `Payment: ${ctx.payment_terms}` : null,
    sections ? `Sections:\n${sections}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------------------
// send — delivers to client, marks sent, deletes session
// ---------------------------------------------------------------------------

export type SendResult = {
  shareUrl: string
  deliveredToClient: boolean
  clientPhone: string | null
  clientName: string | null
}

export async function actionSend(
  session: Session,
  companyId: string,
  supabase: SupabaseClient
): Promise<SendResult> {
  const { draft_estimate_id, draft_project_id } = session
  if (!draft_estimate_id || !draft_project_id) {
    throw new Error('No estimate to send.')
  }

  const [estimateResult, projectResult, accountStatus, companyResult] = await Promise.all([
    supabase
      .from('estimates')
      .select(`
        id, share_token, public_slug_token, total, subtotal, tax_rate, tax_amount,
        deposit_type, deposit_value, balance_due, currency_code, summary,
        payment_terms, timeline, language,
        sections:estimate_sections(
          title, subtotal,
          items:estimate_items(description, quantity, unit, unit_price, total)
        )
      `)
      .eq('id', draft_estimate_id)
      .single(),
    supabase.from('projects').select('id, client_id, name').eq('id', draft_project_id).single(),
    getWhatsAppAccountStatus(companyId),
    supabase.from('companies').select('name, slug').eq('id', companyId).single(),
  ])

  const estimate = estimateResult.data
  const project = projectResult.data
  const deliveryFormat = (accountStatus.deliveryFormat ?? 'share_link') as 'share_link' | 'formatted_text' | 'pdf_attachment'
  const companyName = (companyResult.data?.name as string | null) ?? null

  if (!estimate || !project) throw new Error('Could not load estimate or project.')

  // Consolidate so the public share link works (SEED-028)
  await supabase
    .from('estimates')
    .update({ workflow_status: 'consolidated', consolidated_at: new Date().toISOString() })
    .eq('id', draft_estimate_id)
    .eq('workflow_status', 'draft')

  const shareUrl = `${getCanonicalBaseUrl()}${buildEstimatePublicPath(
    { slug: companyResult.data?.slug ?? null, name: companyName ?? 'Company' },
    { id: draft_estimate_id, public_slug_token: estimate.public_slug_token, share_token: estimate.share_token, project_name: project.name }
  )}`

  let clientPhone: string | null = null
  let clientName: string | null = null
  let clientPreferredLanguage: string | null = null

  if (project.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('phone, name, preferred_language')
      .eq('id', project.client_id)
      .single()
    clientPhone = (client?.phone as string | null) ?? null
    clientName = (client?.name as string | null) ?? null
    clientPreferredLanguage = (client?.preferred_language as string | null) ?? null
  }

  let deliveredToClient = false

  if (clientPhone) {
    if (deliveryFormat === 'pdf_attachment') {
      let pdfDelivered = false
      try {
        const { signedUrl, filename } = await generateAndUploadEstimatePDF(
          draft_estimate_id,
          companyId,
          supabase,
          clientName,
        )
        await sendWhatsAppMessage(clientPhone, {
          type: 'document',
          document: {
            link: signedUrl,
            filename,
            caption: companyName ? `Your estimate from ${companyName}` : 'Your estimate',
          },
        })
        pdfDelivered = true
        deliveredToClient = true
        logOutboundMessage(supabase, {
          companyId,
          contactPhone: clientPhone,
          contactName: clientName,
          clientId: project.client_id as string | null,
          body: companyName ? `Your estimate from ${companyName}` : 'Your estimate',
          msgType: 'document',
          status: 'sent',
        }).catch(() => undefined)
      } catch {
        // fall through to share_link (WAPDF-04)
      }
      if (!pdfDelivered) {
        const body = buildShareLinkMessage(shareUrl, clientName)
        try {
          await sendWhatsAppMessage(clientPhone, { type: 'text', text: { body } })
          deliveredToClient = true
          logOutboundMessage(supabase, {
            companyId,
            contactPhone: clientPhone,
            contactName: clientName,
            clientId: project.client_id as string | null,
            body,
            msgType: 'text',
            status: 'sent',
          }).catch(() => undefined)
        } catch {
          /* non-fatal */
        }
      }
    } else {
      const body =
        deliveryFormat === 'formatted_text'
          ? formatEstimateForWhatsApp(estimate as FormatterEstimate, clientName, companyName)
          : buildShareLinkMessage(shareUrl, clientName)
      try {
        await sendWhatsAppMessage(clientPhone, { type: 'text', text: { body } })
        deliveredToClient = true
        logOutboundMessage(supabase, {
          companyId,
          contactPhone: clientPhone,
          contactName: clientName,
          clientId: project.client_id as string | null,
          body,
          msgType: 'text',
          status: 'sent',
        }).catch(() => undefined)
      } catch {
        /* non-fatal */
      }
    }
  }

  await Promise.all([
    supabase.from('estimates').update({ status: 'sent' }).eq('id', draft_estimate_id),
    supabase.from('projects').update({ status: 'sent' }).eq('id', draft_project_id),
  ])

  // Phase 52 auto-learn: write client's preferred language if unknown
  if (project.client_id && !clientPreferredLanguage && estimate.language) {
    await supabase
      .from('clients')
      .update({ preferred_language: estimate.language })
      .eq('id', project.client_id)
  }

  await supabase.from('whatsapp_sessions').delete().eq('id', session.id)

  return { shareUrl, deliveredToClient, clientPhone, clientName }
}

// ---------------------------------------------------------------------------
// cancel — discards draft and session
// ---------------------------------------------------------------------------

export async function actionCancel(session: Session, supabase: SupabaseClient): Promise<void> {
  if (session.draft_project_id) {
    await supabase.from('projects').delete().eq('id', session.draft_project_id)
  }
  await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
}

// ---------------------------------------------------------------------------
// update field — patches estimate, returns refreshed context
// ---------------------------------------------------------------------------

export type EditableFields = {
  total?: number
  timeline?: string
  payment_terms?: string
  summary?: string
}

export async function actionUpdateField(
  session: Session,
  supabase: SupabaseClient,
  patch: EditableFields
): Promise<EstimateContext | null> {
  if (!session.draft_estimate_id) throw new Error('No estimate to update.')
  const { error } = await supabase
    .from('estimates')
    .update(patch)
    .eq('id', session.draft_estimate_id)
  if (error) throw new Error(`Update failed: ${error.message}`)
  return actionGetEstimateContext(supabase, session.draft_estimate_id)
}

// ---------------------------------------------------------------------------
// set client — upserts client row and links to project
// ---------------------------------------------------------------------------

export type SetClientResult = {
  clientId: string
  name: string
  phone: string
  isNew: boolean
}

export async function actionSetClient(
  session: Session,
  companyId: string,
  supabase: SupabaseClient,
  name: string,
  phone: string
): Promise<SetClientResult> {
  if (!session.draft_project_id) throw new Error('No project to attach client to.')

  const { data: existing } = await supabase
    .from('clients')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle()

  let clientId: string
  let isNew = false

  if (existing) {
    clientId = existing.id as string
    if ((existing.name as string | null) !== name) {
      await supabase.from('clients').update({ name }).eq('id', clientId)
    }
  } else {
    const { data: created, error } = await supabase
      .from('clients')
      .insert({ company_id: companyId, name, phone })
      .select('id')
      .single()
    if (error || !created) throw new Error(`Could not create client: ${error?.message}`)
    clientId = (created as { id: string }).id
    isNew = true
  }

  const { error: linkErr } = await supabase
    .from('projects')
    .update({ client_id: clientId })
    .eq('id', session.draft_project_id)
  if (linkErr) throw new Error(`Could not link client: ${linkErr.message}`)

  return { clientId, name, phone, isNew }
}

// ---------------------------------------------------------------------------
// regenerate — rebuilds estimate from original recording
// ---------------------------------------------------------------------------

export type RegenerateResult = {
  newEstimateId: string
  context: EstimateContext | null
}

export async function actionRegenerate(
  session: Session,
  companyId: string,
  supabase: SupabaseClient
): Promise<RegenerateResult> {
  if (!session.draft_project_id) throw new Error('No project to regenerate.')

  if (session.draft_estimate_id) {
    await supabase.from('estimates').delete().eq('id', session.draft_estimate_id)
  }

  const result = await generateEstimateForProject(companyId, session.draft_project_id)
  const newEstimateId = result.estimateId

  await supabase
    .from('whatsapp_sessions')
    .update({ draft_estimate_id: newEstimateId })
    .eq('id', session.id)

  const context = await actionGetEstimateContext(supabase, newEstimateId)
  return { newEstimateId, context }
}

// ---------------------------------------------------------------------------
// Section/item edits (Phase 51 follow-up) — resolve N.M via the shared
// numbering invariant (lib/whatsapp/estimate-numbering.ts), mutate the row, then
// recompute totals through the SAME engine the editor/generation use.
// ---------------------------------------------------------------------------

/**
 * Recompute + persist an estimate's totals after a section/item mutation.
 *
 * Reuses the single authoritative totals engine `computeEstimateTotals`
 * (lib/estimate/compute-totals.ts) — NOT a reimplementation. This mirrors the
 * editor's `recalculateEstimateTotals` (lib/actions/estimate.ts): same field
 * mapping, same 'percentage'|'fixed' → engine discount-type mapping, same
 * tax_config sourcing. It is a separate function (not a shared import) because
 * the editor version is bound to the authed request client + `revalidatePath`
 * and does NOT persist per-item totals — this WhatsApp/service-client path runs
 * inside Inngest (no request context) and DOES need to persist the mutated
 * item's total. Persisting every item.total/section.subtotal is idempotent.
 */
async function recomputeEstimateTotals(
  supabase: SupabaseClient,
  estimateId: string,
  companyId: string
): Promise<void> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select(
      'discount_type, discount_value, tax_rate, deposit_type, deposit_value, project_id, company_id'
    )
    .eq('id', estimateId)
    .single()
  if (!estimate) throw new Error('Estimate not found')

  const { data: company } = await supabase
    .from('companies')
    .select('tax_config')
    .eq('id', (estimate.company_id as string | null) ?? companyId)
    .single()

  const { data: sectionRows } = await supabase
    .from('estimate_sections')
    .select(
      'id, title, items:estimate_items(id, quantity, unit_price, discount, taxable, tax_category, cost, markup_pct)'
    )
    .eq('estimate_id', estimateId)

  const sections = (sectionRows ?? []) as Array<{
    id: string
    title: string | null
    items: Array<Record<string, unknown>> | null
  }>

  // Editor/DB discount domain ('percentage'|'fixed') → engine domain
  // ('percent'|'amount'|'none'). Identical to lib/actions/estimate.ts. Fresh
  // WhatsApp estimates carry discount_type null → 'none' (byte-identical).
  const engineDiscountType: 'percent' | 'amount' | 'none' =
    estimate.discount_type === 'percentage'
      ? 'percent'
      : estimate.discount_type === 'fixed'
        ? 'amount'
        : 'none'

  const taxConfig =
    company?.tax_config != null ? (company.tax_config as TaxConfig) : null

  const engineResult = computeEstimateTotals(
    sections.map((section) => ({
      title: (section.title as string | null) ?? '',
      items: (section.items ?? []).map((item) => ({
        // `id` rides through via the engine's `...item` spread so we can persist
        // each recomputed line total back to its row.
        id: item.id as string,
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

  // Persist per-item totals + per-section subtotals (idempotent). engineResult
  // sections align 1:1 by index with the input `sections`.
  await Promise.all([
    ...engineResult.sections.flatMap((sec) =>
      sec.items.map((item) =>
        supabase
          .from('estimate_items')
          .update({ total: item.total, unit_price: item.unit_price })
          .eq('id', item.id as string)
          .eq('company_id', companyId)
      )
    ),
    ...engineResult.sections.map((sec, idx) =>
      supabase
        .from('estimate_sections')
        .update({ subtotal: sec.subtotal })
        .eq('id', sections[idx].id)
        .eq('company_id', companyId)
    ),
  ])

  await supabase
    .from('estimates')
    .update({
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
      balance_due: balanceDue,
    })
    .eq('id', estimateId)

  const projectId = estimate.project_id as string | null
  if (projectId) {
    await supabase.from('projects').update({ total }).eq('id', projectId)
  }
}

export type ItemEditFields = {
  price?: number
  quantity?: number
  name?: string
}

/**
 * Result of a section/item mutation. On success carries a short human summary
 * plus the REFRESHED numbered breakdown so the agent can re-ground its next
 * reference. On failure carries a user-facing error (e.g. N.M out of range).
 */
export type ItemMutationResult =
  | { ok: false; message: string }
  | { ok: true; message: string; breakdown: NumberedEstimate | null }

/** update_item — resolve N.M and patch price/quantity/name, then recompute. */
export async function actionUpdateItem(
  session: Session,
  companyId: string,
  supabase: SupabaseClient,
  sectionNumber: number,
  itemNumber: number,
  fields: ItemEditFields
): Promise<ItemMutationResult> {
  if (!session.draft_estimate_id) return { ok: false, message: 'No estimate to update.' }
  const numbered = await getNumberedEstimate(supabase, session.draft_estimate_id)
  if (!numbered) return { ok: false, message: 'No estimate loaded.' }

  const res = resolveItem(numbered.sections, sectionNumber, itemNumber)
  if (!res.ok) return { ok: false, message: res.error }
  if (!res.item.id) return { ok: false, message: `Item ${sectionNumber}.${itemNumber} can't be edited (missing id).` }

  const patch: Record<string, unknown> = {}
  if (typeof fields.price === 'number') patch.unit_price = fields.price
  if (typeof fields.quantity === 'number') patch.quantity = fields.quantity
  if (typeof fields.name === 'string' && fields.name.trim()) patch.description = fields.name.trim()
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Nothing to change — specify a new price, quantity, or name.' }
  }

  const { error } = await supabase
    .from('estimate_items')
    .update(patch)
    .eq('id', res.item.id)
    .eq('company_id', companyId)
  if (error) return { ok: false, message: `Update failed: ${error.message}` }

  await recomputeEstimateTotals(supabase, session.draft_estimate_id, companyId)
  const breakdown = await getNumberedEstimate(supabase, session.draft_estimate_id)
  const name = typeof patch.description === 'string' ? patch.description : res.item.description
  return {
    ok: true,
    message: `Updated item ${sectionNumber}.${itemNumber} (${name}).`,
    breakdown,
  }
}

/** add_item — append a new item to section N, then recompute. */
export async function actionAddItem(
  session: Session,
  companyId: string,
  supabase: SupabaseClient,
  sectionNumber: number,
  name: string,
  price: number,
  quantity = 1
): Promise<ItemMutationResult> {
  if (!session.draft_estimate_id) return { ok: false, message: 'No estimate to update.' }
  const numbered = await getNumberedEstimate(supabase, session.draft_estimate_id)
  if (!numbered) return { ok: false, message: 'No estimate loaded.' }

  const res = resolveSection(numbered.sections, sectionNumber)
  if (!res.ok) return { ok: false, message: res.error }
  if (!res.section.id) return { ok: false, message: `Section ${sectionNumber} can't be edited (missing id).` }

  // Reject an empty/whitespace description so a client-facing estimate never
  // gets a blank line item (the tool schema requires `name`, but the LLM could
  // still pass ""/whitespace). Mirrors update_item's name-trim guard.
  const trimmedName = name.trim()
  if (!trimmedName) {
    return { ok: false, message: 'Give the new item a description (e.g. "haul away debris").' }
  }

  const qty = quantity > 0 ? quantity : 1

  // Append AFTER the current last item so the new item takes the next N.M slot.
  // Derive from the ACTUAL max sort_order in the section (not the item count) so
  // a prior removal's sort_order gap can't cause a collision.
  const { data: existingRows } = await supabase
    .from('estimate_items')
    .select('sort_order')
    .eq('section_id', res.section.id)
    .eq('company_id', companyId)
  const maxSortOrder = (existingRows ?? []).reduce(
    (max, r) => Math.max(max, Number((r as { sort_order?: number | null }).sort_order ?? 0)),
    -1
  )
  const nextSortOrder = maxSortOrder + 1

  const { error } = await supabase.from('estimate_items').insert({
    section_id: res.section.id,
    company_id: companyId,
    description: trimmedName,
    quantity: qty,
    unit: null,
    unit_price: price,
    // Placeholder — recomputeEstimateTotals overwrites with the engine value.
    total: Math.round(qty * price * 100) / 100,
    sort_order: nextSortOrder,
    // Owner-added line: no automated price source. The CHECK constraint allows
    // NULL | 'price_book' | 'ai_estimate' | 'researched' — NULL means manual.
    price_source: null,
  })
  if (error) return { ok: false, message: `Couldn't add the item: ${error.message}` }

  await recomputeEstimateTotals(supabase, session.draft_estimate_id, companyId)
  const breakdown = await getNumberedEstimate(supabase, session.draft_estimate_id)
  return {
    ok: true,
    message: `Added "${trimmedName}" to section ${sectionNumber} (${res.section.title}).`,
    breakdown,
  }
}

/** remove_item — resolve N.M and delete it, then recompute. */
export async function actionRemoveItem(
  session: Session,
  companyId: string,
  supabase: SupabaseClient,
  sectionNumber: number,
  itemNumber: number
): Promise<ItemMutationResult> {
  if (!session.draft_estimate_id) return { ok: false, message: 'No estimate to update.' }
  const numbered = await getNumberedEstimate(supabase, session.draft_estimate_id)
  if (!numbered) return { ok: false, message: 'No estimate loaded.' }

  const res = resolveItem(numbered.sections, sectionNumber, itemNumber)
  if (!res.ok) return { ok: false, message: res.error }
  if (!res.item.id) return { ok: false, message: `Item ${sectionNumber}.${itemNumber} can't be removed (missing id).` }

  const removedName = res.item.description
  const { error } = await supabase
    .from('estimate_items')
    .delete()
    .eq('id', res.item.id)
    .eq('company_id', companyId)
  if (error) return { ok: false, message: `Couldn't remove the item: ${error.message}` }

  await recomputeEstimateTotals(supabase, session.draft_estimate_id, companyId)
  const breakdown = await getNumberedEstimate(supabase, session.draft_estimate_id)
  return {
    ok: true,
    message: `Removed item ${sectionNumber}.${itemNumber} (${removedName}).`,
    breakdown,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildShareLinkMessage(shareUrl: string, clientName: string | null): string {
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  return `${greeting}\n\nPlease find your estimate here:\n${shareUrl}\n\nLet us know if you have any questions!`
}
