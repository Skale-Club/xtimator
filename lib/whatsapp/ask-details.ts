/**
 * Quick task 260529-lc0: WhatsApp "ask for more details" helpers.
 *
 * When an inbound WhatsApp message is too vague to price, the estimate comes
 * back with total == 0 and/or no line items. Instead of sending a useless $0
 * estimate + send/cancel prompt, the bot asks the owner for more details and
 * opens an `awaiting_details` session so the next message complements the SAME
 * project and regenerates.
 *
 * These helpers are WhatsApp-only — generateEstimateForProject (shared with the
 * UI/MCP) is intentionally NOT touched.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

/** Minimal shape needed to decide whether an estimate is too vague to price. */
export type VagueCheckEstimate = {
  total: number | null
  sections: Array<{ items?: Array<unknown> | null }> | null
}

/**
 * An estimate is "vague" when the total is <= 0 (null treated as 0) OR there is
 * not a single line item across all sections.
 */
export function isVagueEstimate(e: VagueCheckEstimate | null): boolean {
  const totalNum = e?.total ?? 0
  const hasItems = (e?.sections ?? []).some(
    (s) => (s?.items?.length ?? 0) > 0
  )
  return totalNum <= 0 || !hasItems
}

const MESSAGES: Record<EstimateLanguage, string> = {
  pt:
    'Preciso de mais alguns detalhes para preparar o orçamento. Pode me dizer: o ' +
    'tipo de serviço, a área (m² ou cômodos), os materiais e o prazo desejado?',
  en:
    "I need a few more details to put together your estimate. Could you tell me: " +
    'the type of service, the area (sq ft or rooms), the materials, and the ' +
    'deadline/timeline?',
  es:
    'Necesito algunos detalles más para preparar el presupuesto. ¿Puede decirme: ' +
    'el tipo de servicio, el área (m² o habitaciones), los materiales y el plazo ' +
    'deseado?',
}

/**
 * Localized prompt asking the owner for the details needed to price the job.
 * Always mentions the 4 examples: service type, area, materials, deadline.
 * Unknown languages fall back to English.
 */
export function buildAskDetailsMessage(language: EstimateLanguage): string {
  return MESSAGES[language] ?? MESSAGES.en
}

/**
 * Removes the $0 estimate (cascade deletes its sections/items, same pattern as
 * confirm.ts handleRegenerate) and reverts the project to draft / total 0 so the
 * next inbound message regenerates cleanly against the same project.
 *
 * Does not throw when estimateId is null/undefined — it only reverts the project.
 */
export async function revertVagueEstimate(
  supabase: SupabaseClient,
  projectId: string,
  estimateId: string | null
): Promise<void> {
  if (estimateId) {
    // cascade removes estimate_sections + estimate_items
    await supabase.from('estimates').delete().eq('id', estimateId)
  }
  await supabase
    .from('projects')
    .update({ status: 'draft', total: 0 })
    .eq('id', projectId)
}
