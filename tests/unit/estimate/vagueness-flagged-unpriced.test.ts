import { describe, it, expect } from 'vitest'

/**
 * RFALL-02 — the Ellen rule, refined. Contract lock for `isVagueEstimate`.
 *
 * The vagueness gate must distinguish a GENUINELY VALUELESS estimate from a
 * PARTIALLY-PRICED estimate that merely carries a flagged unpriced line:
 *
 *   - Whole estimate empty / nothing priced (no items, or every item $0 → total 0)
 *     → STILL vague (block → needs-details). The WhatsApp/needs-details path relies
 *     on this exact verdict and must not regress.
 *   - At least one priced item (total > 0) with a flagged unpriced line among the
 *     priced ones → NOT vague (allow → the estimate proceeds; the unpriced line is
 *     surfaced for the owner to fill via the existing awaiting_details path).
 *
 * The gate keys on the AGGREGATE `total`, never on per-item prices — so a flagged
 * unpriced line (modeled as just another item, possibly unit_price 0) never flips
 * the verdict once total > 0. These assertions exist so a future reader does not
 * "fix" the gate back into a per-item block, which would re-block partially-priced
 * estimates (the never-$0 fallback ladder, Plans 108-03/04).
 */

import { isVagueEstimate } from '@/lib/estimate/quality/vagueness'

describe('RFALL-02: isVagueEstimate — empty/all-$0 (vague) vs flagged-unpriced (not vague)', () => {
  it('Test 1 — still vague: total 0 with no sections/items', () => {
    expect(isVagueEstimate({ total: 0, sections: [] })).toBe(true)
  })

  it('Test 2 — still vague: null total with an empty items array', () => {
    expect(isVagueEstimate({ total: null, sections: [{ items: [] }] })).toBe(true)
  })

  it('Test 3 — still vague: items exist but total 0 (all-$0 / genuinely valueless)', () => {
    expect(isVagueEstimate({ total: 0, sections: [{ items: [{}, {}] }] })).toBe(true)
  })

  it('Test 4 — NOT vague (the new case): total > 0 with a flagged unpriced line among priced items', () => {
    expect(isVagueEstimate({ total: 250, sections: [{ items: [{}, {}, {}] }] })).toBe(false)
  })

  it('Test 5 — regression: null estimate is vague', () => {
    expect(isVagueEstimate(null)).toBe(true)
  })

  it('Test 6 — regression: happy path (priced, items present) is not vague', () => {
    expect(isVagueEstimate({ total: 1000, sections: [{ items: [{}] }] })).toBe(false)
  })
})
