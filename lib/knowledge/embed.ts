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
