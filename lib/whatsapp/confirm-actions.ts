/**
 * Pure DB action functions for the WhatsApp confirmation flow.
 * Each function performs its DB work and side effects (e.g. delivering to the client),
 * but does NOT send any WhatsApp message to the owner. The agent in agent.ts reads
 * the return value and crafts a single owner reply that may combine multiple actions.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import { shareLinkExpiryFromNow } from '@/lib/estimates/share-link'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { SendChannel } from '@/lib/notifications/customer-send-gate'
import {
  deliverEstimateToClient,
  describeFailure,
  getClientContacts,
} from '@/lib/notifications/deliver-estimate-to-client'
import { formatMoney, DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/lib/money/currency'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'
import {
  getNumberedEstimate,
  numberSections,
  resolveItem,
  resolveSection,
  type NumberedEstimate,
  type RawItemRow,
  type RawSectionRow,
} from '@/lib/whatsapp/estimate-numbering'
import {
  runClaimedCommandRpc, withSessionCommand, SESSION_COMMAND_ERROR_MESSAGES,
  SessionCommandError, type CommandScope,
} from '@/lib/whatsapp/session-commands'

export type { Session } from '@/lib/whatsapp/session-commands'

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
  estimateId: string,
  companyId?: string,
): Promise<EstimateContext | null> {
  const query = supabase
    .from('estimates')
    .select('total, currency_code, summary, timeline, payment_terms, deposit_type, deposit_value, balance_due, sections:estimate_sections(title, subtotal)')
    .eq('id', estimateId)
  if (companyId) query.eq('company_id', companyId)
  const { data, error } = await query.single()
  if (error) throw new Error('Could not read the estimate', { cause: error })
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
// send — delivers to the CLIENT by email and/or SMS (never WhatsApp), marks sent
// ---------------------------------------------------------------------------

export type SendResult = {
  shareUrl: string
  outcome: 'sent' | 'no_contact' | 'not_delivered' | 'unverified'
  deliveredToClient: boolean
  /** Channels actually used, e.g. ['email', 'sms']. */
  channels: SendChannel[]
  clientName: string | null
  /** Short owner-facing reasons for channels that were skipped or failed. */
  problems: string[]
}

export async function actionSend(
  scope: CommandScope,
  supabase: SupabaseClient,
  language: EstimateLanguage = 'en',
): Promise<SendResult> {
  return withSessionCommand(supabase, scope, 'send', null, async (command) => {
    const { companyId, session } = scope
    const estimateId = session.draft_estimate_id!
    const projectId = session.draft_project_id!
    const [estimateResult, projectResult, companyResult] = await Promise.all([
      supabase.from('estimates').select('id, share_token, public_slug_token')
        .eq('id', estimateId).eq('company_id', companyId).eq('project_id', projectId).single(),
      supabase.from('projects').select('id, client_id, name')
        .eq('id', projectId).eq('company_id', companyId).single(),
      supabase.from('companies').select('name, slug').eq('id', companyId).single(),
    ])
    const { data: estimate } = estimateResult
    const { data: project } = projectResult
    const { data: company } = companyResult
    if (!estimate || !project || !company || estimateResult.error || projectResult.error || companyResult.error) {
      throw new Error('Could not load the estimate, project, or company')
    }

    const shareUrl = `${getCanonicalBaseUrl()}${buildEstimatePublicPath(
      { slug: company.slug ?? null, name: company.name ?? 'Company' },
      { id: estimateId, public_slug_token: estimate.public_slug_token, share_token: estimate.share_token, project_name: project.name }
    )}`
    const contacts = await getClientContacts(supabase, companyId, project.client_id ?? null)
    if (!contacts || (!contacts.email && !contacts.phone)) {
      return { shareUrl, outcome: 'no_contact', deliveredToClient: false, channels: [], clientName: contacts?.clientName ?? null, problems: [] }
    }

    await runClaimedCommandRpc(supabase, 'whatsapp_prepare_estimate_delivery', command, {
      p_client_id: contacts.clientId,
      p_share_expires_at: shareLinkExpiryFromNow(),
    })
    const delivery = await deliverEstimateToClient({
      svc: supabase, companyId, estimateId, projectId, businessName: company.name ?? 'Your contractor', shareUrl, contacts, command,
    })
    const failures = delivery.status === 'no_contact' ? [] : delivery.failed
    const outcome = delivery.status === 'sent' ? 'sent'
      : failures.some((failure) => failure.reason === 'delivery_unverified') ? 'unverified' : 'not_delivered'
    return {
      shareUrl, outcome, deliveredToClient: delivery.status === 'sent',
      channels: delivery.status === 'sent' ? delivery.sent : [],
      clientName: contacts.clientName, problems: failures.map((failure) => describeFailure(failure, language)),
    }
  })
}

