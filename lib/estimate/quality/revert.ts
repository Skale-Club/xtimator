/**
 * lib/estimate/quality/revert.ts
 *
 * Shared estimate revert helper (Phase 96, D-05).
 *
 * Moved verbatim from the WhatsApp ask-details helpers so the channel-neutral
 * auto-refine node can call it without importing any channel-specific module
 * (ENGINE-01 neutrality). The original WhatsApp module re-exports this for
 * backward compatibility.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atomically discards a genuinely vague current version, restoring an earlier
 * usable version when one exists. A read/write error never means vague input.
 * A missing id is a no-op, not permission to reset an unrelated project.
 */
export async function revertVagueEstimate(
  supabase: SupabaseClient,
  projectId: string,
  estimateId: string | null,
  companyId: string,
  status: 'draft' | 'awaiting_details' = 'draft',
): Promise<void> {
  if (!estimateId) return
  const { error } = await supabase.rpc('discard_vague_estimate', {
    p_company_id: companyId,
    p_project_id: projectId,
    p_estimate_id: estimateId,
    p_status: status,
  })
  if (error) throw new Error('Failed to discard vague estimate', { cause: error })
}
