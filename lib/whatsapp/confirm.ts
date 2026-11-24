/**
 * Phase 43/44: WhatsApp Confirmation Flow + Outbound Delivery
 * Phase 51: Pre-send edit commands (SEED-015 Gap 1)
 * LangGraph: Natural language agent replaces the regex command parser.
 *
 * The owner can send any natural language message while in awaiting_confirm state.
 * The LangGraph ReAct agent (agent.ts) interprets the request, calls the appropriate
 * tools (confirm-actions.ts), and replies with a single synthesized WhatsApp message.
 *
 * Estimate delivery requires a standalone confirmation after any edits.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runConfirmationAgent } from '@/lib/whatsapp/agent'
import type { WhatsAppCostMeter } from '@/lib/whatsapp/cost-meter'
import type { Session } from '@/lib/whatsapp/session-commands'

export type { Session } from '@/lib/whatsapp/session-commands'

// ---------------------------------------------------------------------------
// Entry point — called by handler.ts for every reply in awaiting_confirm state
// ---------------------------------------------------------------------------
export async function processConfirmationReply(
  textBody: string,
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient,
  meter?: WhatsAppCostMeter,
  messageId?: string,
  allowAuthorization = false,
  senderUserId?: string | null,
): Promise<void> {
  await runConfirmationAgent(textBody, session, companyId, ownerPhone, supabase, meter, messageId, allowAuthorization, senderUserId)
}
