'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { embed, embedMany } from '@/lib/knowledge/embed'
import { isKnownIndustry } from '@/lib/industries'
import { knowledgeEntrySchema, type KnowledgeEntryInput } from '@/lib/schemas/knowledge'
import type { KnowledgeImportRow } from '@/lib/csv/knowledge-import'

/**
 * app/admin/knowledge/actions.ts
 *
 * KCUR-01 + KCUR-02: super-admin industry KB curation data layer. Mirrors the
 * proven CRUD shape of app/admin/blog/actions.ts:
 *   requireAdmin() FIRST  -> safeParse -> embed (KCUR-02) -> requireServiceClient()
 *   write -> revalidatePath -> void logAdminAction(...) -> { ok:true }
 *
 * Industry rows are service-role-write BY DESIGN (Phase 117 created NO industry
 * write policy; the service client bypasses RLS). The requireAdmin() gate is the
 * ONLY access control — it MUST run before any service-client write.
 *
 * KCUR-02: embed `title + '\n\n' + body` BEFORE the write. If embed() throws the
 * save is BLOCKED (return ok:false, no row written) — a NULL-embedding industry
 * row is invisible to retrieve() (the HNSW KNN can't rank it), so we never write
 * one. This is the FIRST writer of the `embedding vector(1536)` column.
 */
export type KnowledgeActionResult =
  | { ok: true; imported?: number }
  | { ok: false; message: string }

/**
 * Serialize a number[] embedding for the pgvector column. supabase-js sends a
 * plain array as a JSON array, which pgvector accepts as a vector literal; if a
 * future driver rejects it (`invalid input syntax for type vector`), the
 * `[1,2,3]` string literal that pgvector parses is the documented fallback. We
 * pass the JSON-stringified literal so the write format is unambiguous on this
 * first-ever write to the column.
 */
function toVectorLiteral(vec: number[]): string {
  return JSON.stringify(vec)
}

export async function createEntry(data: KnowledgeEntryInput): Promise<KnowledgeActionResult> {
  const ctx = await requireAdmin() // gate FIRST — the service client bypasses RLS
  const parsed = knowledgeEntrySchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  // KCUR-02: embed-then-insert. Block the save if the embedding can't be made.
  let embedding: number[]
  try {
    embedding = await embed(`${parsed.data.title}\n\n${parsed.data.body}`)
  } catch {
    return { ok: false, message: 'Could not generate embedding — entry not saved. Try again.' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('knowledge_entries').insert({
    scope: 'industry',
    industry_id: parsed.data.industry_id,
    company_id: null, // industry rows: company_id NULL (scope CHECK)
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source ?? null,
    embedding: toVectorLiteral(embedding), // first writer of the vector column
  })
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/knowledge')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'knowledge_entry.save',
    targetType: 'knowledge_entry',
    targetId: parsed.data.industry_id,
    metadata: { scope: 'industry' },
  })

  return { ok: true }
}

export async function updateEntry(
  id: string,
  data: KnowledgeEntryInput
): Promise<KnowledgeActionResult> {
  const ctx = await requireAdmin() // gate FIRST
  const parsed = knowledgeEntrySchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('knowledge_entries')
    .select('title, body')
    .eq('id', id)
    .single()

  // Re-embed ONLY when title or body changed (source-only edits skip the embed).
  const needsEmbed =
    !existing || existing.title !== parsed.data.title || existing.body !== parsed.data.body

  let embedding: number[] | undefined
  if (needsEmbed) {
    try {
      embedding = await embed(`${parsed.data.title}\n\n${parsed.data.body}`)
    } catch {
      return { ok: false, message: 'Could not generate embedding — entry not saved. Try again.' }
    }
  }

  const payload: Record<string, unknown> = {
    industry_id: parsed.data.industry_id,
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source ?? null,
    updated_at: new Date().toISOString(),
    ...(needsEmbed && embedding ? { embedding: toVectorLiteral(embedding) } : {}),
  }

  const { error } = await svc.from('knowledge_entries').update(payload).eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/knowledge')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'knowledge_entry.save',
    targetType: 'knowledge_entry',
    targetId: id,
    metadata: { scope: 'industry', reembedded: needsEmbed },
  })

  return { ok: true }
}

export async function deleteEntry(id: string): Promise<KnowledgeActionResult> {
  const ctx = await requireAdmin() // gate FIRST
  const svc = requireServiceClient()
  const { error } = await svc.from('knowledge_entries').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/knowledge')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'knowledge_entry.delete',
    targetType: 'knowledge_entry',
    targetId: id,
  })

  return { ok: true }
}

/**
 * KCUR-03: bulk import. Seed an ENTIRE industry's KB in one operation. The CSV
 * carries only title,body,source — the industry is chosen in the UI (one import
 * = one industry), so `industryId` is applied to EVERY inserted row.
 *
 * Mirrors importPriceBookItems (lib/actions/price-book.ts): server-side
 * re-validate -> filter -> a SINGLE bulk .insert. Two KCUR guardrails:
 *   - requireAdmin() FIRST — the only access control (service client bypasses RLS).
 *   - batch-embed every valid row via embedMany() BEFORE the insert; a batch-embed
 *     failure aborts the WHOLE import (transactional feel — no partial/NULL-embedding
 *     rows reach the table, Pitfall 4).
 */
export async function bulkImportEntries(
  industryId: string,
  rows: KnowledgeImportRow[]
): Promise<KnowledgeActionResult> {
  const ctx = await requireAdmin() // gate FIRST — the service client bypasses RLS

  if (!isKnownIndustry(industryId)) {
    return { ok: false, message: 'Unknown industry.' }
  }

  // Server-side re-validate every row (defense in depth — the parser already
  // classified, but never trust the client payload).
  const valid = rows.filter((r) => r.title?.trim() && r.body?.trim())
  if (valid.length === 0) {
    return { ok: false, message: 'No valid rows to import.' }
  }

  // Batch-embed BEFORE any insert. A failure here imports NOTHING (Pitfall 4).
  let embeddings: number[][]
  try {
    embeddings = await embedMany(valid.map((r) => `${r.title.trim()}\n\n${r.body.trim()}`))
  } catch {
    return { ok: false, message: 'Could not generate embeddings — nothing imported. Try again.' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('knowledge_entries').insert(
    valid.map((r, i) => ({
      scope: 'industry',
      industry_id: industryId,
      company_id: null, // industry rows: company_id NULL (scope CHECK)
      title: r.title.trim(),
      body: r.body.trim(),
      source: r.source ?? null,
      embedding: toVectorLiteral(embeddings[i]),
    }))
  )
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/knowledge')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'knowledge_entry.save',
    targetType: 'knowledge_entry',
    targetId: industryId,
    metadata: { imported: valid.length, industry_id: industryId },
  })

  return { ok: true, imported: valid.length }
}
