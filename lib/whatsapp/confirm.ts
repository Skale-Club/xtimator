/**
 * Phase 43/44: WhatsApp Confirmation Flow + Outbound Delivery
 * Phase 51: Pre-send edit commands (SEED-015 Gap 1)
 *
 * Handles replies from owners who have an awaiting_confirm session.
 *
 *   send                                 → deliver to client + clean up session
 *   cancel                               → discard draft + clean up session
 *   edit total 450                       → mutate estimate.total, re-send summary
 *   edit timeline "..."                  → mutate estimate.timeline, re-send summary
 *   edit payment "..."                   → mutate estimate.payment_terms, re-send summary
 *   edit summary "..."                   → mutate estimate.summary, re-send summary
 *   client "Maria" +15552223333          → upsert client + link to project
 *   regenerate                           → call generateEstimateForProject again
 *   anything else                        → send help message
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'
import { parseEditCommand, EDIT_HELP_MESSAGE } from '@/lib/whatsapp/edit-commands'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { generateAndUploadEstimatePDF } from '@/lib/whatsapp/pdf-delivery'
import { formatMoney } from '@/lib/money/currency'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'

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
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const command = parseEditCommand(textBody)

  switch (command.kind) {
    case 'send':
      await handleSend(session, companyId, ownerPhone, supabase)
      return
    case 'cancel':
      await handleCancel(session, companyId, ownerPhone, supabase)
      return
    case 'edit-total':
      await handleEditField(session, companyId, ownerPhone, supabase, { total: command.value })
      return
    case 'edit-timeline':
      await handleEditField(session, companyId, ownerPhone, supabase, { timeline: command.value })
      return
    case 'edit-payment':
      await handleEditField(session, companyId, ownerPhone, supabase, { payment_terms: command.value })
      return
    case 'edit-summary':
      await handleEditField(session, companyId, ownerPhone, supabase, { summary: command.value })
      return
    case 'set-client':
      await handleSetClient(session, companyId, ownerPhone, supabase, command.name, command.phone)
      return
    case 'regenerate':
      await handleRegenerate(session, companyId, ownerPhone, supabase)
      return
    case 'help':
    default:
      await sendWhatsAppMessage(ownerPhone, {
        type: 'text',
        text: { body: EDIT_HELP_MESSAGE },
      })
      logOutboundMessage(supabase, {
        companyId,
        contactPhone: ownerPhone,
        body: EDIT_HELP_MESSAGE,
        msgType: 'text',
        status: 'sent',
      }).catch(() => undefined)
  }
}

// Re-export for back-compat tests
export function parseCommand(text: string): 'send' | 'cancel' | null {
  const c = parseEditCommand(text)
  if (c.kind === 'send') return 'send'
  if (c.kind === 'cancel') return 'cancel'
  return null
}

// -------------------------------------------------------------------------
// Edit field handlers — generic mutation + re-send summary
// -------------------------------------------------------------------------

type EditableFields = {
  total?: number
  timeline?: string
  payment_terms?: string
  summary?: string
}

async function handleEditField(
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient,
  patch: EditableFields
): Promise<void> {
  if (!session.draft_estimate_id) {
    const body = 'No estimate to edit. Please start a new one.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  const { error } = await supabase
    .from('estimates')
    .update(patch)
    .eq('id', session.draft_estimate_id)

  if (error) {
    console.error('[WhatsApp] edit failed:', error)
    const body = 'Could not apply that edit. Please try again.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  await resendSummary(session.draft_estimate_id, companyId, ownerPhone, supabase, '✏️ *Updated*')
}

async function handleSetClient(
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient,
  name: string,
  phone: string
): Promise<void> {
  if (!session.draft_project_id) {
    const body = 'No project to attach a client to. Please start a new estimate.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  // Look up existing client by phone (within this company)
  const { data: existing } = await supabase
    .from('clients')
    .select('id, name, phone')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle()

  let clientId: string
  if (existing) {
    clientId = existing.id as string
    if ((existing.name as string | null) !== name) {
      await supabase.from('clients').update({ name }).eq('id', clientId)
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from('clients')
      .insert({
        company_id: companyId,
        name,
        phone,
      })
      .select('id')
      .single()
    if (createErr || !created) {
      console.error('[WhatsApp] client create failed:', createErr)
      const body = 'Could not save that client. Please try again.'
      await sendWhatsAppMessage(ownerPhone, {
        type: 'text',
        text: { body },
      })
      logOutboundMessage(supabase, {
        companyId,
        contactPhone: ownerPhone,
        body,
        msgType: 'text',
        status: 'sent',
      }).catch(() => undefined)
      return
    }
    clientId = created.id as string
  }

  // Link the client to the project
  const { error: updateErr } = await supabase
    .from('projects')
    .update({ client_id: clientId })
    .eq('id', session.draft_project_id)

  if (updateErr) {
    console.error('[WhatsApp] project-client link failed:', updateErr)
    const body = 'Could not link client. Please try again.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  const clientSetBody = `👤 Client set to *${name}* (${phone}).\n\nReply *send* to deliver, *cancel* to discard, or use *edit* commands to adjust the estimate.`
  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body: clientSetBody },
  })
  logOutboundMessage(supabase, {
    companyId,
    contactPhone: ownerPhone,
    body: clientSetBody,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
}

async function handleRegenerate(
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  if (!session.draft_project_id) {
    const body = 'No project to regenerate. Please start a new estimate.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  // Delete the current estimate (cascade removes sections/items)
  if (session.draft_estimate_id) {
    await supabase.from('estimates').delete().eq('id', session.draft_estimate_id)
  }

  let newEstimateId: string
  try {
    const result = await generateEstimateForProject(companyId, session.draft_project_id)
    newEstimateId = result.estimateId
  } catch (err) {
    console.error('[WhatsApp] regenerate failed:', err)
    const body = 'Regeneration failed. Please try again.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }

  // Update the session to point at the new estimate
  await supabase
    .from('whatsapp_sessions')
    .update({ draft_estimate_id: newEstimateId })
    .eq('id', session.id)

  await resendSummary(newEstimateId, companyId, ownerPhone, supabase, '🔄 *Regenerated*')
}

// Helper: reload estimate + re-send summary text after any edit
async function resendSummary(
  estimateId: string,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient,
  prefix: string
): Promise<void> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('total, currency_code, summary, sections:estimate_sections(title, subtotal)')
    .eq('id', estimateId)
    .single()

  const body = buildConfirmationMessage(estimate, prefix)
  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body },
  })
  logOutboundMessage(supabase, {
    companyId,
    contactPhone: ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
}

function buildConfirmationMessage(
  estimate: {
    total: number | null
    currency_code: string | null
    summary: string | null
    sections: Array<{ title: string; subtotal: number }> | null
  } | null,
  prefix = '✅ *Estimate ready*'
): string {
  if (!estimate) {
    return `${prefix}\n\nReply *send* to deliver to your client, or *cancel* to discard.`
  }

  const total = formatMoney(estimate.total ?? 0, estimate.currency_code)

  const sections = (estimate.sections ?? [])
    .map((s) => {
      const subtotal = formatMoney(s.subtotal, estimate.currency_code)
      return `• ${s.title}: ${subtotal}`
    })
    .join('\n')

  return [
    `${prefix} — ${total}`,
    '',
    sections,
    '',
    'Reply *send* to deliver, *cancel* to discard, or use *edit* commands to adjust.',
  ]
    .filter((s) => s !== null)
    .join('\n')
}

// -------------------------------------------------------------------------
// "send" handler (unchanged from Phase 43/44)
// -------------------------------------------------------------------------
async function handleSend(
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const { draft_estimate_id, draft_project_id } = session

  if (!draft_estimate_id || !draft_project_id) {
    const body = 'Could not find your estimate. Please create a new one.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
    return
  }

  const [estimateResult, projectResult, waConfigResult, companyResult] = await Promise.all([
    supabase
      .from('estimates')
      .select(`
        id, share_token, total, subtotal, tax_rate, tax_amount, currency_code, summary,
        payment_terms, timeline, language,
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
    const body = 'Could not find your estimate. Please create a new one.'
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body },
    })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
    return
  }

  // Consolidate before delivery so the share link is publicly accessible.
  // The public /estimate/[token] page returns 404 for non-consolidated estimates (SEED-028).
  await supabase
    .from('estimates')
    .update({
      workflow_status: 'consolidated',
      consolidated_at: new Date().toISOString(),
    })
    .eq('id', draft_estimate_id)
    .eq('workflow_status', 'draft')

  const shareUrl = buildShareUrl(estimate.share_token as string)

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
      // WAPDF-02/03: Generate PDF, upload to Supabase Storage, send via Meta document API
      // WAPDF-04: On any failure, fall back to share_link — owner always gets confirmation
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
          contactName: clientName ?? null,
          clientId: (project.client_id as string | null) ?? null,
          body: companyName ? `Your estimate from ${companyName}` : 'Your estimate',
          msgType: 'document',
          status: 'sent',
        }).catch(() => undefined)
      } catch (err) {
        console.error('[WhatsApp] PDF delivery failed, falling back to share_link:', err)
      }

      if (!pdfDelivered) {
        // Fallback: share_link when pdf_attachment generation fails (WAPDF-04)
        try {
          await sendWhatsAppMessage(clientPhone, {
            type: 'text',
            text: { body: buildShareLinkMessage(shareUrl, clientName) },
          })
          deliveredToClient = true
          logOutboundMessage(supabase, {
            companyId,
            contactPhone: clientPhone,
            contactName: clientName ?? null,
            clientId: (project.client_id as string | null) ?? null,
            body: buildShareLinkMessage(shareUrl, clientName),
            msgType: 'text',
            status: 'sent',
          }).catch(() => undefined)
        } catch {
          // Non-fatal — owner still gets the share link in owner message
        }
      }
    } else {
      // Existing behavior: share_link (default) or formatted_text
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
        logOutboundMessage(supabase, {
          companyId,
          contactPhone: clientPhone,
          contactName: clientName ?? null,
          clientId: (project.client_id as string | null) ?? null,
          body: clientMessageBody,
          msgType: 'text',
          status: 'sent',
        }).catch(() => undefined)
      } catch {
        // Non-fatal — owner still gets the share link
      }
    }
  }

  await Promise.all([
    supabase.from('estimates').update({ status: 'sent' }).eq('id', draft_estimate_id),
    supabase.from('projects').update({ status: 'sent' }).eq('id', draft_project_id),
  ])

  // Phase 52 auto-learn: if client has no preferred_language yet, write the
  // estimate's language. Future estimates default to this preference via
  // the cascade resolver. Non-fatal — failure doesn't block the send.
  if (project.client_id && !clientPreferredLanguage && estimate.language) {
    await supabase
      .from('clients')
      .update({ preferred_language: estimate.language })
      .eq('id', project.client_id)
  }

  await supabase.from('whatsapp_sessions').delete().eq('id', session.id)

  const ownerMessage = deliveredToClient
    ? `✅ *Estimate sent!*\n\nYour client received the estimate via WhatsApp.\n\nShare link: ${shareUrl}`
    : `✅ *Estimate ready!*\n\nShare link: ${shareUrl}\n\n_(No client phone on file — send the link manually)_`

  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body: ownerMessage },
  })
  logOutboundMessage(supabase, {
    companyId,
    contactPhone: ownerPhone,
    body: ownerMessage,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
}

async function handleCancel(
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  const { draft_project_id } = session

  if (draft_project_id) {
    await supabase.from('projects').delete().eq('id', draft_project_id)
  }

  await supabase.from('whatsapp_sessions').delete().eq('id', session.id)

  const body = "❌ Estimate discarded. Send a new audio, text, or photo when you're ready."
  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body },
  })
  logOutboundMessage(supabase, {
    companyId,
    contactPhone: ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
}

function buildShareUrl(shareToken: string): string {
  const base = getCanonicalBaseUrl()
  return `${base}/estimate/${shareToken}`
}

function buildShareLinkMessage(shareUrl: string, clientName: string | null): string {
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  return `${greeting}\n\nPlease find your estimate here:\n${shareUrl}\n\nLet us know if you have any questions!`
}
