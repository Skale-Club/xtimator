/**
 * lib/estimate/graph/nodes/auto-refine.ts
 *
 * CORE auto-refine node (Phase 96, D-02 / SMART-01 / ENGINE-01).
 *
 * Channel-neutral: imports NOTHING from any channel-specific module. The
 * ENGINE-01 static neutrality gate (graph-neutrality.test.ts) will catch any
 * violation at test time.
 *
 * Fires when the assess node sets isVague=true and refineAttempts < 1 (hard cap=1
 * per D-01). Responsibilities:
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
import type { EstimateStateType } from '../state'

const REFINE_HINT =
  'Note: the previous estimate was flagged as too vague or incomplete. ' +
  'Please generate a more detailed estimate with specific line items, ' +
  'quantities, material specs, and realistic unit pricing.'

export const autoRefineNode = async (
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> => {
  const supabase = requireServiceClient()
  // Best-effort revert — swallow errors (consistent with WhatsApp adapter pattern).
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
