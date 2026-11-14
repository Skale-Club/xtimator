import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { GooglePlayBadge } from '@/components/landing/google-play-badge'
import { GetTheAppSection } from '@/components/landing/get-the-app-section'
import { GOOGLE_PLAY_URL, googlePlayUrl, isAppleMobileDevice } from '@/lib/store-links'
import { softwareApplicationSchema } from '@/lib/seo/structured-data'

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

function setNavigator(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
}

afterEach(() => {
  cleanup()
  document.cookie = 'xt_twa=; Max-Age=0; path=/'
  setNavigator(ANDROID_UA)
})

describe('store links', () => {
  it('points at the com.xtimator.app listing', () => {
    expect(GOOGLE_PLAY_URL).toBe('https://play.google.com/store/apps/details?id=com.xtimator.app')
  })

  it('adds a Play install referrer per placement', () => {
    const url = new URL(googlePlayUrl('app_section'))
    expect(url.searchParams.get('id')).toBe('com.xtimator.app')
    const referrer = new URLSearchParams(url.searchParams.get('referrer') ?? '')
    expect(referrer.get('utm_source')).toBe('xtimator.com')
    expect(referrer.get('utm_campaign')).toBe('app_section')
  })

  it('recognises iPhone, iPad and iPadOS-as-Mac, but not a real Mac or Android', () => {
    expect(isAppleMobileDevice(IPHONE_UA)).toBe(true)
    expect(isAppleMobileDevice(MAC_UA, 5)).toBe(true)
    expect(isAppleMobileDevice(MAC_UA, 0)).toBe(false)
    expect(isAppleMobileDevice(ANDROID_UA)).toBe(false)
    expect(isAppleMobileDevice(null)).toBe(false)
  })

  it('declares the Android app in the SoftwareApplication schema', () => {
    const schema = softwareApplicationSchema({ name: 'Xtimator', description: 'x' })
    expect(schema.operatingSystem).toContain('Android')
    expect(schema.installUrl).toBe(GOOGLE_PLAY_URL)
  })
})

describe('<GooglePlayBadge>', () => {
  it('links to the store listing with the official badge', () => {
    setNavigator(ANDROID_UA)
    render(<GooglePlayBadge placement="footer" />)
    const link = screen.getByRole('link', { name: 'Get it on Google Play' })
    expect(link.getAttribute('href')).toBe(googlePlayUrl('footer'))
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByAltText('Get it on Google Play').getAttribute('src')).toBe('/badges/google-play-en.png')
  })

  it('is hidden inside the Android app (TWA cookie)', () => {
    document.cookie = 'xt_twa=1; path=/'
    render(<GooglePlayBadge placement="app_section" />)
    expect(screen.queryByRole('link', { name: 'Get it on Google Play' })).toBeNull()
  })

  it('is hidden on iOS, including iPadOS reporting a Mac user agent', () => {
    setNavigator(MAC_UA, 5)
    render(<GooglePlayBadge placement="app_section" />)
    expect(screen.queryByRole('link', { name: 'Get it on Google Play' })).toBeNull()
  })

  it('renders nothing when the server already decided to hide it', () => {
    render(<GooglePlayBadge placement="site_footer" initialVisible={false} />)
    expect(screen.queryByRole('link', { name: 'Get it on Google Play' })).toBeNull()
  })
})

describe('<GetTheAppSection>', () => {
  it('shows the Android app band with the badge', () => {
    setNavigator(ANDROID_UA)
    render(<GetTheAppSection />)
    expect(screen.getByRole('heading', { name: 'Your estimates, in your pocket' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Get it on Google Play' }).getAttribute('href')).toBe(googlePlayUrl('app_section'))
  })

  it('renders nothing inside the Android app or on iOS', () => {
    document.cookie = 'xt_twa=1; path=/'
    const { container } = render(<GetTheAppSection />)
    expect(container.innerHTML).toBe('')
    cleanup()
    document.cookie = 'xt_twa=; Max-Age=0; path=/'
    setNavigator(IPHONE_UA)
    const again = render(<GetTheAppSection />)
    expect(again.container.innerHTML).toBe('')
  })
})
