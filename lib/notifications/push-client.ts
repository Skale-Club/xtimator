'use client'

/**
 * Web Push on this device: support detection, subscribe, unsubscribe.
 *
 * Phase 77 (NOTIF-09) scaffolded the permission flow. 260928 completes it:
 *  - the worker is the push-only /push-sw.js, registered in its own '/push/'
 *    scope so it controls no page (see lib/pwa/push-worker.ts);
 *  - the VAPID public key comes from the server at runtime, and is prefetched
 *    so `enableBrowserPush` can call `Notification.requestPermission()` as its
 *    FIRST await. Safari only grants the prompt inside the user's tap, and any
 *    network wait before it would break that.
 *  - each device registers itself with its app language, so the server can
 *    word the notification the way that device reads.
 */

import { PUSH_WORKER_SCOPE, PUSH_WORKER_URL } from '@/lib/pwa/push-worker'

export type PushLanguage = 'en' | 'pt' | 'es'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

/**
 * iPhone and iPad only offer Web Push to a web app added to the Home Screen
 * (iOS 16.4+). In a Safari tab PushManager simply does not exist.
 */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === 'undefined') return false
  return isIOS() && !isStandalone() && !isPushSupported()
}

// ── VAPID public key (runtime, cached) ───────────────────────────────────────
let publicKeyPromise: Promise<string | null> | null = null
/** The resolved key, readable synchronously inside a click handler. */
let publicKeyValue: string | null | undefined

/** Fetches (once) the server's VAPID public key; null when push is not configured. */
export function prefetchPushPublicKey(): Promise<string | null> {
  if (!publicKeyPromise) {
    publicKeyPromise = fetch('/api/notifications/push/subscribe', { method: 'GET' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { publicKey?: string | null } | null) => {
        publicKeyValue = j?.publicKey ?? null
        return publicKeyValue
      })
      .catch(() => {
        publicKeyPromise = null // allow a retry later
        return null
      })
  }
  return publicKeyPromise
}

/** Test seam: forget the cached key. */
export function resetPushClientCache(): void {
  publicKeyPromise = null
  publicKeyValue = undefined
}

/**
 * True when tapping something right now could subscribe this device: push is
 * supported, the server has a key (already prefetched), and the user has not
 * blocked notifications. Synchronous on purpose, for use inside a click.
 */
export function canOfferPushNow(): boolean {
  if (!isPushSupported()) return false
  if (!publicKeyValue) return false
  try {
    return Notification.permission !== 'denied'
  } catch {
    return false
  }
}

/**
 * Re-registers THIS device's existing subscription with the server (no
 * permission prompt). Heals a device the server dropped, and updates the
 * notification language when the app language changed.
 */
export async function syncDeviceSubscription(lang: PushLanguage): Promise<void> {
  const sub = await getDeviceSubscription()
  if (!sub) return
  await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), lang }),
  }).catch(() => {})
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration(PUSH_WORKER_SCOPE)
}

/** Resolves once the registration has an active worker (subscribe requires one). */
function waitForActive(reg: ServiceWorkerRegistration, timeoutMs = 10_000): Promise<void> {
  if (reg.active) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const worker = reg.installing ?? reg.waiting
    const timer = setTimeout(() => reject(new Error('Service worker did not activate')), timeoutMs)
    if (!worker) {
      clearTimeout(timer)
      reject(new Error('No service worker to activate'))
      return
    }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

/** The subscription of THIS device, if it has one. */
export async function getDeviceSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await getPushRegistration()
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'not_configured' | 'error'; message?: string }

/**
 * Asks for permission, subscribes this device and registers it with the
 * server. Call it from a click handler, WITHOUT awaiting anything first.
 */
export async function enableBrowserPush(lang: PushLanguage = 'en'): Promise<EnableResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  // Kick off the key fetch in parallel, but ask for permission FIRST so the
  // prompt stays inside the user's gesture.
  const keyPromise = prefetchPushPublicKey()
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }

    const publicKey = await keyPromise
    if (!publicKey) return { ok: false, reason: 'not_configured' }

    const reg = await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: PUSH_WORKER_SCOPE })
    await waitForActive(reg)

    const existing = await reg.pushManager.getSubscription()
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      }))

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), lang }),
    })
    if (res.status === 503) return { ok: false, reason: 'not_configured' }
    if (!res.ok && res.status !== 204) return { ok: false, reason: 'error', message: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Unsubscribes THIS device and removes it from the server list. */
export async function disableBrowserPush(): Promise<void> {
  let endpoint: string | undefined
  try {
    const sub = await getDeviceSubscription()
    endpoint = sub?.endpoint
    await sub?.unsubscribe()
  } catch {
    /* best-effort */
  }
  await fetch('/api/notifications/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  }).catch(() => {})
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = typeof window !== 'undefined' ? window.atob(b64) : ''
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
