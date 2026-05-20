'use client'

/**
 * Phase 77 plan 07 (NOTIF-09) — Web Push permission + subscription scaffold.
 *
 * Phase 1: permission flow + service worker registration + subscription persist.
 * Phase 2 deferred: VAPID server keys + web-push library + actual push.send().
 *
 * Without NEXT_PUBLIC_VAPID_PUBLIC_KEY, pushManager.subscribe is skipped —
 * permission + SW registration alone are persisted (`push_subscription = {}`).
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error'; message?: string }

export async function enableBrowserPush(): Promise<EnableResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }

    const reg = await navigator.serviceWorker.register('/sw.js')

    let subscription: PushSubscription | null = null
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (vapidPublicKey) {
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            .buffer as ArrayBuffer,
        })
      } catch {
        // Phase 1: VAPID may not be present; permission + SW registration alone is enough.
      }
    }

    await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: subscription ?? {} }),
    })

    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function disableBrowserPush(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    await sub?.unsubscribe()
  } catch {
    /* best-effort */
  }
  await fetch('/api/notifications/push/subscribe', { method: 'DELETE' })
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = typeof window !== 'undefined' ? window.atob(b64) : ''
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
