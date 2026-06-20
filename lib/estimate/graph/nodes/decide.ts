/**
 * lib/estimate/graph/nodes/decide.ts
 *
 * CORE conditional-edge functions (channel-neutral). Verbatim port of the
 * WhatsApp graph's routing logic, with the failure read generalized from the
 * per-channel `generationFailed` boolean to the `failure?` state channel
 * (ENGINE-04). Edge target strings map to the graph node names wired in
 * index.ts; the adapter supplies the terminal behavior (onError / finalize).
 */
import type { EstimateStateType } from '../state'

/**
 * After generate: a failure (or a missing estimateId) routes to the adapter's
 * onError terminal; otherwise continue to the vagueness assessment.
 */
export function checkGeneratedEdge(state: EstimateStateType): string {
  return state.failure || !state.estimateId ? 'onError' : 'assess'
}

/**
 * After assess: a vague estimate routes to the adapter's "ask for details" /
 * refine finalize; a usable estimate routes to the confirm finalize.
 */
export function checkVagueEdge(state: EstimateStateType): string {
  return state.isVague ? 'finalizeAsk' : 'finalizeConfirm'
}

/**
 * After assess (Phase 96, D-01): routes to autoRefine for a first vague
 * result (cap-guarded), or to finalize when the estimate is non-vague OR
 * refineAttempts >= 1. This replaces the direct assess → finalize edge.
 *
 * The adapter's finalize branches internally on state.isVague to produce the
 * channel-appropriate needs_details outcome when refineAttempts >= 1.
 */
export function checkVagueAfterAssessEdge(state: EstimateStateType): string {
  if (!state.isVague) return 'finalize'
  if ((state.refineAttempts ?? 0) < 1) return 'autoRefine'
  return 'finalize'
}
