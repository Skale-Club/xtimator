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
 * An estimate is "vague" when total <= 0 (null, 0) OR there are no line items
 * across any section.
 */
export function isVagueEstimate(e: VagueCheckEstimate | null): boolean {
  if (e == null) return true
  const hasTotal = e.total != null && e.total > 0
  const hasItems = (e.sections ?? []).some((s) => (s?.items?.length ?? 0) > 0)
  return !hasTotal || !hasItems
}
