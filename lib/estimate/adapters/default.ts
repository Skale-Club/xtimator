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
 *   - onError:  no-op — returns {} (Phase 95 decides re-throw-so-Inngest-onFailure
 *               -fires vs surface-as-state for the web/MCP channel).
 *
 * This module imports NOTHING from lib/whatsapp/* — the WhatsApp adapter is the
 * only place WhatsApp code lives (ENGINE-01 neutrality).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'

/**
 * Default (web/MCP) ChannelAdapter closure-factory. Mirrors the WhatsApp adapter
 * shape (companyId/supabase captured in the closure, never graph-input fields).
 * ownerPhone is intentionally absent — web/MCP have no per-message reply target.
 */
export function makeDefaultAdapter(_args: {
  companyId: string
  supabase: SupabaseClient
}): ChannelAdapter {
  return {
    channel: 'web',

    // Passthrough — web/MCP inputs are already ingested upstream (Phase 95).
    async ingest(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      return {}
    },

    // No-op — the HTTP/poll layer surfaces the estimate (Phase 95).
    async finalize(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      return {}
    },

    // No-op — Phase 95 decides re-throw (Inngest onFailure) vs surface-as-state.
    async onError(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
      return {}
    },
  }
}
