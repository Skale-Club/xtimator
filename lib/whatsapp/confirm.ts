/**
 * Phase 43/44: WhatsApp Confirmation Flow + Outbound Delivery
 *
 * Handles "send" / "cancel" replies from owners who have an awaiting_confirm session.
 * "send"   → deliver estimate to client per company's delivery_format + notify owner
 * "cancel" → delete draft project (cascade) + delete session + notify owner
 * Other    → remind owner of valid commands
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'

type Session = {
  id: string
  state: string
  draft_project_id: string | null
  draft_estimate_id: string | null
}

// -------------------------------------------------------------------------
// Entry point
// -------------------------------------------------------------------------
export async function processConfirmationReply(
  textBody: string,
  session: Session,
  companyId: string,
  ownerPhone: string,  // E.164 with leading +
  supabase: SupabaseClient
): Promise<void> {
  const command = parseCommand(textBody)

  if (command === 'send') {
    await handleSend(session, companyId, ownerPhone, supabase)
  } else if (command === 'cancel') {
    await handleCancel(session, ownerPhone, supabase)
  } else {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: {
        body: 'Reply *send* to deliver the estimate to your client, or *cancel* to discard it.',
      },
    })
  }
}

// -------------------------------------------------------------------------
// Command parser — "send" / "cancel" / null
// -------------------------------------------------------------------------
function parseCommand(text: string): 'send' | 'cancel' | null {
  const normalized = text.toLowerCase().trim().replace(/[^\w\s]/g, '').trim()
  if (normalized === 'send') return 'send'
  if (normalized === 'cancel') return 'cancel'
  return null
}

// -------------------------------------------------------------------------
// "send" handler
// -------------------------------------------------------------------------
async function handleSend(
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const { draft_estimate_id, draft_project_id } = session

  if (!draft_estimate_id || !draft_project_id) {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body: 'Could not find your estimate. Please create a new one.' },
    })
    await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
    return
  }

  // Load estimate (full data for formatted_text), project (client_id), and delivery config
  const [estimateResult, projectResult, waConfigResult, companyResult] = await Promise.all([
    supabase
      .from('estimates')
      .select(`
        id, share_token, total, subtotal, tax_rate, tax_amount, summary,
        payment_terms, timeline,
        sections:estimate_sections(
          title, subtotal,
          items:estimate_items(description, quantity, unit, unit_price, total)
        )
      `)
      .eq('id', draft_estimate_id)
      .single(),
    supabase
      .from('projects')
      .select('id, client_id')
      .eq('id', draft_project_id)
      .single(),
    supabase
      .from('company_whatsapp')
      .select('delivery_format')
      .eq('company_id', companyId)
      .single(),
    supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single(),
  ])

  const estimate = estimateResult.data
  const project = projectResult.data
  const deliveryFormat = (waConfigResult.data?.delivery_format as string | null) ?? 'share_link'
  const companyName = (companyResult.data?.name as string | null) ?? null

  if (!estimate || !project) {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body: 'Could not find your estimate. Please create a new one.' },
    })
    await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
    return
  }

  const shareUrl = buildShareUrl(estimate.share_token as string)

  // Load client info if project has a linked client
  let clientPhone: string | null = null
  let clientName: string | null = null
  if (project.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('phone, name')
      .eq('id', project.client_id)
      .single()
    clientPhone = (client?.phone as string | null) ?? null
    clientName = (client?.name as string | null) ?? null
  }

  // Deliver to client based on format
  let deliveredToClient = false
  if (clientPhone) {
    const clientMessageBody =
      deliveryFormat === 'formatted_text'
        ? formatEstimateForWhatsApp(estimate as FormatterEstimate, clientName, companyName)
        : buildShareLinkMessage(shareUrl, clientName)

    try {
      await sendWhatsAppMessage(clientPhone, {
        type: 'text',
        text: { body: clientMessageBody },
      })
      deliveredToClient = true
    } catch {
      // Non-fatal — owner still gets the share link
    }
  }

  // Update estimate + project to "sent"
  await Promise.all([
    supabase.from('estimates').update({ status: 'sent' }).eq('id', draft_estimate_id),
    supabase.from('projects').update({ status: 'sent' }).eq('id', draft_project_id),
  ])

  // Delete session (delivery complete)
  await supabase.from('whatsapp_sessions').delete().eq('id', session.id)

  // Notify owner
  const ownerMessage = deliveredToClient
    ? `✅ *Estimate sent!*\n\nYour client received the estimate via WhatsApp.\n\nShare link: ${shareUrl}`
    : `✅ *Estimate ready!*\n\nShare link: ${shareUrl}\n\n_(No client phone on file — send the link manually)_`

  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body: ownerMessage },
  })
}

// -------------------------------------------------------------------------
// "cancel" handler
// -------------------------------------------------------------------------
async function handleCancel(
  session: Session,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const { draft_project_id } = session

  // Cascade-delete project → estimate → sections → items → recordings → photos
  if (draft_project_id) {
    await supabase.from('projects').delete().eq('id', draft_project_id)
  }

  await supabase.from('whatsapp_sessions').delete().eq('id', session.id)

  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body: "❌ Estimate discarded. Send a new audio, text, or photo when you're ready." },
  })
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------
function buildShareUrl(shareToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com'
  return `${base}/estimate/${shareToken}`
}

function buildShareLinkMessage(shareUrl: string, clientName: string | null): string {
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  return `${greeting}\n\nPlease find your estimate here:\n${shareUrl}\n\nLet us know if you have any questions!`
}
