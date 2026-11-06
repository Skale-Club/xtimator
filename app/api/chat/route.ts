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
 * ───────────────── SEED-055 Phase D: chat is metered, for everyone ────────────
 * The in-app chat is available on every plan; credits are the only wall.
 *   - BEFORE the model is built, `assertCanCreate(companyId,
 *     estimatedCreditsByOp.chat)` gates the turn. A denial is a 402 with the
 *     same contract as the other AI routes: { error: 'plan_limit_reached',
 *     reason: 'credits', state, upgradeUrl } (UpgradeModal reads it).
 *   - AFTER the turn, the conversation's OWN model cost (summed over the
 *     streamText steps) is debited once via recordCreditDebit({ operationType:
 *     'chat' }) under a per-turn attempt id (idempotent on replay).
 *   - Never double-charged: when the turn calls the create-estimate tool,
 *     estimate generation debits itself inside its own Inngest job; only this
 *     route's model usage is debited here.
 * The per-minute rate limit (absorbedChatRateLimitPerMin) stays as abuse
 * protection. tests/unit/chat/credit-reuse.test.ts asserts exactly one `chat`
 * debit per turn and none on the 402 path.
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
import { rateLimit } from '@/lib/ratelimit'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { assertCanCreate } from '@/lib/billing/access-state'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'

// Pre-launch audit fix (B9): every other AI endpoint has a rate limit; this
// one didn't. It stays as abuse protection now that the turn is also credit
// metered (SEED-055 Phase D). Also caps message count as a blunt guard against a
// single request carrying an absurd synthetic history.
const MAX_MESSAGES_PER_TURN = 100

type OpenRouterMeta = { openrouter?: { usage?: { cost?: number | null } } } | undefined

function costOf(meta: unknown): number | null {
  const cost = (meta as OpenRouterMeta)?.openrouter?.usage?.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null
}

/**
 * The turn's real USD model cost: sum of every step that reported one, else the
 * stream-level metadata, else null (unknown - never a guessed 0).
 */
async function readTurnCostUsd(result: {
  steps: PromiseLike<ReadonlyArray<{ providerMetadata?: unknown }>>
  providerMetadata: PromiseLike<unknown>
}): Promise<number | null> {
  let total: number | null = null
  for (const step of await result.steps) {
    const c = costOf(step.providerMetadata)
    if (c != null) total = (total ?? 0) + c
  }
  return total ?? costOf(await result.providerMetadata)
}

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
    .select('industries, default_estimate_language')
    .eq('id', companyId)
    .maybeSingle()
  const industries =
    (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)
    ?.default_estimate_language
  const language =
    lang === 'en' || lang === 'pt' || lang === 'es' ? lang : undefined

  // 3b. Credit gate (SEED-055 Phase D). Runs BEFORE resolveChatModel /
  //     buildChatTools / streamText so a blocked tenant triggers no model build.
  //     Same 402 contract as the other AI routes; inert while enforcement is OFF.
  const gate = await assertCanCreate(companyId, billingCfg.estimatedCreditsByOp?.chat ?? 1)
  if (!gate.ok) {
    return new Response(
      JSON.stringify({
        error: 'plan_limit_reached',
        reason: 'credits',
        state: gate.code,
        upgradeUrl: '/settings/billing',
      }),
      { status: 402, headers: { 'content-type': 'application/json' } },
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

  // 5b. Cost capture + debit. OpenRouter reports each step's real USD cost in
  //     providerMetadata once the stream settles; the turn's cost is the sum
  //     over its steps (a tool loop makes several model calls). A provider that
  //     reports nothing records null, never a guessed 0 - and a null cost is
  //     never debited. The SAME per-turn attemptId keys the cost event and the
  //     debit, so a replay cannot charge twice. Fire-and-forget: awaiting would
  //     delay the stream; both helpers are never-throw.
  const attemptId = crypto.randomUUID()
  void (async () => {
    try {
      const realCostUsd = await readTurnCostUsd(result)
      await recordAICost({
        attemptId,
        operationType: 'chat',
        provider: 'openrouter',
        realCostUsd,
        companyId,
        model: typeof model === 'object' && model && 'modelId' in model
          ? (model as { modelId?: string }).modelId ?? null
          : null,
      })
      await recordCreditDebit({ companyId, operationType: 'chat', realCostUsd, attemptId })
    } catch (err) {
      console.warn('[chat] cost capture / debit skipped:', err instanceof Error ? err.message : err)
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
