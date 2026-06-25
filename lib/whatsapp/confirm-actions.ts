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
import { formatMoney } from '@/lib/money/currency'

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

  const [estimateResult, projectResult, waConfigResult, companyResult] = await Promise.all([
    supabase
      .from('estimates')
      .select(`
        id, share_token, total, subtotal, tax_rate, tax_amount,
        deposit_type, deposit_value, balance_due, currency_code, summary,
        payment_terms, timeline, language,
        sections:estimate_sections(
          title, subtotal,
          items:estimate_items(description, quantity, unit, unit_price, total)
        )
      `)
      .eq('id', draft_estimate_id)
      .single(),
    supabase.from('projects').select('id, client_id').eq('id', draft_project_id).single(),
    supabase.from('company_whatsapp').select('delivery_format').eq('company_id', companyId).single(),
    supabase.from('companies').select('name').eq('id', companyId).single(),
  ])

  const estimate = estimateResult.data
  const project = projectResult.data
  const deliveryFormat = (waConfigResult.data?.delivery_format as string | null) ?? 'share_link'
  const companyName = (companyResult.data?.name as string | null) ?? null

  if (!estimate || !project) throw new Error('Could not load estimate or project.')

  // Consolidate so the public share link works (SEED-028)
  await supabase
    .from('estimates')
    .update({ workflow_status: 'consolidated', consolidated_at: new Date().toISOString() })
    .eq('id', draft_estimate_id)
    .eq('workflow_status', 'draft')

  const shareUrl = `${getCanonicalBaseUrl()}/estimate/${estimate.share_token}`

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
// Internal helpers
// ---------------------------------------------------------------------------

function buildShareLinkMessage(shareUrl: string, clientName: string | null): string {
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  return `${greeting}\n\nPlease find your estimate here:\n${shareUrl}\n\nLet us know if you have any questions!`
}
