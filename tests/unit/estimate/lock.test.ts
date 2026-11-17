import { describe, it, expect } from 'vitest'
import { isEstimateLocked } from '@/lib/estimate/lock'

// Lock-at-acceptance: an estimate is locked only once the client has ANSWERED
// it (accepted or declined; a signature sets client_response). Sending alone
// does not lock. Plain object literals, hand-computed goldens, no mocking.
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

  it('returns false when sent_at is set but the client has not answered (stays editable)', () => {
    expect(
      isEstimateLocked({ sent_at: '2026-07-01T00:00:00Z', client_response: null })
    ).toBe(false)
  })

  it('returns false when only client_response is passed and it is null', () => {
    expect(isEstimateLocked({ client_response: null })).toBe(false)
  })

  it('returns true when the client accepted (a signature sets client_response)', () => {
    expect(isEstimateLocked({ sent_at: null, client_response: 'accepted' })).toBe(true)
  })

  it('returns true when the client declined', () => {
    expect(
      isEstimateLocked({ sent_at: '2026-07-01T00:00:00Z', client_response: 'declined' })
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
