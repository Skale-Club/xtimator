// Shared UI/data types for the WhatsApp inbox. Kept in a plain module (no
// 'use server' / server-only) so both server actions, queries, and the client
// inbox component can import them as types without bundling server code.
import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'

export interface ConversationThread {
  conversation: WaConversationRow
  messages: WaMessageRow[]
}

export interface SendableEstimate {
  id: string
  label: string
  total: number | null
  currencyCode: string | null
}
