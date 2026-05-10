/**
 * Phase 43: WhatsApp Confirmation Flow
 *
 * Handles "send" / "cancel" replies from owners who have an awaiting_confirm session.
 * "send"   → deliver estimate share link to client (if phone known) + notify owner
 * "cancel" → delete draft project (cascade) + delete session + notify owner
 * Other    → remind owner of valid commands
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

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

  // Load estimate (need share_token + total) and project (client_id)
  const [estimateResult, projectResult] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, share_token, total, summary')
      .eq('id', draft_estimate_id)
      .single(),
    supabase
      .from('projects')
      .select('id, client_id')
      .eq('id', draft_project_id)
      .single(),
  ])

  const estimate = estimateResult.data
  const project = projectResult.data

  if (!estimate || !project) {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body: 'Could not find your estimate. Please create a new one.' },
    })
    await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
    return
  }

  const shareUrl = buildShareUrl(estimate.share_token as string)

  // Attempt to deliver to client if a phone is configured
  let deliveredToClient = false
  if (project.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('phone, name')
      .eq('id', project.client_id)
      .single()

    if (client?.phone) {
      try {
        await sendWhatsAppMessage(client.phone as string, {
          type: 'text',
          text: {
            body: buildClientDeliveryMessage(shareUrl, client.name as string | null),
          },
        })
        deliveredToClient = true
      } catch {
        // Delivery failure is non-fatal — owner still gets the share link
      }
    }
  }

  // Update estimate + project to "sent"
  await Promise.all([
    supabase
      .from('estimates')
      .update({ status: 'sent' })
      .eq('id', draft_estimate_id),
    supabase
      .from('projects')
      .update({ status: 'sent' })
      .eq('id', draft_project_id),
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
    text: { body: '❌ Estimate discarded. Send a new audio, text, or photo when you\'re ready.' },
  })
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------
function buildShareUrl(shareToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com'
  return `${base}/estimate/${shareToken}`
}

function buildClientDeliveryMessage(shareUrl: string, clientName: string | null): string {
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  return `${greeting}\n\nPlease find your estimate here:\n${shareUrl}\n\nLet us know if you have any questions!`
}
