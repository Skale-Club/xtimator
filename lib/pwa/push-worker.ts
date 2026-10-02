/**
 * lib/pwa/push-worker.ts
 *
 * Identity of the push-only service worker (public/push-sw.js).
 *
 * The app still runs an emergency cleanup that unregisters service workers on
 * every load (components/pwa/sw-register.tsx) and again during chunk-load
 * recovery (lib/pwa/chunk-recovery.ts), because the old caching PWA worker
 * broke production assets. Those sweeps must spare THIS worker, or every
 * push subscription would die on the next page load.
 *
 * It is safe to spare: it has no fetch handler, and its scope ('/push/') is a
 * path the app never serves, so it controls no page.
 */

export const PUSH_WORKER_URL = '/push-sw.js'
export const PUSH_WORKER_SCOPE = '/push/'

type RegistrationLike = {
  scope: string
  active?: { scriptURL: string } | null
  installing?: { scriptURL: string } | null
  waiting?: { scriptURL: string } | null
}

/** True for the push worker's registration, the one the cleanup sweeps keep. */
export function isPushWorkerRegistration(reg: RegistrationLike): boolean {
  let scopePath = ''
  try {
    scopePath = new URL(reg.scope).pathname
  } catch {
    scopePath = reg.scope
  }
  if (scopePath === PUSH_WORKER_SCOPE) return true
  const script = reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? reg.installing?.scriptURL ?? ''
  return script.endsWith(PUSH_WORKER_URL)
}
