/**
 * POST /api/chat — the in-app chat backend (CHATBE-02 / CHATMETER-01).
 *
 * The single owner-only, tenant-scoped chat turn endpoint. It:
 *   1. Authenticates the owner (Supabase auth.getClaims) → 401 when absent.
 *   2. Resolves the ACTIVE company (getActiveCompanyId) — the trusted tenant.
 *      companyId is NEVER read from the request body / the LLM (T-lrf-01).
 *   3. Reads the owner's retrieval scope (industries[] + reply language) from the
 *      companies row via the SERVICE client (mirrors intent-router's company read).
 *   4. Streams a tool-calling turn via streamText with the Plan-01 neutral tools
 *      and the owner-only system prompt, then returns toUIMessageStreamResponse.
 *   5. Persists the NEW assistant/tool tail in onFinish via the Phase-123
 *      appendMessage helper (creating the conversation first when absent).
 *
 * ───────────────────────── CHATMETER-01 / Pitfall 4 ──────────────────────────
 * This route adds NO credit debit (no recordCreditDebit / grantCredits /
 * consumeCredits). Estimate generation debits inside its existing Inngest job
 * (lib/inngest/functions/generate-estimate.ts `record-credit-debit` step); the
 * conversation turn is ABSORBED per v4.7. Adding a debit here would double-charge
 * generation or wrongly charge the conversation. A static regression test
 * (tests/unit/chat/credit-reuse.test.ts) asserts this file stays debit-free.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Runtime: the DEFAULT Node runtime — do NOT opt into edge (Pitfall 6). The
 * neutral tools rely on node:crypto + the Inngest client + the service client,
 * none of which run on the edge runtime.
 */
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { resolveChatModel } from '@/lib/chat/provider'
import { buildChatTools } from '@/lib/chat/tools'
import { CHAT_SYSTEM_PROMPT } from '@/lib/chat/system-prompt'
import {
  createConversation,
  appendMessage,
  type ChatRole,
} from '@/lib/queries/chat'

export async function POST(req: Request) {
  // 1. Authenticate the owner.
  const supabaseAuth = await createClient()
  const { data: claimsData } = await supabaseAuth.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims?.sub) {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = claims.sub as string

  // 2. Resolve the ACTIVE company — the trusted tenant (never from the body).
  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return new Response('No active company', { status: 400 })
  }

  // 3. Read the owner's retrieval scope (industries[] + reply language) with the
  //    SERVICE client — same posture as intent-router's company read. The data
  //    reads inside buildChatTools also expect a service-role client.
  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('industries, default_estimate_language')
    .eq('id', companyId)
    .maybeSingle()
  const industries =
    (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)
    ?.default_estimate_language
  const language =
    lang === 'en' || lang === 'pt' || lang === 'es' ? lang : undefined

  // 4. Parse the turn. companyId/conversationId are server-trusted; the LLM never
  //    chooses the tenant — only `messages` is user/model content.
  const { messages, conversationId }: { messages: UIMessage[]; conversationId?: string } =
    await req.json()

  // 5. Resolve the model (Plan-01 slot resolver) + build the neutral tools with
  //    the trusted companyId + service client + owner scope.
  const model = await resolveChatModel(companyId)
  const tools = buildChatTools({ companyId, supabase: svc as never, industries, language })

  const modelMessages = await convertToModelMessages(messages)
  const result = streamText({
    model,
    system: CHAT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  })

  // 6. Stream back, persisting the NEW tail in onFinish (Pitfall 3 — never
  //    mid-stream). A persistence hiccup must NEVER break the already-streamed
  //    response, so the whole block is best-effort (try/catch + console.warn).
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: full }) => {
      try {
        // Resolve the conversation: create one when the client did not supply an id.
        let convId = conversationId
        if (!convId) {
          const conv = await createConversation(userId)
          if (!conv?.id) return
          convId = conv.id
        }

        // Persist only the NEW tail (the assistant/tool turn appended this round).
        const tail = full.slice(messages.length)
        for (const m of tail) {
          await appendMessage({
            conversationId: convId,
            role: m.role as ChatRole,
            parts: m.parts,
          })
        }
      } catch (err) {
        console.warn('[api/chat] failed to persist chat turn', err)
      }
    },
  })
}
