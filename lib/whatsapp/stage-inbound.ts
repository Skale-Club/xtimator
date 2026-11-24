import 'server-only'
import type { WhatsAppMessage, WhatsAppValue } from '@/lib/whatsapp/types'
import { requireServiceClient } from '@/lib/supabase/service'
import { findActiveWhatsAppSender } from '@/lib/whatsapp/account-registry'
import { findOwnerCandidateByVerifiedPhone, ensureWhatsAppSenderForUser } from '@/lib/whatsapp/sender-link'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { rateLimit } from '@/lib/ratelimit'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { unknownSenderReplyText } from '@/lib/whatsapp/unknown-sender-reply'
import { inboxFieldsFor } from '@/lib/whatsapp/inbox-fields'
import { logInboundMessage } from '@/lib/whatsapp/conversations'
import { welcomeOnFirstContact } from '@/lib/whatsapp/send-welcome'
import { classifyInboundMessage } from '@/lib/whatsapp/message-policy'
import { WELCOME_QUICK_REPLY_PAYLOAD } from '@/lib/whatsapp/welcome-template'

export type QueuedPhone = { companyId: string; ownerPhone: string }

async function replyToUnknownSender(phone: string): Promise<void> {
  const limit = await rateLimit('whatsappUnknownSenderReply', phone)
  if (!limit.allowed) return
  await sendWhatsAppMessage(`+${phone}`, {
    type: 'text', text: { body: unknownSenderReplyText(phone) },
  }, { companyId: null, purpose: 'unknown_sender', billable: false })
}

async function lazyLinkOwnerSender(phone: string) {
  const candidate = await findOwnerCandidateByVerifiedPhone(phone)
  if (!candidate || await assertCompanyWritable(candidate.companyId)) return null
  const linked = await ensureWhatsAppSenderForUser(candidate.userId, candidate.companyId)
  if (linked.status !== 'linked' && linked.status !== 'already_linked') return null
  // Never manufacture authority from an attempted link or a stale candidate.
  return findActiveWhatsAppSender(phone, { throwOnError: true })
}

