/**
 * lib/estimate/graph/nodes/recover-draft.ts
 *
 * SEED-057 D: the targeted refine pass is an OPTIMISATION on top of a draft that is
 * already good enough to deliver. If that second generation fails (provider down,
 * schema retry exhausted, or a write that throws midway), the right outcome is the
 * first draft, not a failed job and not an empty project.
 *
 * It restores `previousEstimateId` as the project's current estimate (and clears the
 * flag on every other version, including a half-written newer one), puts the project
 * back to estimate_ready with that estimate's total, and hands the draft to finalize.
 * The draft keeps its ai_meta.quality, so the owner still sees the review banner.
 *
 * Never throws: if even the restore fails, it falls through to onError semantics by
 * leaving the failure in state.
 */
import { requireServiceClient } from '@/lib/supabase/service'
import type { EstimateStateType } from '../state'

export const recoverDraftNode = async (
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> => {
  const previousId = state.previousEstimateId
  if (!previousId) return {}
  try {
    const supabase = requireServiceClient()
    const { data: previous } = await supabase
      .from('estimates')
      .select('id, total')
      .eq('id', previousId)
      .eq('company_id', state.companyId) // trusted scope, never LLM-derived
      .maybeSingle()
    if (!previous) return {}

    // Every other version of this project stops being current first, then the draft is.
    await supabase
      .from('estimates')
      .update({ is_current: false })
      .eq('project_id', state.projectId)
      .eq('company_id', state.companyId)
      .neq('id', previousId)
    await supabase
      .from('estimates')
      .update({ is_current: true })
      .eq('id', previousId)
      .eq('company_id', state.companyId)
    await supabase
      .from('projects')
      .update({ status: 'estimate_ready', total: (previous as { total: number }).total })
      .eq('id', state.projectId)
      .eq('company_id', state.companyId)

    console.warn('[estimate-graph] targeted refine failed; delivering the first draft', {
      reason: state.failure?.reason,
    })
    return {
      estimateId: previousId,
      isVague: false,
      structureBand: undefined,
      structureHints: undefined,
      previousEstimateId: undefined,
    }
  } catch (err) {
    console.error('[estimate-graph] could not restore the first draft:', err)
    return {}
  }
}
