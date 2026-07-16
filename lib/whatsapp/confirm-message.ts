/**
 * lib/whatsapp/confirm-message.ts
 *
 * Localized (pt/en/es) FRAME for the WhatsApp `awaiting_confirm` "estimate ready"
 * confirmation message, plus the partial-success dropped-item note appended to it.
 *
 * WHY A SEPARATE MODULE (sibling to estimate-numbering.ts):
 *   The numbered breakdown lines themselves are LANGUAGE-NEUTRAL (section titles +
 *   formatted currency) and stay in estimate-numbering.ts, whose single documented
 *   responsibility is the ordering invariant. Only the FRAME around that breakdown
 *   — the "Estimate ready" header, the send/cancel instruction, and the edit hint —
 *   is language-specific, so it lives here. Mirrors the localization pattern of
 *   buildAskDetailsMessage (lib/whatsapp/ask-details.ts) and buildWelcomeMessage
 *   (lib/whatsapp/send-welcome.ts): a Record<EstimateLanguage, …> with an
 *   English-first fallback for unknown languages.
 *
 * PROTOCOL KEYWORDS (do NOT translate): the literal *send* and *cancel* tokens are
 * the confirmation protocol the agent + docs key on. Every localized instruction
 * KEEPS those exact tokens and only adds the localized verb as explanation.
 *
 * NUMBER REFERENCES (do NOT translate): the N.M item references in the edit-hint
 * example ("item 1.1", "item 2.3") are the stable display numbers from
 * estimate-numbering.ts; only the surrounding phrasing is localized.
 */
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

// HARD-05: friendly copy for the mediaResults reason vocabulary
// ('download_failed' | 'transcription_failed' | 'empty_transcript' | 'no_message'
// | 'unknown_error'). This is a DEDICATED map, kept SEPARATE from the frozen
// failureReasonToChannelCopy (lib/estimate/failure.ts) whose strings are
// regression-gated and must not be overloaded. Reserved for richer per-reason
// wording; the count-aggregated note below is the minimum the test requires.
const MEDIA_ITEM_NOTE: Record<string, string> = {
  download_failed: "couldn't download",
  transcription_failed: "couldn't transcribe",
  empty_transcript: "couldn't make out",
  no_message: "couldn't read",
  unknown_error: "couldn't process",
}

type ConfirmFrame = {
  /** "Estimate ready" header; the formatted total is appended as ` - ${total}`. */
  header: (total: string) => string
  /** send/cancel instruction — MUST keep the literal *send* / *cancel* tokens. */
  instruction: string
  /** edit hint — MUST keep the N.M example numbers; localize only the phrasing. */
  editHint: string
}

const FRAMES: Record<EstimateLanguage, ConfirmFrame> = {
  en: {
    header: (total) => `Estimate ready - ${total}`,
    instruction: 'Reply *send* to deliver to your client, or *cancel* to discard.',
    editHint:
      'To change something, just tell me — e.g. "change item 1.1 to $120" or "remove item 2.3".',
  },
  pt: {
    header: (total) => `Orçamento pronto - ${total}`,
    instruction: 'Responda *send* para enviar ao cliente, ou *cancel* para descartar.',
    editHint:
      'Para alterar algo, é só me dizer — ex.: "mudar item 1.1 para $120" ou "remover item 2.3".',
  },
  es: {
    header: (total) => `Presupuesto listo - ${total}`,
    instruction: 'Responda *send* para enviarlo al cliente, o *cancel* para descartarlo.',
    editHint:
      'Para cambiar algo, solo dígame — p. ej. "cambiar el ítem 1.1 a $120" o "eliminar el ítem 2.3".',
  },
}

/**
 * Compose ONE localized dropped-item note for a partial-success batch (HARD-05).
 * Count-based and pluralized; the estimate was still built from the usable items.
 * Returns '' when nothing was dropped so callers can omit it entirely. Aggregated
 * to a single line so the never-reply invariant (one reply per batch) stays
 * trivial. Unknown languages fall back to English (English-first principle).
 *
 * The English wording preserves the "couldn't process N ..." substring the
 * batch-reporting regression test greps for — do not reword it.
 */
export function buildDroppedNote(
  language: EstimateLanguage,
  dropped?: { count: number; reasons: string[] }
): string {
  if (!dropped || dropped.count < 1) return ''
  // Touch MEDIA_ITEM_NOTE so the reason vocabulary stays the single source of
  // truth; the count-aggregated line is what the reply surfaces today.
  void MEDIA_ITEM_NOTE
  const n = dropped.count
  switch (language) {
    case 'pt':
      return `Obs.: não consegui processar ${n} mensage${n > 1 ? 'ns' : 'm'}, mas montei o orçamento com o restante.`
    case 'es':
      return `Nota: no pude procesar ${n} mensaje${n > 1 ? 's' : ''}, pero preparé el presupuesto con el resto.`
    case 'en':
    default:
      return `Note: I couldn't process ${n} of your message${n > 1 ? 's' : ''}, but I built your estimate from the rest.`
  }
}

/**
 * Assemble the localized `awaiting_confirm` confirmation body. The numbered
 * `breakdown` and formatted `total` are language-neutral and produced by the
 * caller (numberSections + buildNumberedBreakdownLines + formatMoney); this
 * builder only frames them with the localized header, send/cancel instruction and
 * edit hint, then appends the optional dropped-item note (same single reply — never
 * a second send). Unknown languages fall back to English.
 */
export function buildConfirmMessage(
  language: EstimateLanguage,
  params: { total: string; breakdown: string; droppedNote?: string }
): string {
  const frame = FRAMES[language] ?? FRAMES.en
  const { total, breakdown, droppedNote } = params
  return [
    frame.header(total),
    '',
    breakdown,
    '',
    frame.instruction,
    frame.editHint,
    ...(droppedNote ? ['', droppedNote] : []),
  ].join('\n')
}
