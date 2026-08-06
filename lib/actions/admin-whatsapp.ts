'use server'

import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { getServerStorage } from '@/lib/storage/server'
import type { ConversationThread } from '@/lib/whatsapp/inbox-types'
import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'

/**
 * Admin-only, cross-company, strictly read-only conversation thread loader.
 *
 * Authorization is the admin gate ALONE (requireAdmin) — admin views are
 * intentionally cross-tenant, so there is no company_id filter. The service
 * role key stays server-side behind the 'use server' boundary + requireAdmin
 * guard (CLAUDE.md SEC requirement). This action performs no writes: no
 * markConversationRead, no revalidatePath, no mutations.
 *
 * SECURITY: When expectedCompanyId is provided, the conversation's company_id
 * is verified against it before returning messages. This prevents stale or
 * mismatched rows from leaking cross-tenant data when the admin applies a
 * company filter and opens a thread that may have been reassigned.
 */
export async function loadAdminConversationThread(
  conversationId: string,
  expectedCompanyId?: string,
): Promise<{ ok: true; thread: ConversationThread } | { ok: false; error: string }> {
  await requireAdmin()
  const svc = requireServiceClient()

  const { data: convData } = await svc
    .from('whatsapp_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  const conversation = (convData as WaConversationRow | null) ?? null
  if (!conversation) return { ok: false, error: 'Conversation not found' }

  // Verify company ownership when expectedCompanyId is provided
  if (expectedCompanyId && conversation.company_id !== expectedCompanyId) {
    return { ok: false, error: 'Conversation does not belong to the expected company' }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: messages } = await svc
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(1000)
  const rawMessages = (messages ?? []) as WaMessageRow[]

  // Enrich audio/image messages with fresh 1-hour signed URLs. The DB stores
  // storage paths (not signed URLs) so URLs never stale in the DB.
  const storage = getServerStorage()
  const enriched = await Promise.all(
    rawMessages.map(async (m) => {
      if (
        (m.msg_type === 'audio' || m.msg_type === 'image') &&
        m.media_url &&
        !m.media_url.startsWith('http')
      ) {
        const bucket = m.msg_type === 'audio' ? 'audio' : 'photos'
        try {
          const signedUrl = await storage.getSignedUrl(bucket, m.media_url, 3600)
          return { ...m, media_url: signedUrl }
        } catch {
          return { ...m, media_url: null }
        }
      }
      return m
    }),
  )

  return { ok: true, thread: { conversation, messages: enriched } }
}
