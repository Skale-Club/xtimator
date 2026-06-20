/**
 * lib/estimate/adapters/default.ts
 *
 * Phase 94 stub — minimal placeholder; real web/MCP behavior wired in Phase 95
 * (CHAN-02/03/04). This is a type-correct, WhatsApp-free ChannelAdapter so the
 * shared graph can be composed for web/MCP today without any channel side-effects.
 *
 * Design (D-02): web/MCP transcripts + photo descriptions are already persisted
 * upstream (the decoupled ingestion path), so the graph enters effectively at
 * `generate`. Hence:
 *   - ingest:   passthrough guard — returns {} (Phase 95 wires the real "has
 *               usable input" guard against the already-ingested recordings).
 *   - finalize: no-op — returns {} (the HTTP/poll layer surfaces the estimate).
 *   - onError:  re-throws so Inngest retry + onFailure fires (D-02).
 *
 * This module imports NOTHING from lib/whatsapp/* — the WhatsApp adapter is the
 * only place WhatsApp code lives (ENGINE-01 neutrality).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'
import { revertVagueEstimate } from '@/lib/estimate/quality/revert'

/**
 * Default (web/MCP) ChannelAdapter closure-factory. Mirrors the WhatsApp adapter
 * shape (companyId/supabase captured in the closure, never graph-input fields).
 * ownerPhone is intentionally absent — web/MCP have no per-message reply target.
 */
export function makeDefaultAdapter({ companyId, supabase }: {
  companyId: string
  supabase: SupabaseClient
}): ChannelAdapter {
  return {
    channel: 'web',

    // Passthrough — web/MCP inputs are already ingested upstream (Phase 95).
    async ingest(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      return {}
    },

    // Handles the vague-after-refine path (Phase 96, D-06).
    async finalize(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      // Only act on the final-vague path: autoRefine already ran once (refineAttempts >= 1)
      // and the estimate is still vague. Success path (isVague=false) is a no-op —
      // the HTTP/poll layer surfaces the estimate via job output.
      if (state.isVague && (state.refineAttempts ?? 0) >= 1) {
        // Best-effort revert of the $0 estimate + reset project to draft.
        try {
          await revertVagueEstimate(supabase, state.projectId, state.estimateId ?? null)
        } catch {
          // non-fatal
        }
        // Persist the awaiting_details signal for the web UI (SMART-03).
        // projects.status is unconstrained TEXT — no migration needed (Pitfall 2).
        await supabase
          .from('projects')
          .update({ status: 'awaiting_details' })
          .eq('id', state.projectId)
          .eq('company_id', companyId)  // companyId from closure (QA-02), NOT state
        // Return needsDetails=true so it surfaces in the Inngest job output (SMART-04).
        // /api/jobs/[jobId] returns run.output as-is → MCP callers read output.needsDetails.
        return { needsDetails: true }
      }
      return {}
    },

    // Re-throws so Inngest retry + onFailure fires (D-02).
    async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      throw new Error(state.failure?.reason ?? 'generation_failed')
    },
  }
}
