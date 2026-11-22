/**
 * Signup attribution: where a visitor came from.
 *
 * On public marketing pages the browser records a "touch" whenever the visit
 * carries campaign tags (utm_*), an ad click id (gclid, gbraid, wbraid, fbclid,
 * msclkid) or arrives from another site. The first and the latest touch live in
 * a first-party cookie for 90 days; onboarding copies them onto the company
 * (companies.acquisition), so every signup knows its channel.
 *
 * The cookie never leaves our servers on its own. Ad click ids are what Google
 * and Meta need to credit a conversion, so they are dropped once the visitor
 * rejects cookies, and the server only reports a conversion to an ad platform
 * with consent (lib/marketing/conversions).
 *
 * The parsing is pure (testable); the cookie I/O at the bottom is browser-only.
 */

export const ATTRIBUTION_COOKIE = 'xt_attr'
const ATTRIBUTION_MAX_AGE_S = 90 * 24 * 60 * 60
const MAX_VALUE = 200

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'] as const

export type UtmKey = (typeof UTM_KEYS)[number]
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number]

export type Touch = Partial<Record<UtmKey | ClickIdKey, string>> & {
  /** Landing path (no query string). */
  landing: string
  /** Referring host, when it was another site. */
  referrer?: string
  /** ISO timestamp of the touch. */
  ts: string
}

export interface Attribution {
  first: Touch
  last: Touch
}

const OWN_HOSTS = /(^|\.)xtimator\.com$/i

function clip(value: string): string {
  return value.trim().slice(0, MAX_VALUE)
}

function referrerHost(referrer: string): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    if (!host || OWN_HOSTS.test(host) || host === 'localhost') return null
    return host
  } catch {
    return null
  }
}

/**
 * The touch for this page view, or null when the visit says nothing new
 * (direct visit or a click inside our own site), which keeps the stored one.
 */
export function buildTouch(
  url: URL,
  referrer: string,
  now: Date,
  options: { keepClickIds: boolean },
): Touch | null {
  const touch: Touch = { landing: url.pathname.slice(0, MAX_VALUE) || '/', ts: now.toISOString() }
  let tagged = false
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)
    if (value && value.trim()) {
      touch[key] = clip(value)
      tagged = true
    }
  }
  for (const key of CLICK_ID_KEYS) {
    const value = url.searchParams.get(key)
    if (value && value.trim()) {
      tagged = true
      if (options.keepClickIds) touch[key] = clip(value)
    }
  }
  const host = referrerHost(referrer)
  if (host) touch.referrer = host
  if (!tagged && !host) return null
  return touch
}

/** First touch is kept forever (within the cookie life); last touch is replaced. */
export function mergeAttribution(existing: Attribution | null, touch: Touch | null): Attribution | null {
  if (!touch) return existing
  return { first: existing?.first ?? touch, last: touch }
}

function stripTouch(touch: Touch): Touch {
  const copy: Touch = { ...touch }
  for (const key of CLICK_ID_KEYS) delete copy[key]
  return copy
}

/** The attribution without ad click ids (used after the visitor rejects cookies). */
export function stripClickIds(attribution: Attribution): Attribution {
  return { first: stripTouch(attribution.first), last: stripTouch(attribution.last) }
}

function isTouch(value: unknown): value is Touch {
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  if (typeof t.landing !== 'string' || typeof t.ts !== 'string') return false
  return Object.values(t).every((v) => typeof v === 'string')
}

/** Parses the cookie value. Anything malformed reads as no attribution. */
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null
  try {
    const decoded = raw.startsWith('%7B') || raw.startsWith('%7b') ? decodeURIComponent(raw) : raw
    const parsed = JSON.parse(decoded) as { first?: unknown; last?: unknown }
    if (!isTouch(parsed.first) || !isTouch(parsed.last)) return null
    return { first: parsed.first, last: parsed.last }
  } catch {
    return null
  }
}

export function serializeAttribution(attribution: Attribution): string {
  return encodeURIComponent(JSON.stringify(attribution))
}

// ---------------------------------------------------------------------------
// Browser-only cookie I/O. Every function is a no-op outside the browser and
// never throws.
// ---------------------------------------------------------------------------

function readCookie(name: string): string | null {
  try {
    const prefix = `${name}=`
    for (const part of document.cookie.split(';')) {
      const item = part.trim()
      if (item.startsWith(prefix)) return item.slice(prefix.length)
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeAttributionCookie(attribution: Attribution): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ATTRIBUTION_COOKIE}=${serializeAttribution(attribution)}; Max-Age=${ATTRIBUTION_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`
  } catch {
    /* ignore */
  }
}

/** Records this page view's touch, if it has one. */
export function captureAttribution(options: { keepClickIds: boolean }): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  try {
    const touch = buildTouch(new URL(window.location.href), document.referrer, new Date(), options)
    if (!touch) return
    const merged = mergeAttribution(parseAttribution(readCookie(ATTRIBUTION_COOKIE)), touch)
    if (merged) writeAttributionCookie(options.keepClickIds ? merged : stripClickIds(merged))
  } catch {
    /* ignore */
  }
}

/** Removes ad click ids from the stored attribution (after a rejection). */
export function scrubAttributionClickIds(): void {
  if (typeof document === 'undefined') return
  const current = parseAttribution(readCookie(ATTRIBUTION_COOKIE))
  if (current) writeAttributionCookie(stripClickIds(current))
}
