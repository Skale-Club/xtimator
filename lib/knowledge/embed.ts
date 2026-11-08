import 'server-only'
/**
 * lib/knowledge/embed.ts
 *
 * KMOD-01: embed(text) -> number[1536] via OpenRouter's /embeddings endpoint.
 * Reuses getORKey + OPENROUTER_BASE from lib/ai/openrouter-client (the same key
 * + base every other OpenRouter call uses) — NO SDK, plain fetch, NO new dep.
 *
 * embed is the BUILDING BLOCK and MAY throw (bad shape / non-2xx). retrieve()
 * (Plan 02) is the never-throws wrapper that catches it. Do NOT swallow errors
 * here.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import { randomUUID } from 'node:crypto'
import { resolveOpenRouterKey, OPENROUTER_BASE, type CostContext } from '@/lib/ai/openrouter-client'
import { recordAICost } from '@/lib/billing/record-ai-cost'

// Model-agnostic via a module const; pinned to 1536-dim for the vector(1536)
// column. A future swap is a one-line change here (+ a cheap ALTER ... TYPE
// vector(N) reindex on the empty curated table).
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/**
 * Phase 3: `costContext` is optional/additive. companyId selects the company's
 * BYOK key (D3) and attributes the cost row; absent (admin curation, no tenant)
 * -> platform key, unattributed row. Embedding spend is MEASURE-ONLY: there is
 * no embedding operation type (no migration allowed), so it is recorded as
 * 'chat' and never debited.
 */
async function recordEmbeddingCost(
  costContext: CostContext | undefined,
  realCostUsd: number | null,
  units: number
): Promise<void> {
  await recordAICost({
    attemptId: costContext?.attemptId ?? randomUUID(),
    operationType: 'chat',
    provider: 'openrouter',
    model: EMBEDDING_MODEL,
    realCostUsd,
    companyId: costContext?.companyId ?? null,
    projectId: costContext?.projectId ?? null,
    units,
  })
}

const costOf = (u: { cost?: number } | undefined): number | null =>
  typeof u?.cost === 'number' && Number.isFinite(u.cost) ? u.cost : null

export async function embed(
  text: string,
  costContext?: CostContext,
  opts?: { signal?: AbortSignal }
): Promise<number[]> {
  const { apiKey } = await resolveOpenRouterKey(costContext?.companyId)
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xtimator.com',
      'X-Title': 'Xtimator',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, usage: { include: true } }),
    // A caller with a time budget (knowledge-context.ts: 4 s) cancels the request for real.
    signal: opts?.signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenRouter embeddings failed (${res.status}): ${err.slice(0, 400)}`)
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>
    error?: { message?: string }
    usage?: { cost?: number }
  }
  if (json.error?.message) {
    throw new Error(`OpenRouter embeddings error: ${json.error.message}`)
  }
  await recordEmbeddingCost(costContext, costOf(json.usage), 1)
  const vec = json.data?.[0]?.embedding
  if (!vec || vec.length !== 1536) {
    throw new Error(`Unexpected embedding shape (len=${vec?.length ?? 'none'})`)
  }
  return vec
}

/**
 * KCUR-03: batched embedding for bulk import. OpenRouter's /embeddings is
 * OpenAI-compatible and accepts an ARRAY `input`; the response `data[]` carries
 * an `index` field that preserves position. We chunk at BATCH (≤96 inputs per
 * request — the documented OpenAI/OpenRouter cap), sort each chunk's `data` by
 * `index` so the output order matches the input order, and validate every
 * vector's 1536-dim shape.
 *
 * Mirrors the single-row embed() fetch above (same key/base/headers/model) so
 * EMBEDDING_MODEL stays the single source of truth. MAY throw on a non-2xx or a
 * malformed/short embedding (Pitfall 4: fail the whole import rather than insert
 * a partial/NULL-embedding set). Empty input → [] with zero fetches.
 *
 * Consumed by Plan 02's bulk import; the single-row embed() above is unchanged.
 */
export async function embedMany(
  texts: string[],
  costContext?: CostContext
): Promise<number[][]> {
  if (texts.length === 0) return []
  const { apiKey } = await resolveOpenRouterKey(costContext?.companyId)
  const out: number[][] = []
  const BATCH = 96 // OpenRouter/OpenAI typical max inputs per request
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH)
    const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xtimator.com',
        'X-Title': 'Xtimator',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: chunk, usage: { include: true } }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenRouter embeddings failed (${res.status}): ${err.slice(0, 400)}`)
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>
      error?: { message?: string }
      usage?: { cost?: number }
    }
    if (json.error?.message) {
      throw new Error(`OpenRouter embeddings error: ${json.error.message}`)
    }
    await recordEmbeddingCost(costContext, costOf(json.usage), chunk.length)
    const sorted = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (sorted.length !== chunk.length) {
      throw new Error(
        `Unexpected embeddings count (got ${sorted.length}, expected ${chunk.length})`
      )
    }
    for (const d of sorted) {
      if (!d.embedding || d.embedding.length !== 1536) {
        throw new Error(`Unexpected embedding shape (len=${d.embedding?.length ?? 'none'})`)
      }
      out.push(d.embedding)
    }
  }
  return out
}
