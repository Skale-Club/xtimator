/**
 * Phase 43/44: WhatsApp Confirmation Flow + Outbound Delivery
 * Phase 51: Pre-send edit commands (SEED-015 Gap 1)
 * LangGraph: Natural language agent replaces the regex command parser.
 *
 * The owner can send any natural language message while in awaiting_confirm state.
 * The LangGraph ReAct agent (agent.ts) interprets the request, calls the appropriate
 * tools (confirm-actions.ts), and replies with a single synthesized WhatsApp message.
 *
 * Supports chained actions in one message, e.g.:
 *   "change the total to 2k and send it"
 *   "set the client to Maria +15552223333 and use the share link"
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runConfirmationAgent } from '@/lib/whatsapp/agent'

export type Session = {
  id: string
  state: string
  draft_project_id: string | null
  draft_estimate_id: string | null
}

// ---------------------------------------------------------------------------
// Entry point — called by handler.ts for every reply in awaiting_confirm state
// ---------------------------------------------------------------------------
export async function processConfirmationReply(
  textBody: string,
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient
): Promise<void> {
  await runConfirmationAgent(textBody, session, companyId, ownerPhone, supabase)
}
