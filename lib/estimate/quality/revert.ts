/**
 * lib/estimate/quality/revert.ts
 *
 * Shared estimate revert helper (Phase 96, D-05).
 *
 * Moved verbatim from lib/whatsapp/ask-details.ts so the channel-neutral
 * auto-refine node (lib/estimate/graph/nodes/auto-refine.ts) can call it
 * without importing from lib/whatsapp/* (ENGINE-01 neutrality).
 *
 * lib/whatsapp/ask-details.ts re-exports this for backward compat.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Removes the $0 estimate (cascade deletes its sections/items) and reverts
 * the project to draft / total 0 so the next generate cycle starts clean.
 *
 * Does not throw when estimateId is null/undefined — it only reverts the project.
 */
export async function revertVagueEstimate(
  supabase: SupabaseClient,
  projectId: string,
  estimateId: string | null
): Promise<void> {
  if (estimateId) {
    // cascade removes estimate_sections + estimate_items
    await supabase.from('estimates').delete().eq('id', estimateId)
  }
  await supabase
    .from('projects')
    .update({ status: 'draft', total: 0 })
    .eq('id', projectId)
}