// ---------------------------------------------------------------------------
// cancel — closes the WhatsApp session and preserves the project in the app
// ---------------------------------------------------------------------------

export async function actionCancel(scope: CommandScope, supabase: SupabaseClient): Promise<void> {
  await withSessionCommand(supabase, scope, 'cancel', null, async (command) => {
    await runClaimedCommandRpc(supabase, 'whatsapp_cancel_estimate_session', command)
  })
}

export const ESTIMATE_ANSWERED_MESSAGE = SESSION_COMMAND_ERROR_MESSAGES.answered

export type EditableFields = {
  timeline?: string
  payment_terms?: string
  summary?: string
}

export const CHANGE_ESTIMATE_TOTAL_MESSAGE =
  'The total comes from the line items, taxes, and discounts. To change it, tell me which numbered item and price to update, or edit the estimate in the app.'

export async function actionUpdateField(
  scope: CommandScope,
  supabase: SupabaseClient,
  patch: EditableFields,
): Promise<EstimateContext | null> {
  return withSessionCommand(supabase, scope, 'edit', ['header', patch], async (command) => {
    await runClaimedCommandRpc(supabase, 'whatsapp_update_estimate_header', command, { p_patch: patch })
    return actionGetEstimateContext(supabase, scope.session.draft_estimate_id!, scope.companyId)
  })
}

export type SetClientResult = {
  clientId: string
  name: string
  phone: string
  isNew: boolean
}

export async function actionSetClient(
  scope: CommandScope,
  supabase: SupabaseClient,
  name: string,
  phone: string,
): Promise<SetClientResult> {
  const trimmedName = name.trim()
  if (!trimmedName || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new Error('Provide the client name and a phone number with its country code.')
  }
  return withSessionCommand(supabase, scope, 'edit', ['client', trimmedName, phone], async (command) => {
    const result = await runClaimedCommandRpc(supabase, 'whatsapp_set_estimate_client', command, {
      p_name: trimmedName,
      p_phone: phone,
    }) as { client_id?: unknown; is_new?: unknown } | null
    if (typeof result?.client_id !== 'string' || typeof result.is_new !== 'boolean') {
      throw new Error('Could not confirm the client link')
    }
    return { clientId: result.client_id, isNew: result.is_new, name: trimmedName, phone }
  })
}

export type RegenerateResult = {
  newEstimateId: string
  context: EstimateContext | null
}

export async function actionRegenerate(
  scope: CommandScope,
  supabase: SupabaseClient,
): Promise<RegenerateResult> {
  return withSessionCommand(supabase, scope, 'regenerate', null, async (command) => {
    const result = await generateEstimateForProject(scope.companyId, scope.session.draft_project_id!, {
      channel: 'whatsapp',
      whatsappRegeneration: { ...command, previousEstimateId: scope.session.draft_estimate_id! },
    })
    const context = await actionGetEstimateContext(supabase, result.estimateId, scope.companyId)
    return { newEstimateId: result.estimateId, context }
  })
}

