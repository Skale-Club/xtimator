/**
 * Marketing signals the server reads from first-party cookies at onboarding,
 * stored on the company as `companies.acquisition`. Pure parsing (no I/O) so it
 * is unit-testable; lib/marketing/acquisition-server.ts does the cookie read.
 */

import { ATTRIBUTION_COOKIE, parseAttribution, stripClickIds, type Attribution } from '@/lib/marketing/attribution'
import { CONSENT_COOKIE, type ConsentCookieValue } from '@/lib/marketing/consent'
import { MARKETING_GA4_ID } from '@/lib/marketing/tags'

export interface AcquisitionConsent {
  /** Raw consent cookie value, or null when the visitor never answered the banner. */
  choice: ConsentCookieValue | null
  /** Global Privacy Control was on (Sec-GPC header or the banner's GPC flag). */
  gpc: boolean
}

/**
 * How strictly server-side conversions follow the banner (admin setting,
 * platform_integrations metadata). Rejection and GPC are honored in BOTH modes:
 * California (CCPA/CPRA) requires honoring GPC for ad "sharing".
 *   - 'require_accept': send only after the visitor clicked Accept.
 *   - 'unless_rejected': send unless the visitor rejected (the launch default).
 */
export type ConsentPolicy = 'require_accept' | 'unless_rejected'
export const DEFAULT_CONSENT_POLICY: ConsentPolicy = 'unless_rejected'

export function coerceConsentPolicy(value: unknown): ConsentPolicy {
  return value === 'require_accept' || value === 'unless_rejected' ? value : DEFAULT_CONSENT_POLICY
}

/** What the stored consent allows under a policy. */
export function consentAllows(
  consent: AcquisitionConsent | null | undefined,
  policy: ConsentPolicy,
): { analytics: boolean; ads: boolean } {
  const choice = consent?.choice ?? null
  const gpc = consent?.gpc ?? false
  if (choice === 'rejected') return { analytics: false, ads: false }
  const accepted = choice === 'accepted' || choice === 'accepted_gpc'
  const analytics = policy === 'require_accept' ? accepted : true
  const ads = analytics && !gpc && choice !== 'accepted_gpc'
  return { analytics, ads }
}

export interface Acquisition {
  v: 1
  channel: 'web'
  capturedAt: string
  consent: AcquisitionConsent
  attribution: Attribution | null
  /** GA4 client id (from the _ga cookie, which exists only when GA ran). */
  gaClientId: string | null
  /** GA4 session id (from the _ga_<stream> cookie). */
  gaSessionId: string | null
  /** Meta browser id (_fbp, set by the Pixel). */
  fbp: string | null
  /** Meta click id in Meta's fbc format (from _fbc or the stored fbclid). */
  fbc: string | null
}

export function parseConsentCookie(raw: string | null | undefined, gpcHeader = false): AcquisitionConsent {
  const choice: ConsentCookieValue | null =
    raw === 'accepted' || raw === 'accepted_gpc' || raw === 'rejected' ? raw : null
  return { choice, gpc: gpcHeader || choice === 'accepted_gpc' }
}

/** `GA1.1.1234567890.1700000000` → `1234567890.1700000000`. */
export function parseGaClientId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length < 4) return null
  const id = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  return /^\d+\.\d+$/.test(id) ? id : null
}

/**
 * The session id from the GA4 stream cookie, in either format:
 * `GS1.1.1700000000.3.1...` or `GS2.1.s1700000000$o3$g1...`.
 */
export function parseGaSessionId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const gs2 = /^GS2\.\d+\.s(\d+)/.exec(raw)
  if (gs2) return gs2[1]
  const gs1 = /^GS1\.\d+\.(\d+)\./.exec(raw)
  return gs1 ? gs1[1] : null
}

/** Name of the GA4 stream cookie for our measurement id (`_ga_3YK0P9K6G5`). */
export const GA_SESSION_COOKIE = `_ga_${MARKETING_GA4_ID.replace(/^G-/, '')}`

const FB_ID = /^fb\.\d\.\d+\.[\w.-]+$/

/** Meta's fbc: the _fbc cookie, else built from the stored fbclid. */
export function resolveFbc(
  fbcCookie: string | null | undefined,
  attribution: Attribution | null,
): string | null {
  if (fbcCookie && FB_ID.test(fbcCookie)) return fbcCookie
  const touch = attribution?.last.fbclid ? attribution.last : attribution?.first.fbclid ? attribution.first : null
  if (!touch?.fbclid) return null
  const ms = Date.parse(touch.ts)
  return `fb.1.${Number.isFinite(ms) ? ms : Date.now()}.${touch.fbclid}`
}

/**
 * Builds the acquisition record from a cookie getter and the request's Sec-GPC
 * header. Browser ids are kept unless the visitor rejected; whether they may be
 * USED is decided at send time by consentAllows() under the admin policy.
 */
export function buildAcquisition(
  getCookie: (name: string) => string | undefined,
  now: Date,
  options: { gpcHeader?: boolean } = {},
): Acquisition {
  const consent = parseConsentCookie(getCookie(CONSENT_COOKIE), options.gpcHeader ?? false)
  const rejected = consent.choice === 'rejected'
  let attribution = parseAttribution(getCookie(ATTRIBUTION_COOKIE))
  // A rejection after the visit may have left click ids behind: never keep them.
  if (attribution && rejected) attribution = stripClickIds(attribution)
  const fbpRaw = getCookie('_fbp')
  return {
    v: 1,
    channel: 'web',
    capturedAt: now.toISOString(),
    consent,
    attribution,
    gaClientId: rejected ? null : parseGaClientId(getCookie('_ga')),
    gaSessionId: rejected ? null : parseGaSessionId(getCookie(GA_SESSION_COOKIE)),
    fbp: !rejected && fbpRaw && FB_ID.test(fbpRaw) ? fbpRaw : null,
    fbc: rejected ? null : resolveFbc(getCookie('_fbc'), attribution),
  }
}

/** Reads a stored companies.acquisition value defensively. */
export function readAcquisition(value: unknown): Acquisition | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Partial<Acquisition>
  if (a.v !== 1 || !a.consent || typeof a.consent !== 'object') return null
  if (typeof a.consent.gpc !== 'boolean') return null
  return a as Acquisition
}
