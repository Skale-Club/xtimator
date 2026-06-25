/**
 * Quick task 260603-lrf — Task 2.
 *
 * AI intent router for EVERY inbound WhatsApp message (any session state).
 *
 * Replaces the rigid send/cancel gate in handler.ts that rejected mid-confirm
 * audio/photo with a canned "reply send or cancel". The flow:
 *
 *   normalize → loadHistory → classify (ChatOpenAI gpt-4o) → dispatch
 *
 * The normalized text + session context + recent conversation history are
 * classified into exactly one of four intents and routed to the EXISTING flows:
 *
 *   CONFIRM_OR_CANCEL → processConfirmationReply   (text path)
 *   EDIT              → runConfirmationAgent        (edit a pending draft)
 *   CREATE            → actionCancel (discard pending) + processInboundMessages
 *   QUERY             → ReAct agent with company-scoped makeQueryTools
 *
 * SECURITY (T-lrf-01/02): the classifier output is constrained to a fixed label
 * set; any unrecognized output defaults to CREATE (the normal, safe estimate
 * path) — never to a privileged action. QUERY tools are scoped to the trusted
 * companyId resolved upstream; the LLM never supplies a tenant.
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { getIntegrationKey } from '@/lib/platform-config'
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import { normalizeMessage } from '@/lib/whatsapp/normalize'
import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { runConfirmationAgent } from '@/lib/whatsapp/agent'
import { actionCancel, type Session } from '@/lib/whatsapp/confirm-actions'
import { processInboundMessages } from '@/lib/whatsapp/handler'
import { makeQueryTools } from '@/lib/whatsapp/query-tools'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { splitReply } from '@/lib/whatsapp/split-reply'
import { askKnowledge } from '@/lib/agent-tools/ask-knowledge'

const HISTORY_LIMIT = 20

export type Intent = 'CONFIRM_OR_CANCEL' | 'EDIT' | 'CREATE' | 'QUERY' | 'KNOWLEDGE'

export interface RouteInput {
  companyId: string
  ownerPhone: string // E.164 WITH '+'
  fromPhone: string // E.164 WITHOUT '+'
  message: WhatsAppMessage
  session: Session | null
  supabase: SupabaseClient
}

// ---------------------------------------------------------------------------
// Conversation history (same query shape as agent.ts loadConversationHistory)
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
// Classifier
// ---------------------------------------------------------------------------

function parseIntent(raw: string): Intent {
  const t = raw.toUpperCase()
  if (t.includes('CONFIRM_OR_CANCEL')) return 'CONFIRM_OR_CANCEL'
  if (t.includes('EDIT')) return 'EDIT'
  if (t.includes('QUERY')) return 'QUERY'
  if (t.includes('KNOWLEDGE')) return 'KNOWLEDGE'
  // CREATE is the safe default for anything else (new media / unrecognized).
  return 'CREATE'
}

function extractAIText(messages: BaseMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg._getType() !== 'ai') continue
    const content = msg.content
    if (typeof content === 'string' && content.trim()) return content.trim()
  }
  return null
}

async function sendOwnerReply(
  input: RouteInput,
  body: string
): Promise<void> {
  await sendWhatsAppMessage(input.ownerPhone, { type: 'text', text: { body } })
  logOutboundMessage(input.supabase, {
    companyId: input.companyId,
    contactPhone: input.ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
}

// Send a multi-part reply as ordered, sequential WhatsApp messages so a long
// answer arrives as several short bubbles instead of one wall of text. Mirrors
// sendOwnerReply's fire-and-forget logging for each chunk.
async function sendOwnerReplyChunks(
  input: RouteInput,
  chunks: string[]
): Promise<void> {
  for (const chunk of chunks) {
    await sendWhatsAppMessage(input.ownerPhone, { type: 'text', text: { body: chunk } })
    logOutboundMessage(input.supabase, {
      companyId: input.companyId,
      contactPhone: input.ownerPhone,
      body: chunk,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
  }
}

async function classify(
  normalizedText: string,
  session: Session | null,
  history: BaseMessage[]
): Promise<Intent> {
  const sessionState = session?.state ?? 'none'
  const hasDraft = Boolean(session?.draft_estimate_id)

  const systemPrompt = `You are an intent classifier for a contractor's WhatsApp estimating assistant.

Current session state: ${sessionState}
A pending estimate draft awaiting confirmation: ${hasDraft ? 'YES' : 'NO'}

Classify the owner's latest message into EXACTLY ONE of these labels. Reply with ONLY the label, nothing else:

- CONFIRM_OR_CANCEL: the owner wants to SEND/deliver or DISCARD/cancel the pending draft. Only valid when the session is awaiting_confirm.
- EDIT: the owner wants to CHANGE a field of the pending draft (total, timeline, client, summary, payment terms). Only valid when the session is awaiting_confirm.
- CREATE: a NEW job description (text, or a new audio/photo describing work). This is the DEFAULT for new media when intent is not clearly edit/confirm, and the default when there is NO active session.
- QUERY: a QUESTION about EXISTING data ("qual o ultimo estimate do cliente X", "status do projeto Y", "quanto ficou o orcamento do Joao", "what's the latest quote for Maria").
- KNOWLEDGE: a trade HOW-TO / process / best-practice question that does NOT depend on this company's own data ("how do I pre-treat a pet stain?", "what's the correct order for pressure-washing a deck?", "como faço a remoção de odor de pet em carpete?").

DISAMBIGUATION — QUERY vs KNOWLEDGE (decide carefully):
- QUERY = a question about THIS company's OWN records: its estimates, clients, projects, or its own price book ("what did I quote Maria?", "what's my price for window cleaning?").
- KNOWLEDGE = generic trade know-how / process that any contractor in this trade would ask, independent of this company's data.
- Ambiguous "how should I price X?": prefer QUERY if it references THIS company's price book / past jobs; prefer KNOWLEDGE if it's a generic best-practice question.

Use the recent conversation history for context. Reply with ONLY one of: CONFIRM_OR_CANCEL, EDIT, CREATE, QUERY, KNOWLEDGE.`

  const model = new ChatOpenAI({
    apiKey: (await getIntegrationKey('openai')) ?? undefined,
    model: 'gpt-4o',
    temperature: 0,
  })

  const result = await model.invoke([
    new SystemMessage(systemPrompt),
    ...history,
    new HumanMessage(normalizedText),
  ])

  const content = result.content
  const raw = typeof content === 'string' ? content : JSON.stringify(content)
  return parseIntent(raw)
}

// ---------------------------------------------------------------------------
// QUERY dispatch — ReAct agent over company-scoped read-only tools
// ---------------------------------------------------------------------------

// Build a compact, human-readable profile block from whatever company fields
// are present. Null/empty fields are skipped. Never throws.
function buildCompanyProfileBlock(
  company: {
    name?: string | null
    owner_name?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
  } | null
): string {
  const lines: string[] = []
  if (company?.name) lines.push(`- Business name: ${company.name}`)
  if (company?.owner_name) lines.push(`- Owner: ${company.owner_name}`)
  if (company?.phone) lines.push(`- Phone: ${company.phone}`)
  if (company?.email) lines.push(`- Email: ${company.email}`)
  if (company?.website) lines.push(`- Website: ${company.website}`)
  return lines.length > 0 ? lines.join('\n') : '- (no additional profile on file)'
}

async function dispatchQuery(input: RouteInput, normalizedText: string): Promise<void> {
  // Fetch the resolved company's profile (scoped to the trusted companyId).
  // Reuse input.supabase — already a service client (same as query-tools). The
  // LLM's only grounding is this profile + tool results; missing row degrades
  // gracefully and never throws.
  const { data: company } = await input.supabase
    .from('companies')
    .select('name, owner_name, phone, email, website')
    .eq('id', input.companyId)
    .maybeSingle()

  const profile = company as {
    name?: string | null
    owner_name?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
  } | null
  const companyName = (profile?.name as string) || 'this business'
  const companyProfileBlock = buildCompanyProfileBlock(profile)

  const tools = makeQueryTools(input.companyId, input.supabase)
  const llm = new ChatOpenAI({
    apiKey: (await getIntegrationKey('openai')) ?? undefined,
    model: 'gpt-4o',
    temperature: 0,
  })

  // T-mk4-01/02: this prompt only REINFORCES single-tenant isolation in natural
  // language. The actual isolation control is the companyId closure inside
  // makeQueryTools — no tool schema accepts a tenant, so the LLM cannot switch
  // companies even under prompt injection.
  const systemPrompt = `You are the Xtimator assistant for ${companyName}, helping this business owner over WhatsApp.

WHO YOU ARE TALKING TO
- This conversation belongs to ONE company: ${companyName}. The person messaging is verified by their registered phone number.
- You can ONLY see and talk about this company's data. You have no access to any other company, customer, or account. Never reference, compare to, or reveal anything outside this company.
- If asked about another business or data you don't have, say you can only help with this company.

WHAT YOU KNOW (your only source of truth)
- Everything you answer MUST come from the company profile below and the data returned by your tools. That is all you know.
${companyProfileBlock}

HARD RULES — NEVER BREAK
1. NEVER invent, guess, or assume information. If it is not in the company profile or a tool result, you do not know it.
2. If the answer isn't available, say so plainly and offer what you CAN help with.
3. Never make up prices, dates, client names, totals, or policies. Quote only exact values from tool results.
4. Never expose internal IDs or another company's information.
5. Stay on topic: this company's estimates, quotes, services, pricing, clients, projects.

HOW TO REPLY
- Be short, warm, and human. Reply in the SAME language the user writes in.
- Keep each message to 1-3 short sentences. No long walls of text.
- If the answer needs several points, separate them with a blank line so they can be sent as multiple short messages.
- Lead with the answer; add a short follow-up question only when it helps.
- For numbers/prices/dates, state them exactly as they appear in tool results.

WHEN UNSURE
- Don't bluff. Briefly say what you don't have, then suggest the closest thing you CAN do.`

  const agent = createReactAgent({ llm, tools })
  const result = await agent.invoke({
    messages: [new SystemMessage(systemPrompt), new HumanMessage(normalizedText)],
  })

  const aiText = extractAIText((result as { messages: BaseMessage[] }).messages)
  const fallback = "I couldn't find an answer to that."
  let chunks = splitReply(aiText ?? fallback)
  if (chunks.length === 0) chunks = [fallback]
  await sendOwnerReplyChunks(input, chunks)
}

// ---------------------------------------------------------------------------
// KNOWLEDGE dispatch — channel-neutral RAG answer over the industry KB + overlay
// ---------------------------------------------------------------------------

async function dispatchKnowledge(
  input: RouteInput,
  normalizedText: string
): Promise<void> {
  // Read the resolved company's industries[] (+ language) with the trusted
  // service client — same posture as dispatchQuery's company read. industries[]
  // is the retrieval scope; it is CALLER-SUPPLIED to answer(), NEVER from the LLM.
  const { data: company } = await input.supabase
    .from('companies')
    .select('industries, default_estimate_language')
    .eq('id', input.companyId)
    .maybeSingle()

  const industries =
    (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)
    ?.default_estimate_language
  const language =
    lang === 'pt' || lang === 'es' || lang === 'en' ? lang : undefined

  // askKnowledge() (over answer()) NEVER throws — returns a safe FALLBACK
  // string on any failure. companyId scopes the optional company overlay;
  // industries[] scopes the shared industry KB. retrieve() merges both inside
  // the RPC.
  const text = await askKnowledge(normalizedText, {
    industries,
    companyId: input.companyId,
    language,
  })

  const fallback = "I couldn't find an answer to that."
  let chunks = splitReply(text)
  if (chunks.length === 0) chunks = [fallback]
  await sendOwnerReplyChunks(input, chunks)
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function classifyAndRoute(input: RouteInput): Promise<void> {
  const { companyId, ownerPhone, fromPhone, message, session, supabase } = input

  // 1. Normalize (audio→transcript, photo→analysis, text→as-is). Never throws.
  const normalized = await normalizeMessage(message, companyId, supabase)
  if (!normalized.ok || !normalized.text) {
    const body =
      normalized.kind === 'audio'
        ? "Sorry, I couldn't read your audio. Please describe the job in a text message."
        : normalized.kind === 'photo'
          ? "Sorry, I couldn't read your photo. Please describe the job in a text message."
          : 'Sorry, I can only process text, audio, or photo messages. Please describe the job in a text message.'
    await sendOwnerReply(input, body)
    return
  }

  // 2. History for classifier context.
  const history = await loadConversationHistory(supabase, companyId, ownerPhone)

  // 3. Classify. If the classifier is unavailable/misconfigured, keep the
  // primary estimating flow alive by falling back to the safe CREATE path.
  let intent: Intent
  try {
    intent = await classify(normalized.text, session, history)
  } catch (err) {
    console.error('[WhatsApp] intent classification failed; defaulting to CREATE', err)
    intent = 'CREATE'
  }

  // 4. Dispatch to the existing flow.
  switch (intent) {
    case 'CONFIRM_OR_CANCEL': {
      if (session) {
        await processConfirmationReply(
          normalized.text,
          session,
          companyId,
          ownerPhone,
          supabase
        )
        return
      }
      // No session to confirm against — fall through to CREATE.
      await dispatchCreate(input, message, session)
      return
    }
    case 'EDIT': {
      if (session) {
        await runConfirmationAgent(normalized.text, session, companyId, ownerPhone, supabase)
        return
      }
      await dispatchCreate(input, message, session)
      return
    }
    case 'QUERY': {
      await dispatchQuery(input, normalized.text)
      return
    }
    case 'KNOWLEDGE': {
      await dispatchKnowledge(input, normalized.text)
      return
    }
    case 'CREATE':
    default: {
      await dispatchCreate(input, message, session)
      return
    }
  }

  async function dispatchCreate(
    inp: RouteInput,
    msg: WhatsAppMessage,
    sess: Session | null
  ): Promise<void> {
    // Discard the pending draft + session so the new content starts fresh.
    if (sess) await actionCancel(sess, inp.supabase)
    // processInboundMessages(messages, companyId, fromPhone, supabase) — fromPhone WITHOUT '+'
    await processInboundMessages([msg], inp.companyId, inp.fromPhone, inp.supabase)
  }
}