/** Persist each owner message for recoverable batching; performs no AI inline. */
export async function stageInboundMessage(
  message: WhatsAppMessage,
  value: WhatsAppValue | undefined,
  { recovering = false }: { recovering?: boolean } = {},
): Promise<QueuedPhone | undefined> {
  {
    if (typeof message?.id !== 'string' || !message.id ||
        typeof message.from !== 'string' || !/^\d{7,15}$/.test(message.from)) {
      console.warn('[WhatsApp] unsupported inbound identity; phone linking required')
      return
    }
    const messageId = message.id  // wamid.* — deduplication key (WA-03)
    const fromPhone = message.from // E.164 without leading +
    console.info('[WhatsApp] inbound message received', {
      messageId,
      type: message.type,
      fromLast4: fromPhone.slice(-4),
    })

    const supabase = requireServiceClient()
    const { data: queued, error: queuedError } = await supabase
      .from('whatsapp_ingress_messages').select('company_id, owner_phone').eq('id', messageId).maybeSingle()
    if (queuedError) throw new Error('WhatsApp ingress lookup failed')
    if (queued) return { companyId: queued.company_id, ownerPhone: queued.owner_phone }

    // Route 1 (D-13): admin-provisioned authorized sender — the ONLY owner routing path.
    // The account-registry enforces exactly-one-active-sender-per-phone globally.
    let senderMatch = await findActiveWhatsAppSender(`+${fromPhone}`, { throwOnError: true })

    // Route 1b (lazy auto-link): no authorized sender yet, but the phone is the
    // VERIFIED signup phone of exactly one user who belongs to exactly one company.
    // Link it now (covers every existing account with no data migration) and treat
    // the message as Route 1. Ambiguity falls through to Routes 2/3.
    if (!senderMatch) senderMatch = await lazyLinkOwnerSender(`+${fromPhone}`)

    let resolvedCompanyId: string | null = senderMatch?.companyId ?? null
    let resolvedOwnerPhone: string | null = null
    const resolvedUserId: string | null = senderMatch?.userId ?? null
    // Whether this message came from a registered owner (Route 1). Only owners get
    // the first-contact welcome — Routes 2-3 are fallbacks / client contacts.
    const resolvedViaOwner = Boolean(senderMatch?.companyId)

    // When Route 1 matches, capture the owner_phone for conversation scoping
    if (senderMatch) resolvedOwnerPhone = `+${fromPhone}`

    // Route 2 (D-14): existing conversation thread — returning contacts who messaged
    // before. Exactly-one rule: if the phone appears in multiple companies' conversations,
    // fail closed (ambiguous → no match).
    if (!resolvedCompanyId) {
      const { data: convRows, error: conversationError } = await supabase
        .from('whatsapp_conversations')
        .select('company_id')
        .eq('contact_phone', `+${fromPhone}`)
        .order('last_message_at', { ascending: false })
        .limit(101)
      if (conversationError) throw new Error('WhatsApp conversation routing lookup failed')
      const uniqueCompanies = [...new Set((convRows ?? []).map((r: { company_id: string }) => r.company_id))]
      if ((convRows?.length ?? 0) > 100 || uniqueCompanies.length > 1) return
      if ((convRows?.length ?? 0) <= 100 && uniqueCompanies.length === 1) {
        resolvedCompanyId = uniqueCompanies[0]
      }
      // else: ambiguous (0 or >1 unique companies) → fail closed, continue to Route 3
    }

    // Route 3 (D-14): clients table — known client contacts. Exactly-one rule:
    // fail closed on ambiguity (same phone in multiple companies' client lists).
    if (!resolvedCompanyId) {
      const { data: clientRows, error: clientError } = await supabase
        .from('clients')
        .select('company_id')
        .eq('phone', `+${fromPhone}`)
        .limit(101)
      if (clientError) throw new Error('WhatsApp client routing lookup failed')
      const uniqueClientCompanies = [...new Set((clientRows ?? []).map((r: { company_id: string }) => r.company_id))]
      if ((clientRows?.length ?? 0) > 100 || uniqueClientCompanies.length > 1) return
      if ((clientRows?.length ?? 0) <= 100 && uniqueClientCompanies.length === 1) {
        resolvedCompanyId = uniqueClientCompanies[0]
      }
      // else: ambiguous → fail closed
    }

    if (!resolvedCompanyId) {
      console.warn('[WhatsApp] unknown inbound sender; no company resolved', {
        fromLast4: fromPhone.slice(-4),
      })
      await replyToUnknownSender(fromPhone)
      return
    }
    const demoBlocked = await assertCompanyWritable(resolvedCompanyId)
    if (demoBlocked) return

    // Durable owner recovery must not discard accepted work because earlier
    // attempts already consumed the admission counters. Only the inbox worker
    // can supply recovery, based on the claimed row's recorded attempt count.
    if (!recovering || !resolvedViaOwner) {
      const hourly = await rateLimit('whatsappPerHour', fromPhone)
      if (!hourly.allowed) {
        console.warn('[WhatsApp] rate limit hit (hour):', fromPhone.slice(-4), hourly)
        return
      }
      const daily = await rateLimit('whatsappPerDay', fromPhone)
      if (!daily.allowed) {
        console.warn('[WhatsApp] rate limit hit (day):', fromPhone.slice(-4), daily)
        return
      }
    }

    console.info('[WhatsApp] inbound sender resolved', {
      companyId: resolvedCompanyId,
      fromLast4: fromPhone.slice(-4),
    })

    // Honor completed deliveries from the pre-inbox implementation. New messages
    // are deduplicated by their immutable durable queue row, never a premature claim.
    const { data: legacy, error: dedupError } = await supabase
      .from('whatsapp_processed_messages')
      .select('message_id').eq('message_id', messageId).maybeSingle()
    if (dedupError) throw new Error('WhatsApp legacy dedup lookup failed')
    if (legacy) return

    // Persist the inbox before staging. A storage failure leaves the signed
    // webhook pending for recovery instead of silently losing client messages.
    try {
      const { msgType, body } = inboxFieldsFor(message)
      await logInboundMessage(supabase, {
        companyId: resolvedCompanyId,
        contactPhone: `+${fromPhone}`,
        ownerPhone: resolvedOwnerPhone,     // scopes conversation to this user's number
        contactName: value?.contacts?.find(contact => contact.wa_id === fromPhone)?.profile?.name ?? null,
        body,
        msgType,
        waMessageId: messageId,
      })
    } catch (logErr) {
      console.error('[WhatsApp] inbox logInboundMessage error:', logErr)
      throw new Error('WhatsApp conversation persistence failed')
    }

    // First-contact welcome (owners only). Atomic claim ensures it's sent once,
    // even across rapid back-to-back messages. Sent before processing so the
    // owner sees the welcome ahead of any estimate reply. Best-effort.
    if (resolvedViaOwner) {
      try {
        // Localized internally (companies.default_estimate_language cascade),
        // resolved only after the atomic claim is won — no select on repeat messages.
        await welcomeOnFirstContact(supabase, resolvedCompanyId, `+${fromPhone}`)
      } catch (welcomeErr) {
        console.error('[WhatsApp] first-contact welcome error:', welcomeErr)
      }
      // This exact control payload never contains job instructions, including
      // a repeated tap after welcome completion or a failed welcome attempt.
      if (message.type === 'button' && message.button?.payload === WELCOME_QUICK_REPLY_PAYLOAD) return
    }

    // PRODUCT RULE: only the business owner/team talks to the bot. A phone that
    // resolved through Route 2 (conversation history) or Route 3 (clients table)
    // is an end client of the business. The message is already logged above so it
    // shows in the owner's inbox, but it must NEVER reach the owner AI agent and
    // its tools, and the bot never replies to the client.
    if (!resolvedViaOwner) {
      console.info('[WhatsApp] client message logged only; not routed to the agent', {
        fromLast4: fromPhone.slice(-4),
      })
      return
    }

    // Phase 4: stickers/reactions (and system events) are logged above but never answered,
    // never sent to the AI and never cost a message. Same policy as the router/batch paths.
    if (classifyInboundMessage(message).action === 'ignore') {
      return
    }

    const { error: stageError } = await supabase.from('whatsapp_ingress_messages').upsert({
      id: messageId,
      company_id: resolvedCompanyId,
      owner_phone: `+${fromPhone}`,
      sender_user_id: resolvedUserId,
      message,
    }, { onConflict: 'id', ignoreDuplicates: true })
    if (stageError) throw new Error('WhatsApp durable message persistence failed')
    return { companyId: resolvedCompanyId, ownerPhone: `+${fromPhone}` }
  }
}
