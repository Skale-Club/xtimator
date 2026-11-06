import 'server-only'
/**
 * lib/ai/knowledge-context.ts
 *
 * SEED-057 Phase B (E5): feed the company's Knowledge base to the estimator.
 * Settings -> Knowledge has long collected house rules and prices, but nothing
 * in the generation path read them (Q8). This is the read boundary: top-5
 * entries for the job, never throws, bounded in time, so a knowledge outage can
 * only ever cost the estimate its extra context, never the estimate itself.
 *
 * Multi-tenant: `companyId` and `industries` come from the trusted company row,
 * never from model output; the scoping itself lives in the retrieve() RPC.
 * The entries are untrusted TEXT: the prompt builder escapes them and wraps each
 * in a <knowledge> tag (lib/ai/prompt-sections.ts knowledgeUserBlock).
 */
import { retrieve } from '@/lib/knowledge/retrieve'
import { KNOWLEDGE_MAX_ENTRIES, type KnowledgeSnippet } from './prompt-sections'

/** Embedding + vector search budget; past this the estimate goes without. */
const KNOWLEDGE_TIMEOUT_MS = 4_000
const QUERY_MAX_CHARS = 800

/** A retrieval query that describes the job: its name plus the start of what was said. */
export function buildKnowledgeQuery(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim())
    .join('\n')
    .slice(0, QUERY_MAX_CHARS)
}

export async function loadKnowledgeContext(args: {
  companyId: string
  industries: string[]
  query: string
  /** Test seam; production uses the default budget. */
  timeoutMs?: number
}): Promise<KnowledgeSnippet[]> {
  if (!args.query.trim()) return []
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const passages = await Promise.race([
      retrieve(args.query, {
        industries: args.industries,
        companyId: args.companyId,
        k: KNOWLEDGE_MAX_ENTRIES,
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), args.timeoutMs ?? KNOWLEDGE_TIMEOUT_MS)
      }),
    ])
    if (!passages) return []
    return passages
      .slice(0, KNOWLEDGE_MAX_ENTRIES)
      .filter((p) => typeof p.body === 'string' && p.body.trim().length > 0)
      .map((p) => ({ title: p.title ?? '', body: p.body }))
  } catch (err) {
    console.warn('[knowledge-context] retrieval failed (continuing without):', err)
    return []
  } finally {
    if (timer) clearTimeout(timer)
  }
}
