import { describe, it, expect } from 'vitest'

/**
 * ENGINE-03 — `isVagueEstimate` at the shared path.
 *
 * `isVagueEstimate` moves verbatim from `lib/whatsapp/ask-details.ts` into the channel-neutral
 * `lib/estimate/quality/vagueness.ts`. The truth table below is copied from
 * `tests/unit/whatsapp/ask-details.test.ts` to prove the moved function is byte-identical in
 * behavior. The old `@/lib/whatsapp/ask-details` import keeps working via a re-export (D-03),
 * which `ask-details.test.ts` continues to verify.
 */

import { isVagueEstimate } from '@/lib/estimate/quality/vagueness'

describe('ENGINE-03: isVagueEstimate at the shared path (@/lib/estimate/quality/vagueness)', () => {
  it('true when total is 0 (with items)', () => {
    expect(isVagueEstimate({ total: 0, sections: [{ items: [{}] }] })).toBe(true)
  })

  it('true when total is null', () => {
    expect(isVagueEstimate({ total: null, sections: [{ items: [{}] }] })).toBe(true)
  })

  it('true when sections have empty items', () => {
    expect(isVagueEstimate({ total: 100, sections: [{ items: [] }] })).toBe(true)
  })

  it('true when sections is null', () => {
    expect(isVagueEstimate({ total: 100, sections: null })).toBe(true)
  })

  it('true when estimate is null', () => {
    expect(isVagueEstimate(null)).toBe(true)
  })

  it('false when total > 0 and at least one item exists', () => {
    expect(isVagueEstimate({ total: 100, sections: [{ items: [{}] }] })).toBe(false)
  })
})
