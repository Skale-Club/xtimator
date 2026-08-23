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
 * This route adds NO credit mutation. Estimate generation debits inside its
 * existing Inngest job (lib/inngest/functions/generate-estimate.ts
 * `record-credit-debit` step); the conversation turn is ABSORBED per v4.7. Adding
 * a debit here would double-charge generation or wrongly charge the conversation.
 * A static regression test (tests/unit/chat/credit-reuse.test.ts) asserts this
 * file imports/calls none of the credit-ledger debit/grant/consume helpers.
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
import { demoGuardResponse } from '@/lib/demo/guard'
import { CHAT_SYSTEM_PROMPT } from '@/lib/chat/system-prompt'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import {
  createConversation,
  appendMessage,
  findMessageRow,
  type ChatRole,
} from '@/lib/queries/chat'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { rateLimit } from '@/lib/ratelimit'
import { getBillingConfig } from '@/lib/billing/billing-config'

// Pre-launch audit fix (B9): every other AI endpoint has a rate limit; this
// one didn't (the turn itself is credit-absorbed per CHATMETER-01, so this IS
// its only cost control). Also caps message count as a blunt guard against a
// single request carrying an absurd synthetic history.
const MAX_MESSAGES_PER_TURN = 100

export async function POST(req: Request) {
  // 1. Authenticate the owner.
  const supabaseAuth = await createClient()
  const { data: claimsData } = await supabaseAuth.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims?.sub) {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = claims.sub as string
  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return new Response('No active company', { status: 400 })
  }
  const blocked = await demoGuardResponse({
    userId,
    email: (claims.email as string | undefined) ?? null,
    companyId,
  })
  if (blocked) return blocked

  // 1b. Rate limit (pre-launch audit fix B9) — runtime-tunable via
  // billing_config.absorbedChatRateLimitPerMin (default 20/min) so it can be
  // tightened without a deploy. Checked before any DB/model work.
  const billingCfg = await getBillingConfig()
  const rl = await rateLimit('chatPerMinute', userId, billingCfg.absorbedChatRateLimitPerMin)
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'rate_limit', retryAfter: rl.retryAfter }),
      {
        status: 429,
        headers: { 'content-type': 'application/json', 'Retry-After': String(rl.retryAfter ?? 60) },
      }
    )
  }

  // 2. Resolve the ACTIVE company — the trusted tenant (never from the body).
  // 3. Read the owner's retrieval scope (industries[] + reply language) with the
  //    SERVICE client — same posture as intent-router's company read. The data
  //    reads inside buildChatTools also expect a service-role client.
  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('industries, default_estimate_language, tier')
    .eq('id', companyId)
    .maybeSingle()
  const industries =
    (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)
    ?.default_estimate_language
  const language =
    lang === 'en' || lang === 'pt' || lang === 'es' ? lang : undefined

  // 3b. Entitlement gate (CHATMETER-02, SECURITY boundary): the in-app chat is a
  //     Pro/Business feature. This 403 MUST run BEFORE resolveChatModel /
  //     buildChatTools / streamText so an unentitled tenant triggers no model
  //     build (mirrors the send-whatsapp channel gate; bare Response to match
  //     this file's 401/400 style). The page gate (Plan 02) is additive UX only.
  const tier = (company as { tier?: string | null } | null)?.tier ?? 'free'
  if (!(await getEntitlementsForTier(tier)).chatEnabled) {
    return new Response(
      JSON.stringify({ error: 'chat_not_on_plan', upgradeUrl: '/settings/billing' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )
  }

  // 4. Parse the turn. companyId/conversationId are server-trusted; the LLM never
  //    chooses the tenant — only `messages` is user/model content.
  const { messages, conversationId }: { messages: UIMessage[]; conversationId?: string } =
    await req.json()

  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES_PER_TURN) {
    return new Response(
      JSON.stringify({ error: 'bad_request', reason: 'Too many messages in this turn' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    )
  }

  // 5. Resolve the model (Plan-01 slot resolver) + build the neutral tools with
  //    the trusted companyId + service client + owner scope.
  const model = await resolveChatModel(companyId)
  // Demo contexts already returned above, so tools receive only a writable
  // normal-tenant request context.
  const tools = buildChatTools({ companyId, supabase: svc as never, industries, language, isDemo: false })

  const modelMessages = await convertToModelMessages(messages)
  const result = streamText({
    model,
    system: CHAT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  })

  // 5b. MEASURE-ONLY cost capture (CR13). Chat is an ABSORBED cost — it never
  //     debits credits (this route calls no charging helper at all — the
  //     CHATMETER-01 guard test enforces that — and 'chat' is not
  //     in credit_ledger's operation_type CHECK) — but it must still be
  //     MEASURED, or the calibration model counts absorbed spend as zero.
  //     OpenRouter reports the turn's real USD cost in providerMetadata once
  //     the stream settles; a provider that reports nothing records null,
  //     never a guessed 0. Fire-and-forget: awaiting would delay the stream,
  //     and recordAICost is itself never-throw.
  void (async () => {
    try {
      const meta = (await result.providerMetadata) as
        | { openrouter?: { usage?: { cost?: number | null } } }
        | undefined
      const cost = meta?.openrouter?.usage?.cost
      await recordAICost({
        attemptId: crypto.randomUUID(),
        operationType: 'chat',
        provider: 'openrouter',
        realCostUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
        companyId,
        model: typeof model === 'object' && model && 'modelId' in model
          ? (model as { modelId?: string }).modelId ?? null
          : null,
      })
    } catch (err) {
      console.warn('[chat] absorbed-cost capture skipped:', err instanceof Error ? err.message : err)
    }
  })()

  // 6. Stream back, persisting the NEW tail in onFinish (Pitfall 3 — never
  //    mid-stream). A persistence hiccup must NEVER break the already-streamed
  //    response, so the whole block is best-effort (try/catch + console.warn).
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Server-generated response-message id: the client adopts it from the start
    // chunk, so the LIVE UIMessage id and the persisted client_id below are the
    // SAME id — votes/edit/regenerate keyed client-side survive a reload.
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ messages: full }) => {
      try {
        // Resolve the conversation: create one when the client did not supply an id.
        let convId = conversationId
        if (!convId) {
          const conv = await createConversation(userId)
          if (!conv?.id) return
          convId = conv.id
        }

        // The turn's user message is NOT in the tail (the client sent it inside
        // `messages`) — persist it here, insert-once by UIMessage id so an
        // edit-resend (whose row editChatMessage already rewrote) or a
        // regenerate (same user message re-sent) never duplicates the row.
        const lastUser = [...messages].reverse().find((m) => m.role === 'user')
        if (lastUser) {
          const existing = await findMessageRow(convId, lastUser.id)
          if (!existing) {
            await appendMessage({
              conversationId: convId,
              role: 'user',
              parts: lastUser.parts,
              clientId: lastUser.id,
            })
          }
        }

        // Persist the NEW tail (the assistant/tool turn appended this round).
        // clientId keeps the UIMessage id across reloads (votes/edit/regenerate).
        const tail = full.slice(messages.length)
        for (const m of tail) {
          await appendMessage({
            conversationId: convId,
            role: m.role as ChatRole,
            parts: m.parts,
            clientId: m.id,
          })
        }
      } catch (err) {
        console.warn('[api/chat] failed to persist chat turn', err)
      }
    },
  })
}
