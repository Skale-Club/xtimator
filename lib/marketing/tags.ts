import { TWA_REFERRER_PREFIX, readTwaCookieClient } from '@/lib/pwa/twa-signal'

/**
 * Google Tag Manager container for the PUBLIC marketing pages only. It is a
 * public identifier (it ships in every page's HTML), not a secret. GA4, the Meta
 * Pixel and Microsoft Clarity are configured inside the container, each behind
 * a consent requirement.
 */
const DEFAULT_GTM_ID = 'GTM-WXVZGCMB'
const GTM_ID_SHAPE = /^GTM-[A-Z0-9]{4,12}$/

function resolveGtmId(raw: string | undefined): string {
  const candidate = raw?.trim()
  return candidate && GTM_ID_SHAPE.test(candidate) ? candidate : DEFAULT_GTM_ID
}

export const MARKETING_GTM_ID = resolveGtmId(process.env.NEXT_PUBLIC_GTM_ID)

/** The GA4 property loaded by the container (used for the official opt-out flag). */
export const MARKETING_GA4_ID = 'G-3YK0P9K6G5'

/** Exact marketing pages (the landing and the legal/site-shell pages). */
const MARKETING_EXACT = ['/', '/privacy-policy', '/terms-of-service', '/delete-account']
/** Marketing sections: the path itself and everything under it. */
const MARKETING_PREFIXES = ['/industries', '/blog']

/**
 * Allowlist: tags may load ONLY on these public pages. Everything else (the
 * signed-in app, auth, onboarding, capture, admin, client estimate and change
 * order pages, dev pages) is false by default.
 */
export function isMarketingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (MARKETING_EXACT.includes(path)) return true
  return MARKETING_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * Client-side TWA check (Android app wrapper): sticky `xt_twa` cookie set by
 * proxy.ts, an `android-app://com.xtimator.app` referrer, or `?source=twa`.
 * Tags never load there.
 */
export function isTwaClient(): boolean {
  if (typeof window === 'undefined') return false
  if (readTwaCookieClient()) return true
  try {
    if (document.referrer.toLowerCase().startsWith(TWA_REFERRER_PREFIX)) return true
    return new URLSearchParams(window.location.search).get('source') === 'twa'
  } catch {
    return false
  }
}
