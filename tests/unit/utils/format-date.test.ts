import { describe, it, expect } from 'vitest'
import { formatDate } from '@/lib/utils/format-date'

describe('formatDate', () => {
  it('formats an ISO date with default numeric options (en-US / UTC)', () => {
    // Pinned to UTC, so the calendar date never drifts with the host timezone.
    expect(formatDate('2026-05-27T00:00:00.000Z')).toBe('5/27/2026')
  })

  it('formats with month-short options as "May 27, 2026"', () => {
    expect(
      formatDate('2026-05-27T00:00:00.000Z', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    ).toBe('May 27, 2026')
  })

  it('returns the same calendar date for a near-midnight UTC instant regardless of host TZ', () => {
    // timeZone:'UTC' is pinned, so this is TZ-independent by construction.
    // 23:30 UTC on 2026-05-27 stays "5/27/2026" (would roll to the 28th in +UTC zones if not pinned).
    expect(formatDate('2026-05-27T23:30:00.000Z')).toBe('5/27/2026')
    // 00:30 UTC on 2026-05-27 stays "5/27/2026" (would roll back to the 26th in -UTC zones if not pinned).
    expect(formatDate('2026-05-27T00:30:00.000Z')).toBe('5/27/2026')
  })

  it('returns an empty string for invalid input (does not throw)', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
})