export type ItemEditFields = {
  price?: number
  quantity?: number
  name?: string
}

export type ItemMutationResult =
  | { ok: false; message: string }
  | { ok: true; message: string; breakdown: NumberedEstimate | null }

type ItemEdit =
  | { type: 'update'; sectionNumber: number; itemNumber: number; fields: ItemEditFields }
  | { type: 'add'; sectionNumber: number; name: string; price: number; quantity: number }
  | { type: 'remove'; sectionNumber: number; itemNumber: number }

type ItemSnapshot = Required<Pick<RawItemRow, 'description' | 'quantity' | 'unit_price' | 'sort_order'>> & {
  id: string
  discount?: number | null
  taxable?: boolean | null
  tax_category?: 'labor' | 'materials' | 'other' | null
  cost?: number | null
  markup_pct?: number | null
}

type SectionSnapshot = Omit<RawSectionRow, 'items' | 'id'> & { id: string; items: ItemSnapshot[] }

type EstimateEditSnapshot = {
  updated_at: string
  discount_type: string | null
  discount_value: number | null
  tax_rate: number | null
  deposit_type: 'none' | 'percent' | 'amount' | null
  deposit_value: number | null
  currency_code: string | null
  sections: SectionSnapshot[]
}

async function mutateItem(
  scope: CommandScope,
  supabase: SupabaseClient,
  edit: ItemEdit,
): Promise<ItemMutationResult> {
  try {
    return await withSessionCommand(supabase, scope, 'edit', edit, async (command) => {
      const { companyId, session } = scope
      const estimateId = session.draft_estimate_id!
      const [estimateResult, companyResult] = await Promise.all([
        supabase.from('estimates')
          .select('updated_at, discount_type, discount_value, tax_rate, deposit_type, deposit_value, currency_code, sections:estimate_sections(id, title, sort_order, items:estimate_items(id, description, sort_order, quantity, unit_price, discount, taxable, tax_category, cost, markup_pct))')
          .eq('id', estimateId).eq('company_id', companyId).eq('project_id', session.draft_project_id!).single(),
        supabase.from('companies').select('tax_config').eq('id', companyId).single(),
      ])
      if (estimateResult.error || !estimateResult.data || companyResult.error || !companyResult.data) {
        throw new Error('Could not load the estimate pricing details')
      }
      const estimate = estimateResult.data as unknown as EstimateEditSnapshot
      const numbered = numberSections(estimate.sections)
      const sectionResult = resolveSection(numbered, edit.sectionNumber)
      if (!sectionResult.ok) return { ok: false, message: sectionResult.error }
      const section = estimate.sections.find((row) => row.id === sectionResult.section.id)
      if (!section) return { ok: false, message: 'That section is no longer in this estimate.' }

      let changedItem: ItemSnapshot
      let message: string
      if (edit.type === 'add') {
        const description = edit.name.trim()
        if (!description) return { ok: false, message: 'Give the new item a description (e.g. "haul away debris").' }
        if (!Number.isFinite(edit.price) || edit.price < 0 || !Number.isFinite(edit.quantity) || edit.quantity <= 0) {
          return { ok: false, message: 'Enter a valid price and quantity for the new item.' }
        }
        changedItem = {
          id: randomUUID(), description, quantity: edit.quantity, unit_price: edit.price,
          sort_order: Math.max(-1, ...section.items.map((item) => Number(item.sort_order ?? 0))) + 1,
        }
        section.items.push(changedItem)
        message = `Added "${description}" to section ${edit.sectionNumber} (${sectionResult.section.title}).`
      } else {
        const itemResult = resolveItem(numbered, edit.sectionNumber, edit.itemNumber)
        if (!itemResult.ok) return { ok: false, message: itemResult.error }
        const item = section.items.find((row) => row.id === itemResult.item.id)
        if (!item) return { ok: false, message: 'That item is no longer in this estimate.' }
        changedItem = item
        const label = `${edit.sectionNumber}.${edit.itemNumber}`
        if (edit.type === 'remove') {
          section.items = section.items.filter((row) => row.id !== item.id)
          message = `Removed item ${label} (${item.description}).`
        } else {
          const { price, quantity, name } = edit.fields
          if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
            return { ok: false, message: 'Enter a valid price.' }
          }
          if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
            return { ok: false, message: 'Enter a positive quantity.' }
          }
          if (price === undefined && quantity === undefined && !name?.trim()) {
            return { ok: false, message: 'Specify a new price, quantity, or name.' }
          }
          if (price !== undefined) {
            item.unit_price = price
            // At zero the engine would otherwise derive a price from markup.
            if (price === 0) item.markup_pct = null
          }
          if (quantity !== undefined) item.quantity = quantity
          if (name?.trim()) item.description = name.trim()
          message = `Updated item ${label} (${item.description}).`
        }
      }

      const totals = computeEstimateTotals(estimate.sections.map((row) => ({
        title: row.title ?? '',
        items: row.items.map((item) => ({
          id: item.id,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          discount: item.discount ?? 0,
          taxable: item.taxable ?? true,
          tax_category: item.tax_category ?? null,
          cost: item.cost ?? null,
          markup_pct: item.markup_pct ?? null,
        })),
      })), {
        taxRate: Number(estimate.tax_rate),
        taxConfig: companyResult.data.tax_config as TaxConfig | null,
        discountType: estimate.discount_type === 'percentage' ? 'percent' : estimate.discount_type === 'fixed' ? 'amount' : 'none',
        discountValue: Number(estimate.discount_value ?? 0),
        depositType: estimate.deposit_type ?? 'none',
        depositValue: estimate.deposit_value,
        currencyCode: normalizeCurrencyCode(estimate.currency_code ?? DEFAULT_CURRENCY_CODE),
      })

      await runClaimedCommandRpc(supabase, 'whatsapp_commit_estimate_item_edit', command, {
        p_expected_updated_at: estimate.updated_at,
        p_operation: edit.type,
        p_section_id: section.id,
        p_item: { ...changedItem, manual_price: edit.type === 'update' && edit.fields.price !== undefined },
        p_totals: {
          subtotal: totals.subtotal,
          discount_amount: totals.discountAmount,
          tax_amount: totals.taxAmount,
          total: totals.grandTotal,
          balance_due: totals.balanceDue,
        },
        p_sections: totals.sections.map((row, index) => ({ id: estimate.sections[index]!.id, subtotal: row.subtotal })),
        p_items: totals.sections.flatMap((row) => row.items.map((item) => ({
          id: item.id, total: item.total, unit_price: item.unit_price,
        }))),
      })
      return { ok: true, message, breakdown: await getNumberedEstimate(supabase, estimateId) }
    })
  } catch (err) {
    if (err instanceof SessionCommandError) return { ok: false, message: SESSION_COMMAND_ERROR_MESSAGES[err.reason] }
    throw err
  }
}

export function actionUpdateItem(
  scope: CommandScope, supabase: SupabaseClient, sectionNumber: number, itemNumber: number, fields: ItemEditFields,
): Promise<ItemMutationResult> {
  return mutateItem(scope, supabase, { type: 'update', sectionNumber, itemNumber, fields })
}

export function actionAddItem(
  scope: CommandScope, supabase: SupabaseClient, sectionNumber: number, name: string, price: number, quantity = 1,
): Promise<ItemMutationResult> {
  return mutateItem(scope, supabase, { type: 'add', sectionNumber, name, price, quantity })
}

export function actionRemoveItem(
  scope: CommandScope, supabase: SupabaseClient, sectionNumber: number, itemNumber: number,
): Promise<ItemMutationResult> {
  return mutateItem(scope, supabase, { type: 'remove', sectionNumber, itemNumber })
}
