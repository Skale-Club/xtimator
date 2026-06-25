import { describe, it, expect } from 'vitest'
import { monthGrantKey } from '@/lib/billing/credit-ledger'

/**
 * Phase 142 (ANN-02) — the SINGLE company-month idempotency key.
 *
 * monthGrantKey(companyId, date) === `grant:{companyId}:{YYYY-MM}` (UTC).
 * It is the shared dedup authority used by BOTH the invoice.paid webhook grant
 * and the monthly-credit-grant cron, so a company is granted its
 * monthlyCreditGrant AT MOST ONCE per calendar month for any billing interval.
 *
 * Pure unit — no mocks, no DB.
 */
describe('monthGrantKey (Phase 142 ANN-02)', () => {
  it('formats `grant:{companyId}:{YYYY-MM}` for a fixed UTC date', () => {
    expect(monthGrantKey('co_1', new Date('2026-06-15T12:00:00Z'))).toBe(
      'grant:co_1:2026-06',
    )
  })

  it('zero-pads the month component (UTC)', () => {
    expect(monthGrantKey('co_1', new Date('2026-01-05T00:00:00Z'))).toBe(
      'grant:co_1:2026-01',
    )
  })

  it('is STABLE for the same (company, month) across different days/times in the month', () => {
    const a = monthGrantKey('co_1', new Date('2026-06-01T00:00:00Z'))
    const b = monthGrantKey('co_1', new Date('2026-06-30T23:59:59Z'))
    expect(a).toBe(b)
    expect(a).toBe('grant:co_1:2026-06')
  })

  it('DIFFERS across months', () => {
    expect(monthGrantKey('co_1', new Date('2026-06-15T00:00:00Z'))).not.toBe(
      monthGrantKey('co_1', new Date('2026-07-15T00:00:00Z')),
    )
  })

  it('DIFFERS across companies in the same month', () => {
    expect(monthGrantKey('co_1', new Date('2026-06-15T00:00:00Z'))).not.toBe(
      monthGrantKey('co_2', new Date('2026-06-15T00:00:00Z')),
    )
  })

  it('uses UTC — a date late in the month at a positive offset still resolves to that UTC month', () => {
    // 2026-06-30T23:00:00-05:00 === 2026-07-01T04:00Z → UTC month is July.
    expect(monthGrantKey('co_1', new Date('2026-07-01T04:00:00Z'))).toBe(
      'grant:co_1:2026-07',
    )
  })
})
