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
 *
 * RFALL-02 — the Ellen rule, refined. This gate distinguishes a genuinely
 * valueless estimate from a partially-priced one that merely carries a flagged
 * unpriced line:
 *   - Whole estimate empty / nothing priced (no items, or every item $0 → total 0)
 *     → STILL vague (block → needs-details).
 *   - At least one priced item (total > 0) with a flagged unpriced line among the
 *     priced ones → NOT vague (allow → the estimate proceeds; the unpriced line is
 *     surfaced via the existing awaiting_details path).
 *
 * IMPORTANT: the verdict keys on the AGGREGATE `total`, never on per-item prices.
 * A flagged unpriced line is just another item (possibly unit_price 0); once
 * total > 0 it does NOT flip `hasTotal`/`hasItems`, so a partially-priced estimate
 * is never blocked just because one line is flagged. Do NOT add a per-item $0
 * branch here — that would re-block partially-priced estimates (the never-$0
 * fallback ladder). The contract is locked by
 * tests/unit/estimate/vagueness-flagged-unpriced.test.ts.
 */
export function isVagueEstimate(e: VagueCheckEstimate | null): boolean {
  if (e == null) return true
  const hasTotal = e.total != null && e.total > 0
  const hasItems = (e.sections ?? []).some((s) => (s?.items?.length ?? 0) > 0)
  return !hasTotal || !hasItems
}
