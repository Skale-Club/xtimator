import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 176 Plan 03 — isWithinQuietHours() enforces the platform-wide
 * 8am-8pm recipient-local quiet-hours window (Operational Decision #3, the
 * stricter FL/OK statute convention adopted platform-wide). Pure function:
 * one Intl.DateTimeFormat local-hour computation per zone, ALL zones in the
 * array must independently pass (intersection) — split-timezone-state
 * clients are evaluated against the most restrictive zone, never a single
 * arbitrarily-picked one.
 */

afterEach(() => {
  vi.useRealTimers()
})

describe('lib/notifications/quiet-hours — isWithinQuietHours()', () => {
  it('allows a send at noon Eastern (single zone)', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    // Noon EDT (UTC-4) mid-summer = 16:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))
    expect(isWithinQuietHours(['America/New_York'])).toBe(true)
  })

  it('blocks a send at 7:00am Eastern (before window)', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    // 7:00am EDT (UTC-4) mid-summer = 11:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T11:00:00Z'))
    expect(isWithinQuietHours(['America/New_York'])).toBe(false)
  })

  it('blocks a send at exactly 8:00pm Eastern (end hour exclusive)', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    // 8:00pm EDT (UTC-4) mid-summer = 00:00 UTC next day
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'))
    expect(isWithinQuietHours(['America/New_York'])).toBe(false)
  })

  it('allows a send at exactly 8:00am Eastern (start hour inclusive)', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    // 8:00am EDT (UTC-4) mid-summer = 12:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
    expect(isWithinQuietHours(['America/New_York'])).toBe(true)
  })

  it('blocks a split-zone send when ONE zone is outside the window (intersection)', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    // 8:30am EDT (NY) = 12:30 UTC = 7:30am CDT (Chicago, UTC-5) -> Chicago fails
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T12:30:00Z'))
    expect(isWithinQuietHours(['America/New_York', 'America/Chicago'])).toBe(false)
  })

  it('allows a split-zone send when BOTH zones are within the window', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    // Noon EDT (NY) = 16:00 UTC = 11:00am CDT (Chicago) -> both pass
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))
    expect(isWithinQuietHours(['America/New_York', 'America/Chicago'])).toBe(true)
  })

  it('is DST-aware — same nominal local clock time resolves correctly in summer vs winter', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')

    // Noon Eastern in mid-summer: EDT is UTC-4 -> 16:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))
    expect(isWithinQuietHours(['America/New_York'])).toBe(true)
    vi.useRealTimers()

    // Noon Eastern in mid-winter: EST is UTC-5 -> 17:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T17:00:00Z'))
    expect(isWithinQuietHours(['America/New_York'])).toBe(true)
    vi.useRealTimers()

    // Prove no hardcoded offset: the WINTER UTC instant for "noon Eastern
    // summer" (16:00 UTC) is actually 11:00am EST in winter -> still true
    // (inside window), but the July UTC offset (-4) applied to a January
    // instant would be wrong; assert the actual DST-correct boundary case
    // instead — 8:00pm EDT in summer (00:00 UTC) is NOT 8:00pm EST in winter.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-16T00:00:00Z')) // 7:00pm EST (winter)
    expect(isWithinQuietHours(['America/New_York'])).toBe(true) // would be false if summer offset were hardcoded
  })

  it('returns false for an empty zones array (defensive fail-closed)', async () => {
    const { isWithinQuietHours } = await import('@/lib/notifications/quiet-hours')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))
    expect(isWithinQuietHours([])).toBe(false)
  })
})
