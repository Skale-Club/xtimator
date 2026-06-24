import 'server-only'
/**
 * lib/knowledge/retrieve.ts
 *
 * KMOD-02 — the channel-neutral, NEVER-THROWS RAG read boundary. Embeds the
 * question, calls the match_knowledge_entries pgvector RPC (the industry KB +
 * company overlay merge lives in the RPC WHERE — Plan 01 migration), and maps the
 * returned rows to ranked Passage[]. Any failure (embed throw, rpc error, any
 * exception) is a CLEAN MISS → [] (console.warn, never throw) so a WhatsApp / web
 * / MCP consumer never crashes on a KB outage.
 *
 * Multi-tenant invariant: industries[]/companyId are CALLER-SUPPLIED (the
 * company's OWN companies.industries[] / active company) and forwarded verbatim
 * to the RPC — NEVER read from LLM output, NEVER widened here. The scoping is the
 * RPC's job; retrieve only forwards. Do NOT add RLS logic, do NOT throw.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import { embed } from './embed'
import { requireServiceClient } from '@/lib/supabase/service'
import type { Passage, RetrieveCtx } from './provider'

export async function retrieve(question: string, ctx: RetrieveCtx): Promise<Passage[]> {
  try {
    const embedding = await embed(question)
    const svc = requireServiceClient()
    const { data, error } = await svc.rpc('match_knowledge_entries', {
      query_embedding: embedding,
      match_industries: ctx.industries,
      match_company: ctx.companyId,
      match_count: ctx.k ?? 5,
    })
    if (error || !data) {
      if (error) console.warn('[knowledge] retrieve rpc error:', error.message)
      return []
    }
    const k = ctx.k ?? 5
    // The RPC caps via match_count, but cap defensively too so the contract
    // ("top-k passages") holds regardless of the RPC's row count.
    return (data as Passage[]).slice(0, k).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      source: r.source ?? null,
      scope: r.scope,
      similarity: r.similarity,
    }))
  } catch (err) {
    console.warn('[knowledge] retrieve failed (returning []):', err)
    return []
  }
}
