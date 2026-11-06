import { describe, it, expect } from 'vitest'
import { currentMonthlyCreditWindow, topupExpiresAt } from '@/lib/billing/credit-window'

/**
 * SEED-055 Phase C - the monthly credit window (replaces the Phase 142
 * month-grant-key test: the calendar-month key is gone, the lot key is now
 * `grant:{companyId}:{periodKey}` with periodKey = the window start).
 *
 * Pure unit - no mocks, no DB, UTC only.
 */
const d = (iso: string) => new Date(iso)
const iso = (x: Date) => x.toISOString()

describe('currentMonthlyCreditWindow - monthly subscription (window = billing period)', () => {
  it('returns the Stripe period itself when now is inside it', () => {
    const w = currentMonthlyCreditWindow(d('2026-04-15T10:00:00Z'), d('2026-03-20T00:00:00Z'))
    expect(w).not.toBeNull()
    expect(iso(w!.start)).toBe('2026-03-15T10:00:00.000Z')
    expect(iso(w!.end)).toBe('2026-04-15T10:00:00.000Z')
    expect(w!.periodKey).toBe('2026-03-15')
  })

  it('start is inclusive: now exactly at the window start belongs to that window', () => {
    const w = currentMonthlyCreditWindow(d('2026-04-15T10:00:00Z'), d('2026-03-15T10:00:00Z'))
    expect(w!.periodKey).toBe('2026-03-15')
  })

  it('end is exclusive: now one millisecond before periodEnd is still the last window', () => {
    const w = currentMonthlyCreditWindow(d('2026-04-15T10:00:00Z'), d('2026-04-15T09:59:59.999Z'))
    expect(w!.periodKey).toBe('2026-03-15')
    expect(iso(w!.end)).toBe('2026-04-15T10:00:00.000Z')
  })
})

describe('currentMonthlyCreditWindow - now >= periodEnd (period not paid / lapsed)', () => {
  it('returns null when now === periodEnd', () => {
    expect(currentMonthlyCreditWindow(d('2026-04-15T10:00:00Z'), d('2026-04-15T10:00:00Z'))).toBeNull()
  })

  it('returns null when now is after periodEnd (unpaid renewal never gets a free month)', () => {
    expect(currentMonthlyCreditWindow(d('2026-04-15T10:00:00Z'), d('2026-04-16T00:00:00Z'))).toBeNull()
  })

  it('returns null for an invalid date', () => {
    expect(currentMonthlyCreditWindow(new Date('nope'), d('2026-04-16T00:00:00Z'))).toBeNull()
    expect(currentMonthlyCreditWindow(d('2026-04-15T10:00:00Z'), new Date('nope'))).toBeNull()
  })
})

describe('currentMonthlyCreditWindow - annual subscription (monthly anniversaries)', () => {
  // Annual started Mar 15 2026 -> paid through Mar 15 2027.
  const periodEnd = d('2027-03-15T00:00:00Z')

  it('first window is Mar 15 - Apr 15', () => {
    const w = currentMonthlyCreditWindow(periodEnd, d('2026-03-15T00:00:00Z'))
    expect(iso(w!.start)).toBe('2026-03-15T00:00:00.000Z')
    expect(iso(w!.end)).toBe('2026-04-15T00:00:00.000Z')
    expect(w!.periodKey).toBe('2026-03-15')
  })

  it('second window is Apr 15 - May 15', () => {
    const w = currentMonthlyCreditWindow(periodEnd, d('2026-04-20T08:00:00Z'))
    expect(w!.periodKey).toBe('2026-04-15')
    expect(iso(w!.end)).toBe('2026-05-15T00:00:00.000Z')
  })

  it('yields 12 distinct, contiguous windows across the paid year', () => {
    const keys: string[] = []
    let prevEnd: string | null = null
    // Probe the middle of each month's anniversary window.
    for (let m = 0; m < 12; m += 1) {
      const probe = new Date(Date.UTC(2026, 2 + m, 20, 12))
      const w = currentMonthlyCreditWindow(periodEnd, probe)!
      keys.push(w.periodKey)
      if (prevEnd) expect(iso(w.start)).toBe(prevEnd)
      prevEnd = iso(w.end)
    }
    expect(new Set(keys).size).toBe(12)
    expect(keys[0]).toBe('2026-03-15')
    expect(keys[11]).toBe('2027-02-15')
    expect(prevEnd).toBe('2027-03-15T00:00:00.000Z')
  })

  it('the day a monthly anniversary starts the key changes (cron grants then)', () => {
    const before = currentMonthlyCreditWindow(periodEnd, d('2026-05-14T23:59:59Z'))
    const after = currentMonthlyCreditWindow(periodEnd, d('2026-05-15T00:00:00Z'))
    expect(before!.periodKey).toBe('2026-04-15')
    expect(after!.periodKey).toBe('2026-05-15')
  })
})

