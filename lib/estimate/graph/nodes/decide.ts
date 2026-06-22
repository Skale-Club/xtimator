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
 * HARD-06 (Phase 102): configurable auto-refine cap. Read once at module load,
 * mirroring the SESSION_TTL_MINUTES tuning-constant pattern. Defaults to 1 —
 * byte-identical to the prior hard-coded `(state.refineAttempts ?? 0) < 1`. An
 * optional non-secret env override (`AUTO_REFINE_MAX_ATTEMPTS`) lets ops tune how
 * many auto-refine loops run before the estimate is finalized as still-vague
 * (which then drives the web recourse banner — Plan 04). A malformed/negative
 * value falls back to the default. Channel-neutral: no DB read, no async, no
 * channel-specific import (graph-neutrality stays green).
 */
const AUTO_REFINE_MAX_ATTEMPTS = (() => {
  const raw = Number(process.env.AUTO_REFINE_MAX_ATTEMPTS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 1
})()

/**
 * After assess (Phase 96, D-01): routes to autoRefine for a still-vague result
 * while refineAttempts is below AUTO_REFINE_MAX_ATTEMPTS, or to finalize when the
 * estimate is non-vague OR the cap has been reached. This replaces the direct
 * assess → finalize edge.
 *
 * The adapter's finalize branches internally on state.isVague to produce the
 * channel-appropriate needs_details outcome when the cap is reached.
 */
export function checkVagueAfterAssessEdge(state: EstimateStateType): string {
  if (!state.isVague) return 'finalize'
  if ((state.refineAttempts ?? 0) < AUTO_REFINE_MAX_ATTEMPTS) return 'autoRefine'
  return 'finalize'
}
