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
