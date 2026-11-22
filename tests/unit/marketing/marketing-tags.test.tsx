import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

let mockPath = '/'
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }))
vi.mock('next/script', () => ({
  default: (props: { id?: string; dangerouslySetInnerHTML?: { __html: string } }) => (
    <script data-testid={props.id} dangerouslySetInnerHTML={props.dangerouslySetInnerHTML} />
  ),
}))

import { MarketingTags } from '@/components/marketing/marketing-tags'
import { CookieConsent } from '@/components/marketing/cookie-consent'
import { CookieSettingsLink } from '@/components/marketing/cookie-settings-link'
import { MARKETING_GTM_ID, isMarketingPath } from '@/lib/marketing/tags'
import { CONSENT_STORAGE_KEY, buildGtmBootstrapScript, consentStateFor } from '@/lib/marketing/consent'

type Win = Window & { dataLayer?: unknown[]; __xtGtm?: boolean }
const w = window as Win

/** gtag() entries are Arguments objects; plain events are objects. Normalise gtag entries to arrays. */
function layer(): unknown[][] {
  return (w.dataLayer ?? []).map((e) => {
    const obj = e as { length?: number; event?: string }
    return typeof obj.length === 'number' && obj.event === undefined ? Array.from(e as ArrayLike<unknown>) : [e]
  })
}

function setGpc(value: boolean | undefined) {
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { value, configurable: true })
}

beforeEach(() => {
  mockPath = '/'
  w.dataLayer = undefined
  w.__xtGtm = undefined
  window.localStorage.clear()
  setGpc(undefined)
  document.cookie = 'xt_twa=; Max-Age=0; path=/'
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('isMarketingPath', () => {
  it.each([
    '/',
    '/industries',
    '/industries/plumbing',
    '/blog',
    '/blog/some-post',
    '/blog/tag/x',
    '/privacy-policy',
    '/terms-of-service',
    '/delete-account',
    '/blog/',
  ])('allows %s', (p) => expect(isMarketingPath(p)).toBe(true))

  it.each(['/dashboard', '/projects/x', '/estimate/x', '/change-order/x', '/admin', '/onboarding', '/login', '/dev/loader', '/capture', '/blogger', ''])(
    'blocks %s',
    (p) => expect(isMarketingPath(p)).toBe(false),
  )
  it('blocks null and undefined', () => {
    expect(isMarketingPath(null)).toBe(false)
    expect(isMarketingPath(undefined)).toBe(false)
  })
})

describe('consent state', () => {
  it('grants everything on accept and denies everything on reject', () => {
    expect(consentStateFor('accepted', false)).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    })
    expect(Object.values(consentStateFor('rejected', false))).toEqual(['denied', 'denied', 'denied', 'denied'])
  })
  it('keeps ads denied under GPC', () => {
    expect(consentStateFor('accepted', true)).toEqual({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })
})

describe('CookieConsent banner', () => {
  it('shows with no stored choice and hides after Accept, pushing consent update and the event', async () => {
    render(<CookieConsent />)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(layer()[0]).toEqual([
      'consent',
      'update',
      { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' },
    ])
    expect(w.dataLayer![1]).toEqual({ event: 'xt_consent_update', xt_consent: 'accepted' })
    const stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY)!)
    expect(stored).toMatchObject({ v: 1, choice: 'accepted' })
    expect(typeof stored.ts).toBe('string')
  })

  it('Reject denies everything', async () => {
    render(<CookieConsent />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(layer()[0]).toEqual([
      'consent',
      'update',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('keeps ads denied under GPC even after Accept', async () => {
    setGpc(true)
    render(<CookieConsent />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
    expect(layer()[0][2]).toMatchObject({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })

  it('stays hidden when a choice exists and reopens from Cookie settings', async () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'rejected', ts: 'x' }))
    render(
      <>
        <CookieConsent />
        <CookieSettingsLink />
      </>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('ignores a stored choice with an old version', async () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 0, choice: 'accepted' }))
    render(<CookieConsent />)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('does not crash when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<CookieConsent />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(layer()[0][1]).toBe('update')
  })
})

describe('bootstrap script', () => {
  function run(script: string) {
    new Function(script)()
  }
  it('sets denied defaults before loading the container whose src has the ID', () => {
    const appended: HTMLScriptElement[] = []
    vi.spyOn(document.head, 'appendChild').mockImplementation((n) => {
      appended.push(n as HTMLScriptElement)
      return n
    })
    run(buildGtmBootstrapScript())
    expect(layer()[0]).toEqual([
      'consent',
      'default',
      { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 },
    ])
    expect(appended[0].src).toContain(`googletagmanager.com/gtm.js?id=${MARKETING_GTM_ID}`)
  })
  it('applies a stored accept, but GPC keeps ads denied', () => {
    vi.spyOn(document.head, 'appendChild').mockImplementation((n) => n)
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, choice: 'accepted', ts: 'x' }))
    setGpc(true)
    run(buildGtmBootstrapScript())
    expect(layer()[1]).toEqual([
      'consent',
      'update',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })
  it('survives a storage failure', () => {
    vi.spyOn(document.head, 'appendChild').mockImplementation((n) => n)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => run(buildGtmBootstrapScript())).not.toThrow()
    expect(layer()).toHaveLength(2)
  })
})

describe('MarketingTags', () => {
  it('renders the GTM script with the container ID and the banner on a marketing page', async () => {
    render(<MarketingTags />)
    const script = await screen.findByTestId('xt-gtm')
    expect(script.innerHTML).toContain(MARKETING_GTM_ID)
    expect(script.innerHTML).toContain('googletagmanager.com/gtm.js')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
  it.each(['/dashboard', '/estimate/abc', '/change-order/abc', '/admin'])('renders nothing on %s', async (p) => {
    mockPath = p
    const { container } = render(<MarketingTags />)
    await act(async () => {})
    expect(container.innerHTML).toBe('')
  })
  it('renders nothing in the TWA (cookie)', async () => {
    document.cookie = 'xt_twa=1; path=/'
    const { container } = render(<MarketingTags />)
    await act(async () => {})
    expect(container.innerHTML).toBe('')
  })
  it('hides the Cookie settings link in the TWA', async () => {
    document.cookie = 'xt_twa=1; path=/'
    const { container } = render(<CookieSettingsLink />)
    await act(async () => {})
    expect(container.innerHTML).toBe('')
  })
})
