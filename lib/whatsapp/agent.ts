/**
 * LangGraph ReAct agent for the WhatsApp confirmation flow.
 *
 * Replaces the regex command parser in confirm.ts. The owner can send natural
 * language messages ("change the total to 2k and go ahead and send it") and the
 * agent will call the appropriate tools in sequence, then reply with a single
 * synthesized WhatsApp message.
 *
 * Conversation history: the last HISTORY_LIMIT messages for this owner phone are
 * loaded from whatsapp_messages and passed to the agent so it has full context
 * of the session (edits made, previous replies, etc.).
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { getIntegrationKey } from '@/lib/platform-config'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeConfirmationTools } from '@/lib/whatsapp/agent-tools'
import {
  actionGetEstimateContext,
  formatEstimateContext,
  type Session,
} from '@/lib/whatsapp/confirm-actions'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'

const HISTORY_LIMIT = 20

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
  supabase: SupabaseClient
): Promise<void> {
  const [estimateCtx, history] = await Promise.all([
    session.draft_estimate_id
      ? actionGetEstimateContext(supabase, session.draft_estimate_id)
      : Promise.resolve(null),
    loadConversationHistory(supabase, companyId, ownerPhone),
  ])

  const estimateText = formatEstimateContext(estimateCtx)

  const systemPrompt = `You are a WhatsApp assistant helping a contractor (business owner) review and finalize their estimate before sending it to a client.

Current estimate:
${estimateText}

Available actions via tools:
- send_estimate: deliver the estimate to the client
- cancel_estimate: discard the draft
- update_total: set a new total amount
- update_timeline: set a new timeline
- update_payment_terms: update payment terms
- update_summary: update the estimate summary
- set_client: set or update the client name and phone
- regenerate_estimate: rebuild the estimate from the original recording
- get_estimate_details: fetch the current estimate details

Instructions:
- Respond in the same language the owner is using.
- Be concise — this is a WhatsApp conversation.
- If the owner requests multiple changes, perform ALL of them in sequence before composing your reply.
- After performing actions, confirm what was done in one short message.
- Do NOT ask for confirmation before acting — just do what they asked.
- If something is truly unclear (e.g. missing a phone number), ask one specific question.`

  const tools = makeConfirmationTools(session, companyId, supabase)

  const model = new ChatOpenAI({
    apiKey: (await getIntegrationKey('openai')) ?? undefined,
    model: 'gpt-4o',
    temperature: 0,
  })

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

  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i]
    if (msg._getType() !== 'ai') continue
    const content = msg.content
    // Skip tool-calling messages (content is empty; the call is in tool_calls)
    if (typeof content === 'string' && content.trim()) {
      responseText = content.trim()
      break
    }
  }

  if (responseText) {
    await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body: responseText } })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body: responseText,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
  }
}
