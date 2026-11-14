/**
 * App store links (Android app on Google Play: the Trusted Web Activity
 * published as com.xtimator.app). One place for the URL so every surface that
 * links to the store stays in sync.
 */

export const GOOGLE_PLAY_PACKAGE = 'com.xtimator.app'
export const GOOGLE_PLAY_URL = `https://play.google.com/store/apps/details?id=${GOOGLE_PLAY_PACKAGE}`

/** Where a store badge sits; it becomes the install campaign in Play Console. */
export type StoreBadgePlacement = 'app_section' | 'footer' | 'site_footer'

/**
 * Store URL with a Play install referrer, so Play Console attributes installs
 * to the page section that sent them (Acquisition reports, by campaign).
 */
export function googlePlayUrl(placement?: StoreBadgePlacement): string {
  if (!placement) return GOOGLE_PLAY_URL
  const referrer = `utm_source=xtimator.com&utm_medium=website&utm_campaign=${placement}`
  return `${GOOGLE_PLAY_URL}&referrer=${encodeURIComponent(referrer)}`
}

/**
 * iPhone, iPad or iPod. There is no iOS app, so the Play badge would be a dead
 * end there. iPadOS Safari reports a Mac user agent, so callers in the browser
 * also pass maxTouchPoints to tell an iPad from a real Mac.
 */
export function isAppleMobileDevice(userAgent: string | null | undefined, maxTouchPoints = 0): boolean {
  const ua = userAgent ?? ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return /Macintosh/i.test(ua) && maxTouchPoints > 1
}
