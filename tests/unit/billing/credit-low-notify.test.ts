import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock notify + buildNotificationCopy before importing the module under test.
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/notifications/copy', () => ({
  buildNotificationCopy: vi.fn().mockReturnValue({ title: 't', body: 'b' }),
}))

const companyRow: { data: unknown } = { data: null }
// Credits plan 2026-11-20: the dedupe window starts at the last credit grant.
const lastGrant: { data: unknown } = { data: null }
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) =>
      table === 'credit_ledger'
        ? {
            select: () => ({
              eq: () => ({
                gt: () => ({
                  order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve(lastGrant) }) }),
                }),
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve(companyRow) }),
            }),
          },
  }),
}))

import { notifyLowCreditBalance } from '@/lib/billing/credit-ledger'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'

const COMPANY_ID = 'company-456'
const THRESHOLDS = [200, 50]

describe('notifyLowCreditBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(notify as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    companyRow.data = { tier: 'free', stripe_subscription_status: null, stripe_subscription_id: null }
    lastGrant.data = null
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
    // A free company is pointed at the Pro offer.
    expect(arg.linkUrl).toBe('/settings/billing#choose-plan')
    // Billing v2: dedupe shares the quota namespace (`quota-80-{c}-{month}`) so
    // the credit + count meters can never double-ping in the same month.
    expect(arg.metadata.dedupe_key).toContain(COMPANY_ID)
    expect(arg.metadata.dedupe_key).toMatch(/^quota-80-/)
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
    expect(arg.linkUrl).toBe('/settings/billing#choose-plan')
  })

  it('a live Pro subscriber is linked to the packs, and a new grant opens a new alert window', async () => {
    companyRow.data = { tier: 'pro', stripe_subscription_status: 'active', stripe_subscription_id: 'sub_1' }
    lastGrant.data = { created_at: '2026-11-20T10:00:00.000Z' }
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 40,
      newBalance: 0,
      thresholds: THRESHOLDS,
    })
    const first = (notify as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(first.linkUrl).toBe('/settings/billing#topup-packs')
    expect(first.metadata.dedupe_key).toBe(`quota-exhausted-${COMPANY_ID}-g${Date.parse('2026-11-20T10:00:00.000Z')}`)

    // Bought a pack later the same month: a different window, so it can alert again.
    lastGrant.data = { created_at: '2026-11-25T08:00:00.000Z' }
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 40,
      newBalance: 0,
      thresholds: THRESHOLDS,
    })
    const second = (notify as ReturnType<typeof vi.fn>).mock.calls[1][0]
    expect(second.metadata.dedupe_key).not.toBe(first.metadata.dedupe_key)
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

  it('exhausted: non-subscriber gets the "Subscribe to Pro" CTA', async () => {
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 40,
      newBalance: 0,
      thresholds: THRESHOLDS,
    })
    expect(buildNotificationCopy).toHaveBeenCalledWith('quota.exhausted', { creditCta: 'Subscribe to Pro' })
    const arg = (notify as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.copyContext).toEqual({ creditCta: 'Subscribe to Pro' })
  })

  it('exhausted: live Pro subscriber gets the "Buy credits" CTA', async () => {
    companyRow.data = { tier: 'pro', stripe_subscription_status: 'active', stripe_subscription_id: 'sub_1' }
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 40,
      newBalance: 0,
      thresholds: THRESHOLDS,
    })
    expect(buildNotificationCopy).toHaveBeenCalledWith('quota.exhausted', { creditCta: 'Buy credits' })
  })

  it('low: carries the same CTA, keyed per state', async () => {
    companyRow.data = { tier: 'pro', stripe_subscription_status: 'past_due', stripe_subscription_id: 'sub_1' }
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 260,
      newBalance: 180,
      thresholds: THRESHOLDS,
    })
    expect(buildNotificationCopy).toHaveBeenCalledWith('quota.80pct', { creditCta: 'Buy credits' })
  })

  it('canceled Pro is not eligible: falls back to "Subscribe to Pro"', async () => {
    companyRow.data = { tier: 'pro', stripe_subscription_status: 'canceled', stripe_subscription_id: 'sub_1' }
    await notifyLowCreditBalance({
      companyId: COMPANY_ID,
      userId: null,
      previousBalance: 260,
      newBalance: 180,
      thresholds: THRESHOLDS,
    })
    expect(buildNotificationCopy).toHaveBeenCalledWith('quota.80pct', { creditCta: 'Subscribe to Pro' })
  })
})
