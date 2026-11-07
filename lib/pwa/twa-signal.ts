/**
 * lib/pwa/twa-signal.ts
 *
 * Pure (edge-safe, no next/headers) helpers for recognising the Android Trusted
 * Web Activity wrapper (package com.xtimator.app). Shared by proxy.ts (which
 * sets the sticky cookie) and lib/pwa/twa-context.ts (which reads it).
 *
 * Google Play forbids selling digital goods in a Play-distributed app without
 * Play Billing, so inside the TWA the web app runs in a purchase-free mode.
 */

export const TWA_COOKIE_NAME = 'xt_twa'
export const TWA_COOKIE_VALUE = '1'
/** ~1 year. */
export const TWA_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const TWA_REFERRER_PREFIX = 'android-app://com.xtimator.app'

/** Neutral, link-free copy shown instead of any purchase prompt inside the TWA. */
export const TWA_OUT_OF_CREDITS_COPY =
  "You've used your available credits. Manage your plan on xtimator.com from a web browser."

export const TWA_PURCHASE_BLOCKED_BODY = {
  error: 'Purchases are not available in the Android app.',
  code: 'twa_purchase_blocked',
} as const

/** Client-side read of the sticky `xt_twa` cookie (false on the server). */
export function readTwaCookieClient(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return document.cookie.split(';').some((part) => {
      const [name, ...rest] = part.trim().split('=')
      return name === TWA_COOKIE_NAME && isTwaCookieValue(rest.join('='))
    })
  } catch {
    return false
  }
}

/** True when a cookie value marks the session as a TWA session. */
export function isTwaCookieValue(value: string | null | undefined): boolean {
  return value === TWA_COOKIE_VALUE
}

/**
 * True when a request carries a TWA launch signal: a Referer starting with
 * `android-app://com.xtimator.app`, or `?source=twa` in the URL.
 */
export function hasTwaLaunchSignal(input: {
  referer?: string | null
  searchParams?: URLSearchParams | null
}): boolean {
  const referer = input.referer?.trim().toLowerCase() ?? ''
  if (referer.startsWith(TWA_REFERRER_PREFIX)) return true
  return input.searchParams?.get('source') === 'twa'
}
