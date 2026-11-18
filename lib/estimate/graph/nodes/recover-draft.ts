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
 * The draft keeps its original quality metadata for the administrative diagnostics.
 *
 * Never throws: if even the restore fails it leaves a failure in state and the graph routes to
 * onError (the outgoing edge is conditional).
 */
import { requireServiceClient } from '@/lib/supabase/service'
import type { EstimateStateType } from '../state'

/** Nothing to fall back to: surface a real failure so the graph routes to onError. */
function unrestorable(state: EstimateStateType): Partial<EstimateStateType> {
  return { failure: state.failure ?? { reason: 'generation_failed' } }
}

export const recoverDraftNode = async (
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> => {
  const previousId = state.previousEstimateId
  if (!previousId) return unrestorable(state)
  try {
    const supabase = requireServiceClient()
    const { data, error } = await supabase.rpc('activate_estimate_version', {
      p_company_id: state.companyId,
      p_project_id: state.projectId,
      p_estimate_id: previousId,
      p_previous_estimate_id: state.estimateId ?? previousId,
      p_project_update: {
        status: state.previousProjectStatus ?? 'estimate_ready',
        ...(state.previousProjectType !== undefined ? { project_type: state.previousProjectType } : {}),
      },
      p_discard_estimate_id: state.estimateId && state.estimateId !== previousId ? state.estimateId : null,
      p_restore: true,
      p_keep_existing: false,
    })
    if (error || (data as { estimate_id?: string } | null)?.estimate_id !== previousId) {
      console.error('[estimate-graph] atomic draft restore failed:', error)
      return unrestorable(state)
    }

    console.warn('[estimate-graph] targeted refine failed; delivering the first draft', {
      reason: state.failure?.reason,
    })
    return {
      estimateId: previousId,
      failure: undefined,
      isVague: false,
      structureBand: undefined,
      structureHints: undefined,
      structureScore: undefined,
      previousStructureScore: undefined,
      previousEstimateId: undefined,
    }
  } catch (err) {
    console.error('[estimate-graph] could not restore the first draft:', err)
    return unrestorable(state)
  }
}
