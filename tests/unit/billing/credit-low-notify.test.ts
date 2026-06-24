import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock notify + buildNotificationCopy before importing the module under test.
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/notifications/copy', () => ({
  buildNotificationCopy: vi.fn().mockReturnValue({ title: 't', body: 'b' }),
}))

import { notifyLowCreditBalance } from '@/lib/billing/credit-ledger'
import { notify } from '@/lib/notifications/dispatch'

const COMPANY_ID = 'company-456'
const THRESHOLDS = [200, 50]

describe('notifyLowCreditBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(notify as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
  })

  it('fires once on a downward crossing of a low threshold', async () => {
    // 260 → 180 crosses 200 downward (still above 50).
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 260,
      newBalance: 180,
      thresholds: THRESHOLDS,
    })

    expect(notify).toHaveBeenCalledTimes(1)
    const arg = (notify as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.linkUrl).toBe('/settings/billing')
    expect(arg.metadata.dedupe_key).toContain(COMPANY_ID)
    expect(arg.metadata.dedupe_key).toContain('200')
  })

  it('fires the exhausted event when the balance reaches zero', async () => {
    // 40 → 0 reaches zero.
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 40,
      newBalance: 0,
      thresholds: THRESHOLDS,
    })

    expect(notify).toHaveBeenCalledTimes(1)
    const arg = (notify as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.eventType).toBe('quota.exhausted')
    expect(arg.linkUrl).toBe('/settings/billing')
  })

  it('does NOT fire when there is no downward crossing (both above)', async () => {
    // 500 → 400 — both well above the highest threshold.
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 500,
      newBalance: 400,
      thresholds: THRESHOLDS,
    })

    expect(notify).not.toHaveBeenCalled()
  })

  it('never throws when notify rejects (best-effort)', async () => {
    ;(notify as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))

    await expect(
      notifyLowCreditBalance({
        companyId: COMPANY_ID,
        userId: null,
        previousBalance: 260,
        newBalance: 180,
        thresholds: THRESHOLDS,
      })
    ).resolves.toBeUndefined()
  })
})
