/**
 * lib/chat/history-mapper.ts — CHATUI-02 history seed.
 *
 * Pure ChatMessageRow[] → UIMessage[] mapper that seeds persisted history into
 * useChat({ messages }). The Phase-124 backend persisted each tail message as
 * { role, parts } where `parts` is the v6 UIMessage.parts jsonb (tool calls are
 * PARTS on the assistant message), so the stored shape round-trips here verbatim.
 *
 * Filters to user/assistant rows only — any standalone `tool`/`system` row is
 * dropped (Open Q2: tool calls do NOT live as separate rows). Non-array/null
 * parts coerce to [] so a malformed row can never crash the seed.
 */
import type { UIMessage } from 'ai'
import type { ChatMessageRow } from '@/lib/queries/chat'

/** Seed persisted history into useChat({ messages }). User/assistant rows only.
 *  Prefers the persisted client_id so reloads keep the LIVE session's message
 *  ids (votes / edit / regenerate stay keyed correctly); pre-migration rows
 *  fall back to the DB uuid. */
export function toUIMessages(rows: ChatMessageRow[]): UIMessage[] {
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      id: r.client_id ?? r.id,
      role: r.role as 'user' | 'assistant',
      parts: (Array.isArray(r.parts) ? r.parts : []) as UIMessage['parts'],
    }))
}
