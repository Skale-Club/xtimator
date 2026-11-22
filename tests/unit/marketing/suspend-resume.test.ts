// @vitest-environment jsdom
// Leaving the marketing pages without a full reload must stop every tag already in
// memory (GA opt-out flag, Consent Mode all denied, Clarity stopped, Pixel revoked);
// coming back restores the stored choice. Before the bootstrap ran, both are no-ops
// for the tags (and resume never leaves GA disabled).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  resumeMarketingTags,
  suspendMarketingTags,
} from '@/lib/marketing/consent'
import { MARKETING_GA4_ID } from '@/lib/marketing/tags'

type W = Window & Record<string, unknown> & { dataLayer?: unknown[] }
const w = window as unknown as W
const gaFlag = `ga-disable-${MARKETING_GA4_ID}`

function lastConsentUpdate(): Record<string, string> | undefined {
  const calls = (w.dataLayer ?? []).filter(
    (e) => typeof e === 'object' && e !== null && (e as ArrayLike<unknown>)[0] === 'consent'
  ) as ArrayLike<unknown>[]
  const last = calls[calls.length - 1]
  return last ? (last[2] as Record<string, string>) : undefined
}

beforeEach(() => {
  delete w.__xtGtm
  delete w[gaFlag]
  delete w.clarity
  delete w.fbq
  w.dataLayer = []
  window.localStorage.clear()
})

describe('suspendMarketingTags / resumeMarketingTags', () => {
  it('does nothing before the bootstrap ran (first render)', () => {
    suspendMarketingTags()
    expect(w[gaFlag]).toBeUndefined()
    expect(w.dataLayer).toEqual([])
  })

  it('suspend stops every loaded tag', () => {
    w.__xtGtm = true
    const clarity = vi.fn()
    const fbq = vi.fn()
    w.clarity = clarity
    w.fbq = fbq
    suspendMarketingTags()
    expect(w[gaFlag]).toBe(true)
    expect(lastConsentUpdate()).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
    expect(clarity).toHaveBeenCalledWith('stop')
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke')
  })

  it('resume always clears the GA opt-out flag and re-applies an accepted choice', () => {
    w.__xtGtm = true
    w[gaFlag] = true
    const clarity = vi.fn()
    w.clarity = clarity
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: CONSENT_VERSION, choice: 'accepted', ts: new Date().toISOString() })
    )
    resumeMarketingTags()
    expect(w[gaFlag]).toBe(false)
    expect(lastConsentUpdate()?.analytics_storage).toBe('granted')
    expect(clarity).toHaveBeenCalledWith('start')
  })

  it('resume before the bootstrap only clears the flag', () => {
    w[gaFlag] = true
    resumeMarketingTags()
    expect(w[gaFlag]).toBe(false)
    expect(w.dataLayer).toEqual([])
  })
})
