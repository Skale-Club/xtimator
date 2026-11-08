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
import { requireServiceClient } from '@/lib/supabase/service'
import { KNOWLEDGE_MAX_ENTRIES, type KnowledgeSnippet } from './prompt-sections'

/** Embedding + vector search budget; past this the estimate goes without. */
const KNOWLEDGE_TIMEOUT_MS = 4_000
const QUERY_MAX_CHARS = 800

/**
 * Minimum cosine similarity (1 - cosine distance, the RPC's `similarity`) for an entry to be
 * handed to the estimator. match_knowledge_entries has no floor of its own and always returns
 * its top k, so a company with three unrelated rules would have them injected into every job.
 * For text-embedding-3-small, related short texts land around 0.35-0.6 and unrelated ones
 * under ~0.2; 0.30 keeps the genuinely related and drops the noise.
 */
export const KNOWLEDGE_MIN_SIMILARITY = 0.3

/**
 * Cheap guard: is there ANYTHING the lookup could return (an industry entry, or one of this
 * company's own)? One indexed row read instead of an embedding call per generation. Fails
 * OPEN: if the check itself errors, retrieval runs as before.
 */
async function hasAnyKnowledge(companyId: string): Promise<boolean> {
  try {
    const { data, error } = await requireServiceClient()
      .from('knowledge_entries')
      .select('id')
      .or(`scope.eq.industry,and(scope.eq.company,company_id.eq.${companyId})`)
      .limit(1)
    if (error || !Array.isArray(data)) return true
    return data.length > 0
  } catch {
    return true
  }
}

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
  if (!(await hasAnyKnowledge(args.companyId))) return []
  let timer: ReturnType<typeof setTimeout> | undefined
  // The budget below must CANCEL the embedding fetch, not merely stop waiting for it.
  const controller = new AbortController()
  try {
    const passages = await Promise.race([
      retrieve(args.query, {
        industries: args.industries,
        companyId: args.companyId,
        k: KNOWLEDGE_MAX_ENTRIES,
        signal: controller.signal,
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller.abort()
          resolve(null)
        }, args.timeoutMs ?? KNOWLEDGE_TIMEOUT_MS)
      }),
    ])
    if (!passages) return []
    return passages
      .slice(0, KNOWLEDGE_MAX_ENTRIES)
      .filter((p) => typeof p.body === 'string' && p.body.trim().length > 0)
      .filter((p) => typeof p.similarity !== 'number' || p.similarity >= KNOWLEDGE_MIN_SIMILARITY)
      .map((p) => ({ title: p.title ?? '', body: p.body }))
  } catch (err) {
    console.warn('[knowledge-context] retrieval failed (continuing without):', err)
    return []
  } finally {
    if (timer) clearTimeout(timer)
  }
}
