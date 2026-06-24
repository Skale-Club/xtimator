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
import { getORKey, OPENROUTER_BASE } from '@/lib/ai/openrouter-client'

// Model-agnostic via a module const; pinned to 1536-dim for the vector(1536)
// column. A future swap is a one-line change here (+ a cheap ALTER ... TYPE
// vector(N) reindex on the empty curated table).
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

export async function embed(text: string): Promise<number[]> {
  const apiKey = await getORKey()
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xtimator.com',
      'X-Title': 'Xtimator',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown')
    throw new Error(`OpenRouter embeddings failed (${res.status}): ${err.slice(0, 400)}`)
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>
    error?: { message?: string }
  }
  if (json.error?.message) {
    throw new Error(`OpenRouter embeddings error: ${json.error.message}`)
  }
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
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const apiKey = await getORKey()
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
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: chunk }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown')
      throw new Error(`OpenRouter embeddings failed (${res.status}): ${err.slice(0, 400)}`)
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>
      error?: { message?: string }
    }
    if (json.error?.message) {
      throw new Error(`OpenRouter embeddings error: ${json.error.message}`)
    }
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
