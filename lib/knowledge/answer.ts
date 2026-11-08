import 'server-only'
/**
 * lib/knowledge/answer.ts
 *
 * KMOD-03 — the RAG composer every consumer calls. retrieve top-k → hardened
 * RAG prompt (buildKnowledgePrompt, the KSEC-01 boundary) → OpenRouter chat →
 * short conversational answer string.
 *
 * NEVER throws: retrieve() already never-throws ([] on failure); a chat failure
 * (network, non-2xx, error body, empty content) here returns a safe FALLBACK
 * string so a WhatsApp / web / MCP consumer never crashes on a KB or model
 * outage (Pitfall 4: warn, don't swallow silently — but never propagate).
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import { retrieve } from './retrieve'
import { buildKnowledgePrompt } from './prompt'
import { randomUUID } from 'node:crypto'
import { resolveOpenRouterKey, OPENROUTER_BASE, OR_DEFAULTS } from '@/lib/ai/openrouter-client'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import type { RetrieveCtx } from './provider'

export type AnswerCtx = RetrieveCtx & { language?: 'en' | 'pt' | 'es' }

const FALLBACK = "I couldn't find an answer in the knowledge base right now."

export async function answer(question: string, ctx: AnswerCtx): Promise<string> {
  try {
    const passages = await retrieve(question, ctx)
    const { system, user } = buildKnowledgePrompt(passages, question, ctx.language ?? 'en')
    const { apiKey } = await resolveOpenRouterKey(ctx.companyId)
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xtimator.com',
        'X-Title': 'Xtimator',
      },
      body: JSON.stringify({
        model: OR_DEFAULTS.chat,
        max_tokens: 600,
        usage: { include: true },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) {
      console.warn('[knowledge] answer chat failed:', res.status)
      return FALLBACK
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      error?: { message?: string }
      usage?: { cost?: number }
    }
    if (json.error?.message) {
      console.warn('[knowledge] answer chat error:', json.error.message)
      return FALLBACK
    }
    // Phase 3 (3.8): record the answer call (MEASURE-ONLY 'chat': no knowledge
    // operation type exists and no migration is allowed; never debited).
    await recordAICost({
      attemptId: randomUUID(),
      operationType: 'chat',
      provider: 'openrouter',
      model: OR_DEFAULTS.chat,
      realCostUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null,
      companyId: ctx.companyId ?? null,
    })
    const content = json.choices?.[0]?.message?.content?.trim()
    return content && content.length > 0 ? content : FALLBACK
  } catch (err) {
    console.warn('[knowledge] answer failed (returning fallback):', err)
    return FALLBACK
  }
}
