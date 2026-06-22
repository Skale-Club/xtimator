/**
 * lib/estimate/quality/vagueness.ts
 *
 * Channel-neutral estimate quality gate. Moved verbatim from the WhatsApp
 * ask-details helpers (Phase 94, D-03 / ENGINE-03) so the shared estimate domain
 * core can reuse it without importing anything channel-specific.
 *
 * The old ask-details import path keeps working via a re-export from that file.
 *
 * This module MUST stay channel-neutral: it imports nothing from a single
 * channel module (ENGINE-01 static neutrality gate).
 */

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
