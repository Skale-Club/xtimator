import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'
import {
  portalConfigurationParam,
  resetPortalConfigurationCache,
  resolvePortalConfigurationId,
} from '@/lib/billing/stripe-portal-config'

function stripeWith(list: ReturnType<typeof vi.fn>): Stripe {
  return { billingPortal: { configurations: { list } } } as unknown as Stripe
}

describe('resolvePortalConfigurationId', () => {
  beforeEach(() => {
    resetPortalConfigurationCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('returns the active configuration tagged app=xtimator, not the account default', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        { id: 'bpc_other_default', active: true, is_default: true, metadata: {} },
        { id: 'bpc_xtimator', active: true, is_default: false, metadata: { app: 'xtimator' } },
      ],
    })
    expect(await resolvePortalConfigurationId(stripeWith(list))).toBe('bpc_xtimator')
    expect(list).toHaveBeenCalledWith({ active: true, limit: 100 })
  })

  it('caches a hit so later sessions make no extra Stripe call', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [{ id: 'bpc_xtimator', active: true, metadata: { app: 'xtimator' } }],
    })
    const stripe = stripeWith(list)
    await resolvePortalConfigurationId(stripe)
    await resolvePortalConfigurationId(stripe)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('falls back to the account default (no configuration param) when none is tagged', async () => {
    const list = vi.fn().mockResolvedValue({ data: [{ id: 'bpc_other', active: true, metadata: {} }] })
    expect(await portalConfigurationParam(stripeWith(list))).toEqual({})
  })

  it('never throws when the lookup fails', async () => {
    const list = vi.fn().mockRejectedValue(new Error('permission denied'))
    expect(await resolvePortalConfigurationId(stripeWith(list))).toBeUndefined()
  })

  it('spreads the id as configuration when found', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [{ id: 'bpc_xtimator', active: true, metadata: { app: 'xtimator' } }],
    })
    expect(await portalConfigurationParam(stripeWith(list))).toEqual({ configuration: 'bpc_xtimator' })
  })
})