describe('currentMonthlyCreditWindow - month-end clamping and no drift', () => {
  it('steps back from a Jan 31 end: Dec 31, Nov 30, Oct 31 (no cumulative drift)', () => {
    // Annual ending Jan 31 2027: anniversaries are always computed from day 31.
    const periodEnd = d('2027-01-31T00:00:00Z')
    const keyAt = (probe: string) => currentMonthlyCreditWindow(periodEnd, d(probe))!.periodKey
    expect(keyAt('2026-12-31T12:00:00Z')).toBe('2026-12-31')
    expect(keyAt('2026-12-01T00:00:00Z')).toBe('2026-11-30')
    expect(keyAt('2026-11-30T00:00:00Z')).toBe('2026-11-30')
    expect(keyAt('2026-11-29T00:00:00Z')).toBe('2026-10-31')
    expect(keyAt('2026-10-31T00:00:00Z')).toBe('2026-10-31')
  })

  it('clamps February in a non-leap year (Mar 31 end -> window starts Feb 28)', () => {
    const w = currentMonthlyCreditWindow(d('2026-03-31T00:00:00Z'), d('2026-03-01T00:00:00Z'))
    expect(w!.periodKey).toBe('2026-02-28')
    expect(iso(w!.end)).toBe('2026-03-31T00:00:00.000Z')
  })

  it('clamps February in a leap year (Mar 31 end -> window starts Feb 29)', () => {
    const w = currentMonthlyCreditWindow(d('2028-03-31T00:00:00Z'), d('2028-03-01T00:00:00Z'))
    expect(w!.periodKey).toBe('2028-02-29')
  })

  it('returns to day 30/31 after a clamped short month (Mar 30 end, Jan 30 anniversary)', () => {
    // end Mar 30 -> k=1 Feb 28 (clamped), k=2 Jan 30 (NOT Jan 28)
    const w = currentMonthlyCreditWindow(d('2026-03-30T00:00:00Z'), d('2026-02-01T00:00:00Z'))
    expect(w!.periodKey).toBe('2026-01-30')
    expect(iso(w!.end)).toBe('2026-02-28T00:00:00.000Z')
  })

  it('crosses a year boundary (Feb 10 end, now in December)', () => {
    const w = currentMonthlyCreditWindow(d('2027-02-10T06:30:00Z'), d('2026-12-25T00:00:00Z'))
    expect(w!.periodKey).toBe('2026-12-10')
    expect(iso(w!.start)).toBe('2026-12-10T06:30:00.000Z')
    expect(iso(w!.end)).toBe('2027-01-10T06:30:00.000Z')
  })

  it('periodKey is the window start as UTC YYYY-MM-DD', () => {
    // 23:30 UTC on the 15th is still the 15th in the key (UTC, not local).
    const w = currentMonthlyCreditWindow(d('2026-05-15T23:30:00Z'), d('2026-04-20T00:00:00Z'))
    expect(w!.periodKey).toBe('2026-04-15')
  })
})

describe('topupExpiresAt', () => {
  it('adds 3 calendar months by default', () => {
    expect(topupExpiresAt(undefined, d('2026-06-15T10:00:00Z'))).toBe('2026-09-15T10:00:00.000Z')
    expect(topupExpiresAt(null, d('2026-06-15T10:00:00Z'))).toBe('2026-09-15T10:00:00.000Z')
  })

  it('honours the configured number of months', () => {
    expect(topupExpiresAt(6, d('2026-06-15T10:00:00Z'))).toBe('2026-12-15T10:00:00.000Z')
  })

  it('clamps to the end of a shorter month and rolls the year', () => {
    expect(topupExpiresAt(3, d('2026-11-30T00:00:00Z'))).toBe('2027-02-28T00:00:00.000Z')
    expect(topupExpiresAt(1, d('2026-01-31T00:00:00Z'))).toBe('2026-02-28T00:00:00.000Z')
  })

  it('falls back to 3 months for a missing / zero / negative / NaN value (never non-expiring)', () => {
    const base = d('2026-06-15T00:00:00Z')
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(topupExpiresAt(bad, base)).toBe('2026-09-15T00:00:00.000Z')
    }
  })
})
