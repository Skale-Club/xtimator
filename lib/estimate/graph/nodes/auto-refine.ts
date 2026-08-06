/**
 * lib/estimate/graph/nodes/auto-refine.ts
 *
 * CORE auto-refine node (Phase 96, D-02 / SMART-01 / ENGINE-01).
 *
 * Channel-neutral: imports NOTHING from any channel-specific module. The
 * ENGINE-01 static neutrality gate (graph-neutrality.test.ts) will catch any
 * violation at test time.
 *
 * Fires when the assess node sets isVague=true and refineAttempts <
 * AUTO_REFINE_MAX_ATTEMPTS (configurable cap, default 1 — see decide.ts, HARD-06;
 * originally a hard cap=1 per D-01). Responsibilities:
 *   1. Increment refineAttempts (undefined → 1).
 *   2. Delete the $0 estimate + revert project to draft (best-effort — errors
 *      swallowed; consistent with WhatsApp adapter pattern).
 *   3. Reset estimateId: undefined, isVague: undefined so the next generate
 *      → assess cycle starts clean.
 *   4. Append a refinement hint to prompts so the next generate pass tries harder.
 *
 * companyId MUST come from state.companyId (trusted graph input, set from the
 * Inngest event payload server-side). It is NEVER a function parameter that an
 * LLM could override (QA-02 multi-tenant isolation invariant).
 */
import { requireServiceClient } from '@/lib/supabase/service'
import { revertVagueEstimate } from '@/lib/estimate/quality/revert'
import { reportGeneratePhase } from '@/lib/observability/generation-phase'
import type { EstimateStateType } from '../state'

const REFINE_HINT =
  'Note: the previous estimate was flagged as too vague or incomplete. ' +
  'Please generate a more detailed estimate with specific line items, ' +
  'quantities, material specs, and realistic unit pricing.'

export const autoRefineNode = async (
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> => {
  // Sub-phase narration (lib/estimate/generation-phases.ts): this is the ONE
  // place that knows a second pass is starting, and without it the overlay
  // silently replays "drafting" with no explanation for the extra minutes.
  // `round` is 1-based: the first auto-refine is round 1.
  reportGeneratePhase({
    attemptId: state.attemptId,
    phase: 'refining',
    companyId: state.companyId,
    projectId: state.projectId,
    detail: { round: (state.refineAttempts ?? 0) + 1 },
  })

  const supabase = requireServiceClient()
  // Best-effort revert — swallow errors (consistent with WhatsApp adapter pattern).
  //
  // QUICK-mv1-01 (zero side effects on discard): this revert intentionally does
  // NOT restore projects.name/project_type. The rename + project_type write in
  // generateEstimateForProject (lib/services/generate-estimate.ts) now happens
  // AFTER persistence and is gated on the SAME vagueness verdict assessNode
  // re-derives from the just-persisted rows — the exact estimate we are about to
  // revert HERE never touched projects.name/project_type in the first place (it
  // was vague ⇒ the generate call skipped those writes). There is nothing to
  // restore; adding restore logic here would be dead code for the current
  // mechanism. If that gating is ever removed, this revert must be revisited.
  //
  // QUICK-psh-01 (classify-why + clarifying questions): for the SAME reason,
  // this node never calls buildNeedsDetails / touches projects.needs_details.
  // This node only runs on the FIRST vague verdict (refineAttempts still below
  // the cap when checkVagueAfterAssessEdge routes here) — the SINGLE final-vague
  // terminal that calls buildNeedsDetails is the default adapter's `finalize`,
  // reached only once refineAttempts >= 1 AND the estimate is still vague. If
  // this node ever wired needs_details too, an attempt that succeeds on its
  // retry would incorrectly carry a stale needs_details from its first (never
  // shown) vague pass.
  try {
    await revertVagueEstimate(supabase, state.projectId, state.estimateId ?? null)
  } catch {
    // non-fatal — the generate loop can still run without the revert completing
  }
  return {
    refineAttempts: (state.refineAttempts ?? 0) + 1,
    estimateId: undefined,
    isVague: undefined,
    prompts: [...(state.prompts ?? []), REFINE_HINT],
  }
}
