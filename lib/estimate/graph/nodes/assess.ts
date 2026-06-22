/**
 * lib/estimate/graph/nodes/assess.ts
 *
 * CORE assess node (channel-neutral). Verbatim port of the WhatsApp graph's
 * evaluateVagueness node: re-read the just-generated estimate (total + nested
 * item ids) and run the deterministic, zero-cost isVagueEstimate gate (ENGINE-03)
 * to set state.isVague. No channel-specific I/O — the adapter's finalize reads
 * state.isVague to choose the reply.
 */
import { requireServiceClient } from '@/lib/supabase/service'
import {
  isVagueEstimate,
  type VagueCheckEstimate,
} from '@/lib/estimate/quality/vagueness'
import type { EstimateStateType } from '../state'

export const assessNode = async (
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> => {
  const supabase = requireServiceClient()
  const { data: est } = await supabase
    .from('estimates')
    .select('total, sections:estimate_sections(items:estimate_items(id))')
    .eq('id', state.estimateId!)
    .single()
  const vague = isVagueEstimate(est as VagueCheckEstimate | null)
  return { isVague: vague }
}
