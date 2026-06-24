'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/knowledge/embed'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import {
  companyKnowledgeEntrySchema,
  type CompanyKnowledgeEntryInput,
} from '@/lib/schemas/knowledge'

/**
 * lib/actions/company-knowledge.ts
 *
 * KOVL-01 + KOVL-02: the per-COMPANY KB overlay data layer — the tenant's OWN
 * settings panel (DISTINCT from the super-admin industry curation in
 * app/admin/knowledge/actions.ts — the two-panel rule).
 *
 * A pure mirror of the Phase-119 super-admin actions with THREE security-critical
 * substitutions:
 *   1. Auth   = tenant active-company context (getClaims + getActiveCompanyId +
 *               assertWritable), NOT requireAdmin().
 *   2. Scope  = scope='company', company_id=<active company>, industry_id=null,
 *               NOT scope='industry'.
 *   3. Client = the RLS-bound AUTHED createClient() from @/lib/supabase/server,
 *               NOT requireServiceClient().
 *
 * The Phase-117 company-overlay RLS policies
 * (knowledge_entries_company_insert/update/delete, gated by company_members)
 * make the authed client the correct, tenant-isolated choice. Using the service
 * client here would be a SECURITY MISTAKE (it bypasses RLS) — so this file
 * deliberately imports NO requireServiceClient / requireAdmin / logAdminAction.
 *
 * KOVL-02: every write embeds `title + '\n\n' + body` BEFORE the insert; an embed
 * failure BLOCKS the save (no NULL-embedding row — invisible to retrieve()).
 * Updates re-embed ONLY when title or body changed.
 */

export type CompanyKnowledgeActionResult = { ok: true } | { ok: false; message: string }

/**
 * Serialize a number[] embedding for the pgvector column. Duplicated (not shared)
 * from the Phase-119 admin action — per 120-RESEARCH the divergence on three
 * axes makes duplication the clarity-preserving choice.
 */
function toVectorLiteral(vec: number[]): string {
  return JSON.stringify(vec)
}

// getAuthContext is duplicated per action file — established codebase convention.
// Copied from lib/actions/estimate-template.ts: the leanest active-company gate.
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  // getActiveCompanyId() already validated company_members membership, so the
  // company row provably exists — skip a redundant SELECT.
  const company = { id: activeCompanyId }

  const denied = await assertWritable() // demo read-only guard: { error } | null
  if (denied) return denied

  return { supabase, company }
}

export async function createCompanyEntry(
  data: CompanyKnowledgeEntryInput
): Promise<CompanyKnowledgeActionResult> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { ok: false, message: ctx.error as string }
  const { supabase, company } = ctx

  const parsed = companyKnowledgeEntrySchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  // KOVL-02: embed BEFORE the write; block the save if the embedding can't be made.
  let embedding: number[]
  try {
    embedding = await embed(`${parsed.data.title}\n\n${parsed.data.body}`)
  } catch {
    return { ok: false, message: 'Could not generate embedding — entry not saved. Try again.' }
  }

  // RLS-bound AUTHED client — the company_insert policy gates by company_members.
  const { error } = await supabase.from('knowledge_entries').insert({
    scope: 'company',
    company_id: company.id,
    industry_id: null, // company rows: industry_id NULL (scope CHECK)
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source ?? null,
    embedding: toVectorLiteral(embedding),
  })
  if (error) return { ok: false, message: 'Failed to save entry. Please try again.' }
  revalidatePath('/settings/knowledge')

  return { ok: true }
}

export async function updateCompanyEntry(
  id: string,
  data: CompanyKnowledgeEntryInput
): Promise<CompanyKnowledgeActionResult> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { ok: false, message: ctx.error as string }
  const { supabase, company } = ctx

  const parsed = companyKnowledgeEntrySchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  // Fetch existing scoped to BOTH the id AND the company (defense-in-depth on top
  // of the company-overlay RLS).
  const { data: existing } = await supabase
    .from('knowledge_entries')
    .select('title, body')
    .eq('id', id)
    .eq('company_id', company.id)
    .maybeSingle()

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

  // No industry_id key — company rows keep industry_id NULL untouched.
  const payload: Record<string, unknown> = {
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source ?? null,
    updated_at: new Date().toISOString(),
    ...(needsEmbed && embedding ? { embedding: toVectorLiteral(embedding) } : {}),
  }

  const { error } = await supabase
    .from('knowledge_entries')
    .update(payload)
    .eq('id', id)
    .eq('company_id', company.id)
  if (error) return { ok: false, message: 'Failed to save entry. Please try again.' }
  revalidatePath('/settings/knowledge')

  return { ok: true }
}

export async function deleteCompanyEntry(id: string): Promise<CompanyKnowledgeActionResult> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { ok: false, message: ctx.error as string }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('knowledge_entries')
    .delete()
    .eq('id', id)
    .eq('company_id', company.id)
  if (error) return { ok: false, message: 'Failed to delete entry. Please try again.' }
  revalidatePath('/settings/knowledge')

  return { ok: true }
}
