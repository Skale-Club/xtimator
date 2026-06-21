/**
 * lib/estimate/adapters/refine.ts
 *
 * Refine ChannelAdapter closure-factory (HARD-01). Lives under lib/estimate/adapters/
 * where channel code is allowed. Mirrors makeDefaultAdapter:
 *   - channel:  'web' — refine is an interactive web-editor operation.
 *   - ingest:   no-op — inputs are assembled upstream (route -> ingestMultimodal) and
 *               handed to the graph as state fields (existingEstimate/instruction).
 *   - finalize: deliberate NO-OP — refine is a PREVIEW (no DB write). The route reads
 *               state.refined and returns it; persistence happens later when the user
 *               clicks Save in the editor (preserves preview-then-save UX).
 *   - onError:  re-throws the typed XtimatorError so the route's outer try/catch ->
 *               asResponse maps it to { error, code } with the right status.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'
import { failureReasonToXtimatorError } from '@/lib/estimate/failure'

export function makeRefineAdapter({ companyId: _companyId, supabase: _supabase }: {
  companyId: string
  supabase: SupabaseClient
}): ChannelAdapter {
  return {
    channel: 'web', // refine is a web-editor operation

    // Inputs assembled upstream (route -> ingestMultimodal); nothing to do here.
    async ingest(): Promise<Partial<EstimateStateType>> {
      return {}
    },

    // PREVIEW: NO DB write — the route reads state.refined and returns it.
    async finalize(): Promise<Partial<EstimateStateType>> {
      return {}
    },

    // Re-throw so the route's outer try/catch -> asResponse maps the failure to the
    // typed { error, code } envelope with the correct status code.
    async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      throw failureReasonToXtimatorError(
        state.failure?.reason ?? 'generation_failed',
        state.failure?.detail
      )
    },
  }
}
