import { describe, it, expect } from 'vitest'
import { isEstimateLocked } from '@/lib/estimate/lock'

// TRUST-01 (Phase 164 Plan 01): shared, pure "is this estimate locked from
// further edits" predicate. Plan 02 imports this for the freeze guards
// (saveEstimate + refine route). Mirrors presentation-settings.test.ts's
// style: plain object literals, hand-computed goldens, no mocking.
describe('isEstimateLocked', () => {
  it('returns false for null', () => {
    expect(isEstimateLocked(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isEstimateLocked(undefined)).toBe(false)
  })

  it('returns false for a draft (sent_at AND client_response both null)', () => {
    expect(isEstimateLocked({ sent_at: null, client_response: null })).toBe(false)
  })

  it('returns true when sent_at is set (client_response still null)', () => {
    expect(
      isEstimateLocked({ sent_at: '2026-07-01T00:00:00Z', client_response: null })
    ).toBe(true)
  })

  it('returns true when client_response is set (sent_at still null — sign sets client_response via respondToEstimate)', () => {
    expect(
      isEstimateLocked({ sent_at: null, client_response: 'accepted' })
    ).toBe(true)
  })

  it('returns true when BOTH sent_at and client_response are set', () => {
    expect(
      isEstimateLocked({
        sent_at: '2026-07-01T00:00:00Z',
        client_response: 'accepted',
      })
    ).toBe(true)
  })
})
