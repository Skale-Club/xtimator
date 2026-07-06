import 'server-only'
/**
 * lib/agent-tools/add-knowledge.ts
 *
 * NEUT — channel-neutral "add a company-scoped knowledge entry" capability.
 * Mirrors the tenant settings action createCompanyEntry
 * (lib/actions/company-knowledge.ts) but for the agent channels: the caller
 * passes a trusted service-role client + resolved companyId. The settings action
 * uses the RLS-bound cookie client; the agent channels use the service client
 * with an explicit company_id filter — exactly like create_estimate and the
 * query-company-data reads.
 *
 * KOVL-02: the embedding is generated synchronously BEFORE the insert — a
 * NULL-embedding row is invisible to match_knowledge_entries (the HNSW KNN skips
 * NULLs). An embed failure BLOCKS the save; we never persist a blind row.
 *
 * The scope discriminator is hardcoded scope='company' + industry_id=null
 * (the Phase-117 scope CHECK). `companyId` and `supabase` are TRUSTED params,
 * NEVER LLM tool-input fields.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { embed } from '@/lib/knowledge/embed'
import { companyKnowledgeEntrySchema } from '@/lib/schemas/knowledge'

export type AddKnowledgeInput = { title: string; body: string; source?: string | null }

export type AddKnowledgeResult = { ok: true; id: string } | { ok: false; message: string }

export async function addCompanyKnowledge(
  supabase: SupabaseClient,
  companyId: string,
  input: AddKnowledgeInput,
): Promise<AddKnowledgeResult> {
  const parsed = companyKnowledgeEntrySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  // Embed BEFORE the write; block the save if the embedding can't be made.
  let embedding: number[]
  try {
    embedding = await embed(`${parsed.data.title}\n\n${parsed.data.body}`)
  } catch {
    return { ok: false, message: 'Could not generate embedding — entry not saved. Try again.' }
  }

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert({
      scope: 'company',
      company_id: companyId,
      industry_id: null, // company rows carry industry_id NULL (scope CHECK)
      title: parsed.data.title,
      body: parsed.data.body,
      source: parsed.data.source ?? null,
      embedding: JSON.stringify(embedding),
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, message: 'Failed to save the knowledge entry. Please try again.' }
  }
  return { ok: true, id: (data as { id: string }).id }
}
