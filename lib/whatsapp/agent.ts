/**
 * LangGraph ReAct agent for the WhatsApp confirmation flow.
 *
 * Replaces the regex command parser in confirm.ts. The owner can send natural
 * language messages ("change item 1.2 to 200 and update the timeline") and the
 * agent will call the appropriate tools in sequence, then reply with a single
 * synthesized WhatsApp message.
 *
 * Conversation history: the last HISTORY_LIMIT messages for this owner phone are
 * loaded from whatsapp_messages and passed to the agent so it has full context
 * of the session (edits made, previous replies, etc.).
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { makeWhatsAppLLM } from '@/lib/whatsapp/llm'
import type { WhatsAppCostMeter } from '@/lib/whatsapp/cost-meter'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeConfirmationTools, runStandaloneConfirmation } from '@/lib/whatsapp/agent-tools'
import {
  actionGetEstimateContext,
  formatEstimateContext,
  type Session,
} from '@/lib/whatsapp/confirm-actions'
import {
  getNumberedEstimate,
  buildNumberedBreakdownLines,
} from '@/lib/whatsapp/estimate-numbering'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { estimateReplyAuthorization, loadCurrentSession, sameSession } from '@/lib/whatsapp/session-commands'
import { resolveOwnerLanguage } from '@/lib/whatsapp/owner-language'

const HISTORY_LIMIT = 20
const STALE_REPLY = {
  en: 'This WhatsApp draft changed or expired. Open the estimate in the app or reply to its latest WhatsApp confirmation.',
  pt: 'Este orçamento do WhatsApp mudou ou expirou. Abra o orçamento no app ou responda à confirmação mais recente.',
  es: 'Este presupuesto de WhatsApp cambió o venció. Abre el presupuesto en la app o responde a su confirmación más reciente.',
}
const RETRY_REPLY = {
  en: 'I could not confirm that action. Check the estimate in the app before trying again.',
  pt: 'Não consegui confirmar essa ação. Confira o orçamento no app antes de tentar novamente.',
  es: 'No pude confirmar esa acción. Revisa el presupuesto en la app antes de intentarlo de nuevo.',
}

// ---------------------------------------------------------------------------
// Conversation history loader
// ---------------------------------------------------------------------------

async function loadConversationHistory(
  supabase: SupabaseClient,
  companyId: string,
  ownerPhone: string
): Promise<BaseMessage[]> {
  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('company_id', companyId)
    .eq('contact_phone', ownerPhone)
    .maybeSingle()

  if (!conv) return []

  const { data: rows } = await supabase
    .from('whatsapp_messages')
    .select('direction, body, msg_type')
    .eq('conversation_id', (conv as { id: string }).id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (!rows || rows.length === 0) return []

  return (rows as Array<{ direction: string; body: string | null; msg_type: string }>)
    .reverse()
    .map((row) => {
      const text = row.body ?? `[${row.msg_type}]`
      return row.direction === 'inbound' ? new HumanMessage(text) : new AIMessage(text)
    })
}

// ---------------------------------------------------------------------------
// Main agent entry point
// ---------------------------------------------------------------------------

export async function runConfirmationAgent(
  userMessage: string,
  session: Session,
  companyId: string,
  ownerPhone: string,
  supabase: SupabaseClient,
  // Phase 2a: per-inbound-message cost meter owned (and settled) by the intent router.
  meter?: WhatsAppCostMeter,
  messageId?: string,
  allowAuthorization = false,
  senderUserId?: string | null,
): Promise<void> {
  const reply = async (body: string): Promise<void> => {
    const wamid = await sendWhatsAppMessage(
      ownerPhone,
      { type: 'text', text: { body } },
      { companyId, purpose: 'bot_reply', billable: true },
    )
    await logOutboundMessage(supabase, {
      companyId, contactPhone: ownerPhone, body, msgType: 'text', waMessageId: wamid, status: 'sent',
    }).catch(() => undefined)
  }
  const current = await loadCurrentSession(supabase, companyId, ownerPhone)
  if (!messageId || !sameSession(current, session) || session.state !== 'awaiting_confirm') {
    await reply(STALE_REPLY[await resolveOwnerLanguage(supabase, companyId)])
    return
  }

  const confirmation = allowAuthorization && estimateReplyAuthorization(userMessage)
  const scope = { session, companyId, ownerPhone, messageId, senderUserId }
  if (confirmation) {
    // A standalone reply authorizes the matching command directly.
    const language = await resolveOwnerLanguage(supabase, companyId)
    await reply(await runStandaloneConfirmation(scope, supabase, confirmation, language))
    return
  }
  const tools = makeConfirmationTools(scope, supabase)

  const [estimateCtx, numbered, history] = await Promise.all([
    session.draft_estimate_id
      ? actionGetEstimateContext(supabase, session.draft_estimate_id, companyId)
      : Promise.resolve(null),
    session.draft_estimate_id
      ? getNumberedEstimate(supabase, session.draft_estimate_id)
      : Promise.resolve(null),
    loadConversationHistory(supabase, companyId, ownerPhone),
  ])

  const estimateText = formatEstimateContext(estimateCtx)
  // The numbered breakdown mirrors what the owner saw in the confirmation, so
  // the agent can resolve "item 2.3" without a get_estimate_details round-trip.
  const numberedText =
    numbered && numbered.sections.length > 0
      ? buildNumberedBreakdownLines(numbered.sections, numbered.currencyCode)
      : ''

  const systemPrompt = `You are Xtimator AI, a WhatsApp assistant helping a contractor (business owner) review and finalize their estimate before sending it to a client.

Current estimate:
${estimateText}
${numberedText ? `\nNumbered line items (use these numbers for edits):\n${numberedText}\n` : ''}

The estimate is organized into numbered sections (1, 2, 3, …) each containing numbered items (1.1, 1.2, 2.1, …). An item reference like "2.3" means the 3rd item of the 2nd section. These numbers come from get_estimate_details and the confirmation message the owner already saw.

Available actions via tools:
- send_estimate: explain how the owner can deliver the estimate by email and/or SMS with a standalone SEND reply
- cancel_estimate: explain how to close the WhatsApp confirmation while keeping the estimate in the app
- update_total: explain how to change a requested overall total by editing line items
- update_timeline: set a new timeline
- update_payment_terms: update payment terms
- update_summary: update the estimate summary
- set_client: set or update the client name and phone
- regenerate_estimate: rebuild the estimate from the original recording
- update_item: change one line item's price, quantity, or name by its number (e.g. "change item 2.3 price to 85")
- add_item: add a new line item to a section (e.g. "add to section 2: haul away debris, $150")
- remove_item: delete a line item by its number (e.g. "remove item 1.2")
- get_estimate_details: fetch the current estimate details, including the numbered breakdown

Instructions:
- Respond in the same language the owner is using.
- Be concise — this is a WhatsApp conversation.
- If the owner requests multiple changes, perform ALL of them in sequence before composing your reply.
- After performing actions, confirm what was done in one short message.
- Apply clear line edits as requested. Deliveries require a separate standalone SEND reply after the owner reviews changes. If the owner requested changes and delivery together, explain the next SEND step.
- Relay any tool refusal, question, or uncertain outcome accurately.
- Line-item edits (update_item / add_item / remove_item) are addressed by number. If the owner's reference to an item or section is ambiguous or not a clear number (e.g. "the tile one", "the second thing"), call get_estimate_details to see the current numbering and ASK which number they mean rather than guessing. Never invent an item/section number.
- If something is truly unclear (e.g. missing a phone number), ask one specific question.
- After send_estimate, relay the instructions in the tool result.`

  const model = await makeWhatsAppLLM(companyId, 'chat', meter)

  const agent = createReactAgent({ llm: model, tools })

  const result = await agent.invoke({
    messages: [
      new SystemMessage(systemPrompt),
      ...history,
      new HumanMessage(userMessage),
    ],
  })

  // Extract the agent's final text response — the last AIMessage without tool_calls
  const allMessages = result.messages as BaseMessage[]
  let responseText: string | null = null

  for (let i = allMessages.length - 1; i >= history.length + 2; i--) {
    const msg = allMessages[i]
    if (msg._getType() !== 'ai') continue
    const content = msg.content
    // Skip tool-calling messages (content is empty; the call is in tool_calls)
    if (typeof content === 'string' && content.trim()) {
      responseText = content.trim()
      break
    }
  }

  await reply(responseText ?? RETRY_REPLY[await resolveOwnerLanguage(supabase, companyId)])
}
