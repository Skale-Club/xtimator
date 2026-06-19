'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { getServerStorage } from '@/lib/storage'
import { isDemoSession, DEMO_READONLY_MESSAGE } from '@/lib/demo/guard'
import {
  logOutboundMessage,
  markConversationRead,
  isWithinReplyWindow,
  type WaConversationRow,
  type WaMessageRow,
} from '@/lib/whatsapp/conversations'
import { deliverEstimateViaWhatsApp } from '@/lib/whatsapp/send-estimate'
import type { ConversationThread, SendableEstimate } from '@/lib/whatsapp/inbox-types'

// ----- internal helpers --------------------------------------------------

async function resolve(): Promise<{ companyId: string; svc: SupabaseClient } | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  return { companyId, svc: requireServiceClient() }
}

async function fetchConversation(
  svc: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<WaConversationRow | null> {
  const { data } = await svc
    .from('whatsapp_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .maybeSingle()
  return (data as WaConversationRow | null) ?? null
}

async function fetchThread(
  svc: SupabaseClient,
  companyId: string,
  conversationId: string,
): Promise<ConversationThread | null> {
  const conversation = await fetchConversation(svc, companyId, conversationId)
  if (!conversation) return null
  const { data: messages } = await svc
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)
  const rawMessages = (messages ?? []) as WaMessageRow[]

  // Enrich audio messages that have a storage path with a fresh 1-hour signed URL.
  // The DB stores storage paths (not signed URLs) so URLs never stale in the DB.
  const storage = getServerStorage()
  const enriched = await Promise.all(
    rawMessages.map(async (m) => {
      if ((m.msg_type === 'audio' || m.msg_type === 'image') && m.media_url && !m.media_url.startsWith('http')) {
        const bucket = m.msg_type === 'audio' ? 'audio' : 'photos'
        try {
          const signedUrl = await storage.getSignedUrl(bucket, m.media_url, 3600)
          return { ...m, media_url: signedUrl }
        } catch {
          return { ...m, media_url: null }
        }
      }
      return m
    })
  )
  return { conversation, messages: enriched }
}

// ----- actions ------------------------------------------------------------

/** Open a conversation: clear its unread badge and return the message thread. */
export async function loadConversation(
  conversationId: string,
): Promise<{ ok: true; thread: ConversationThread } | { ok: false; error: string }> {
  const ctx = await resolve()
  if (!ctx) return { ok: false, error: 'No active company' }
  const thread = await fetchThread(ctx.svc, ctx.companyId, conversationId)
  if (!thread) return { ok: false, error: 'Conversation not found' }
  await markConversationRead(ctx.svc, conversationId)
  revalidatePath('/whatsapp')
  return { ok: true, thread: { ...thread, conversation: { ...thread.conversation, unread_count: 0 } } }
}

/** Send a free-text reply (only allowed within Meta's 24h customer-service window). */
export async function sendReply(
  conversationId: string,
  text: string,
): Promise<{ ok: true; thread: ConversationThread } | { ok: false; error: string }> {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Message is empty' }

  // resolve() uses the service client (RLS bypass) and this sends an outbound
  // WhatsApp message, so RLS cannot block it — guard at the app layer.
  if (await isDemoSession()) return { ok: false, error: DEMO_READONLY_MESSAGE }

  const ctx = await resolve()
  if (!ctx) return { ok: false, error: 'No active company' }
  const { svc, companyId } = ctx

  const conversation = await fetchConversation(svc, companyId, conversationId)
  if (!conversation) return { ok: false, error: 'Conversation not found' }

  if (!isWithinReplyWindow(conversation.last_inbound_at)) {
    return {
      ok: false,
      error:
        'The 24-hour reply window has closed. WhatsApp only allows free-text replies within 24h of the client’s last message.',
    }
  }

  try {
    await sendWhatsAppMessage(conversation.contact_phone, {
      type: 'text',
      text: { body: trimmed },
    })
  } catch (err) {
    await logOutboundMessage(svc, {
      companyId,
      contactPhone: conversation.contact_phone,
      clientId: conversation.client_id,
      contactName: conversation.contact_name,
      body: trimmed,
      msgType: 'text',
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'send failed',
    })
    const thread = await fetchThread(svc, companyId, conversationId)
    return thread
      ? { ok: false, error: 'Failed to send. The message was logged as failed.' }
      : { ok: false, error: 'Failed to send.' }
  }

  await logOutboundMessage(svc, {
    companyId,
    contactPhone: conversation.contact_phone,
    clientId: conversation.client_id,
    contactName: conversation.contact_name,
    body: trimmed,
    msgType: 'text',
    status: 'sent',
  })

  const thread = await fetchThread(svc, companyId, conversationId)
  if (!thread) return { ok: false, error: 'Conversation not found' }
  revalidatePath('/whatsapp')
  return { ok: true, thread }
}

/** List the conversation's linked-client estimates that can be sent. */
export async function listSendableEstimates(
  conversationId: string,
): Promise<{ ok: true; clientLinked: boolean; estimates: SendableEstimate[] } | { ok: false; error: string }> {
  const ctx = await resolve()
  if (!ctx) return { ok: false, error: 'No active company' }
  const { svc, companyId } = ctx

  const conversation = await fetchConversation(svc, companyId, conversationId)
  if (!conversation) return { ok: false, error: 'Conversation not found' }

  let clientId = conversation.client_id
  if (!clientId) {
    const { data: client } = await svc
      .from('clients')
      .select('id')
      .eq('company_id', companyId)
      .eq('phone', conversation.contact_phone)
      .maybeSingle()
    clientId = (client?.id as string | null) ?? null
  }
  if (!clientId) return { ok: true, clientLinked: false, estimates: [] }

  const { data: projects } = await svc
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
  const projectName = new Map<string, string>(
    (projects ?? []).map((p) => [p.id as string, (p.name as string) ?? 'Project']),
  )
  const projectIds = [...projectName.keys()]
  if (projectIds.length === 0) return { ok: true, clientLinked: true, estimates: [] }

  const { data: ests } = await svc
    .from('estimates')
    .select('id, estimate_number, total, currency_code, project_id, created_at')
    .eq('company_id', companyId)
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(25)

  const estimates: SendableEstimate[] = (ests ?? []).map((e) => {
    const num = (e.estimate_number as number | null) ?? null
    const proj = projectName.get(e.project_id as string) ?? 'Project'
    return {
      id: e.id as string,
      label: `${num ? `#${num}` : `#${(e.id as string).slice(0, 8)}`} · ${proj}`,
      total: (e.total as number | null) ?? null,
      currencyCode: (e.currency_code as string | null) ?? null,
    }
  })

  return { ok: true, clientLinked: true, estimates }
}

/** Send an estimate to the conversation's contact over WhatsApp. */
export async function sendEstimateToConversation(
  conversationId: string,
  estimateId: string,
): Promise<{ ok: true; thread: ConversationThread; fallback: 'share_link' | null } | { ok: false; error: string }> {
  // Sends an estimate over WhatsApp via the service client (RLS bypass) — guard.
  if (await isDemoSession()) return { ok: false, error: DEMO_READONLY_MESSAGE }

  const ctx = await resolve()
  if (!ctx) return { ok: false, error: 'No active company' }
  const { svc, companyId } = ctx

  const conversation = await fetchConversation(svc, companyId, conversationId)
  if (!conversation) return { ok: false, error: 'Conversation not found' }

  const result = await deliverEstimateViaWhatsApp({
    svc,
    estimateId,
    companyId,
    toPhone: conversation.contact_phone,
    clientId: conversation.client_id,
    clientName: conversation.contact_name,
  })

  const thread = await fetchThread(svc, companyId, conversationId)
  if (!result.ok) return { ok: false, error: result.error ?? 'Failed to send estimate' }
  if (!thread) return { ok: false, error: 'Conversation not found' }

  revalidatePath('/whatsapp')
  return { ok: true, thread, fallback: result.fallback ?? null }
}
