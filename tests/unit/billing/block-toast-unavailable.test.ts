import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Owner decision: when the credit balance cannot be read, paid AI is refused
 * (fail closed) with the 'unavailable' code. Nothing is wrong with the account,
 * so no surface may show the paywall: no "Subscribe" / "Buy credits" CTA, no
 * upgrade navigation, no buy dialog. It is a plain error toast.
 */

const mockToastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args) } }))
const mockOpenBuyCredits = vi.fn()
vi.mock('@/components/billing/buy-credits', () => ({
  openBuyCredits: () => mockOpenBuyCredits(),
}))
vi.mock('@/lib/pwa/twa-signal', () => ({
  TWA_OUT_OF_CREDITS_COPY: 'twa copy',
  readTwaCookieClient: () => false,
}))

import { billingBlockCopy, showBillingBlockToast } from '@/lib/billing/block-toast'
import { isBillingBlockCode, isBillingWallCode } from '@/lib/billing/block-codes'

const t = (key: string) => key

describe("'unavailable' billing block code", () => {
  beforeEach(() => vi.clearAllMocks())

  it('is a block code but never a wall code', () => {
    expect(isBillingBlockCode('unavailable')).toBe(true)
    expect(isBillingWallCode('unavailable')).toBe(false)
    expect(isBillingWallCode('paywalled')).toBe(true)
    expect(isBillingWallCode('out_of_credits')).toBe(true)
    expect(isBillingBlockCode('nope')).toBe(false)
  })

  it('copy is plain: no CTA and no credits / subscribe wording', () => {
    const copy = billingBlockCopy('unavailable', t)
    expect(copy.cta).toBeNull()
    expect(`${copy.title} ${copy.description}`).toMatch(/try again/i)
    expect(`${copy.title} ${copy.description}`).not.toMatch(/credit|subscribe|upgrade/i)
  })

  it('the toast shows the plain message with no action button and opens nothing', () => {
    const push = vi.fn()
    expect(showBillingBlockToast('unavailable', { push }, t)).toBe(true)

    expect(mockToastError).toHaveBeenCalledTimes(1)
    const [title, opts] = mockToastError.mock.calls[0] as [string, Record<string, unknown>]
    expect(title).toMatch(/couldn't check your account/i)
    expect(opts).not.toHaveProperty('action')
    expect(push).not.toHaveBeenCalled()
    expect(mockOpenBuyCredits).not.toHaveBeenCalled()
  })

  it('a real wall still shows its CTA (regression guard)', () => {
    showBillingBlockToast('out_of_credits', { push: vi.fn() }, t)
    const opts = mockToastError.mock.calls[0][1] as { action?: { label: string } }
    expect(opts.action?.label).toBe('Buy credits')
  })
})
