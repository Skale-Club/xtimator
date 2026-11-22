/**
 * Cookie consent for the marketing tags (Google Consent Mode v2).
 *
 * Defaults are all denied. A visitor's choice is stored in localStorage and
 * passed to Tag Manager with `gtag('consent', 'update', ...)` plus a dataLayer
 * event, so tags waiting for consent can fire. Global Privacy Control keeps the
 * ads signals denied no matter what was chosen.
 */

import { MARKETING_GA4_ID, MARKETING_GTM_ID } from '@/lib/marketing/tags'
import { scrubAttributionClickIds } from '@/lib/marketing/attribution'

export const CONSENT_STORAGE_KEY = 'xt-consent'
export const CONSENT_VERSION = 1
/** dataLayer event pushed after every choice. */
export const CONSENT_UPDATE_EVENT = 'xt_consent_update'
/** Window event that reopens the banner ("Cookie settings" links). */
export const CONSENT_OPEN_EVENT = 'xt-consent-open'

export type ConsentChoice = 'accepted' | 'rejected'
export type ConsentValue = 'granted' | 'denied'

export interface ConsentModeState {
  analytics_storage: ConsentValue
  ad_storage: ConsentValue
  ad_user_data: ConsentValue
  ad_personalization: ConsentValue
}

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

export function hasGlobalPrivacyControl(): boolean {
  try {
    return typeof navigator !== 'undefined' && Boolean((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl)
  } catch {
    return false
  }
}

/** The Consent Mode signals for a choice. GPC keeps every ads signal denied. */
export function consentStateFor(choice: ConsentChoice, gpc: boolean): ConsentModeState {
  if (choice === 'rejected') {
    return { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }
  }
  const ads: ConsentValue = gpc ? 'denied' : 'granted'
  return { analytics_storage: 'granted', ad_storage: ads, ad_user_data: ads, ad_personalization: ads }
}

/** The stored choice, or null when there is none, it is stale, or storage fails. */
export function readStoredConsent(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; choice?: unknown }
    if (parsed?.v !== CONSENT_VERSION) return null
    return parsed.choice === 'accepted' || parsed.choice === 'rejected' ? parsed.choice : null
  } catch {
    return null
  }
}

/**
 * The choice as the server sees it: a first-party cookie read at onboarding
 * (lib/marketing/server-signals.ts), so server-side conversions follow the same
 * consent as the tags. 'accepted_gpc' = analytics allowed, ads denied by Global
 * Privacy Control.
 */
export const CONSENT_COOKIE = 'xt_consent'
export type ConsentCookieValue = 'accepted' | 'accepted_gpc' | 'rejected'
const CONSENT_COOKIE_MAX_AGE_S = 180 * 24 * 60 * 60

export function consentCookieValue(choice: ConsentChoice, gpc: boolean): ConsentCookieValue {
  if (choice === 'rejected') return 'rejected'
  return gpc ? 'accepted_gpc' : 'accepted'
}

/** Mirrors the choice into the consent cookie (never throws). */
export function writeConsentCookie(choice: ConsentChoice): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${consentCookieValue(choice, hasGlobalPrivacyControl())}; Max-Age=${CONSENT_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`
  } catch {
    /* ignore */
  }
}

/** Persists the choice. Returns false when storage is unavailable (never throws). */
export function storeConsent(choice: ConsentChoice): boolean {
  writeConsentCookie(choice)
  if (choice === 'rejected') scrubAttributionClickIds()
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: CONSENT_VERSION, choice, ts: new Date().toISOString() }),
    )
    return true
  } catch {
    return false
  }
}

/** gtag() as Google defines it: Tag Manager only reads Arguments objects, not arrays. */
export function gtag(..._args: unknown[]): void {
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

/** Tells Tag Manager about the choice: consent update, then the trigger event. */
export function pushConsentUpdate(choice: ConsentChoice): ConsentModeState {
  const state = consentStateFor(choice, hasGlobalPrivacyControl())
  gtag('consent', 'update', state)
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event: CONSENT_UPDATE_EVENT, xt_consent: choice })
  return state
}

type TagWindow = Window & {
  __xtGtm?: boolean
  clarity?: (...args: unknown[]) => void
  fbq?: (...args: unknown[]) => void
  [gaDisableKey: string]: unknown
}

/**
 * Called when the visitor leaves the marketing pages without a full reload
 * (e.g. client-side navigation into the signed-in app after login). Tag Manager
 * and the tags it loaded stay in memory, and GA4 would otherwise keep reporting
 * page changes from browser history. This stops all of them for the rest of the
 * page's life: the official GA opt-out flag, every Consent Mode signal denied,
 * Clarity stopped and the Meta Pixel consent revoked.
 */
export function suspendMarketingTags(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as TagWindow
  // Nothing loaded yet (first render before the bootstrap ran): nothing to stop.
  if (!w.__xtGtm) return
  try {
    w[`ga-disable-${MARKETING_GA4_ID}`] = true
  } catch {
    /* ignore */
  }
  try {
    gtag('consent', 'update', consentStateFor('rejected', true))
  } catch {
    /* ignore */
  }
  try {
    if (typeof w.clarity === 'function') w.clarity('stop')
  } catch {
    /* ignore */
  }
  try {
    if (typeof w.fbq === 'function') w.fbq('consent', 'revoke')
  } catch {
    /* ignore */
  }
}

/**
 * Back on a marketing page in the same page life: undo suspendMarketingTags and
 * re-apply the stored choice. A first load does nothing here (the bootstrap
 * script applies the stored choice itself).
 */
export function resumeMarketingTags(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as TagWindow
  try {
    w[`ga-disable-${MARKETING_GA4_ID}`] = false
  } catch {
    /* ignore */
  }
  if (!w.__xtGtm) return
  const choice = readStoredConsent()
  if (!choice) return
  const state = consentStateFor(choice, hasGlobalPrivacyControl())
  try {
    gtag('consent', 'update', state)
    if (state.analytics_storage === 'granted' && typeof w.clarity === 'function') w.clarity('start')
    if (state.ad_storage === 'granted' && typeof w.fbq === 'function') w.fbq('consent', 'grant')
  } catch {
    /* ignore */
  }
}

/**
 * Inline script that runs once, before the container loads: dataLayer + gtag,
 * the all-denied defaults, the stored choice (if any), then the GTM loader.
 * Plain ES5 on purpose: it is injected as text.
 */
export function buildGtmBootstrapScript(gtmId: string = MARKETING_GTM_ID): string {
  return `(function(w,d,id){
if(w.__xtGtm)return;w.__xtGtm=true;
w.dataLayer=w.dataLayer||[];
function gtag(){w.dataLayer.push(arguments)}
var gpc=false;try{gpc=!!w.navigator.globalPrivacyControl}catch(e){}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
var c=null;try{var p=JSON.parse(w.localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)})||'null');if(p&&p.v===${CONSENT_VERSION}&&(p.choice==='accepted'||p.choice==='rejected'))c=p.choice}catch(e){}
if(c==='accepted'){var a=gpc?'denied':'granted';gtag('consent','update',{analytics_storage:'granted',ad_storage:a,ad_user_data:a,ad_personalization:a})}
w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var s=d.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(id);d.head.appendChild(s);
})(window,document,${JSON.stringify(gtmId)});`
}
