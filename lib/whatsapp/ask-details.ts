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
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

/**
 * Phase 94 (D-03 / ENGINE-03): `isVagueEstimate` + `VagueCheckEstimate` were
 * MOVED to the channel-neutral `lib/estimate/quality/vagueness.ts`. They are
 * re-exported here so the existing `@/lib/whatsapp/ask-details` import path
 * (used by callers + tests) keeps working unchanged.
 */
export {
  isVagueEstimate,
  type VagueCheckEstimate,
} from '@/lib/estimate/quality/vagueness'

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
 * Phase 96 (D-05): moved to lib/estimate/quality/revert.ts (channel-neutral).
 * Re-exported here for backward compat — existing callers and tests keep working.
 */
export { revertVagueEstimate } from '@/lib/estimate/quality/revert'
