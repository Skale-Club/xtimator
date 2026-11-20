'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'

// Revalidate the login when the app returns to the foreground. The proxy renews
// valid owned/legacy cookies, and the server refresh replaces stale account or
// expired-session UI. Network errors retain the current screen for retry.
//
// Only mounted inside the authenticated app shell (app/(app)/layout.tsx), so it
// never runs on the public landing page.

// Throttle so we hit the server at most once per window, even if several
// foreground signals (visibilitychange + focus + pageshow) fire back-to-back on
// the same reopen. Successful checks are throttled; failures retry sooner.
const KEEPALIVE_MIN_INTERVAL_MS = 5 * 60 * 1000

export function SessionKeepalive() {
  const router = useRouter()
  useEffect(() => {
    let nextAttemptAt = 0
    let inFlight = false
    let disposed = false
    let active: AbortController | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    const ping = () => {
      // Only ping when the document is actually visible — pageshow/focus can
      // fire while still hidden.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      const now = Date.now()
      if (disposed || inFlight || now < nextAttemptAt) return
      inFlight = true
      const controller = new AbortController()
      active = controller
      // Failed requests get a short backoff, rather than suppressing recovery
      // for the whole five-minute success window.
      nextAttemptAt = now + 10_000

      // Same-origin GET, never cached. The middleware refreshes an expired
      // access token server-side and re-emits Set-Cookie on the way back.
      const request = fetch('/api/auth/keepalive', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) throw new Error('Session check unavailable')
          const value = await response.json()
          if (value?.ok !== true || typeof value.loggedIn !== 'boolean') throw new Error('Invalid session check')
          return value as { ok: true; loggedIn: boolean }
        })
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('Session check timed out')) }, 15_000)
      })
      void Promise.race([request, deadline])
        .then(() => {
          if (disposed || controller.signal.aborted) return
          nextAttemptAt = Date.now() + KEEPALIVE_MIN_INTERVAL_MS
          invalidateOwnedBrowserSession()
          window.dispatchEvent(new Event('xtimator:auth'))
          // Re-run the protected route with the server's actual session. An
          // expired login reaches its normal login/demo destination; a changed
          // account gets a fresh shell. A network failure never signs users out.
          router.refresh()
        })
        .catch(() => {})
        .finally(() => {
          clearTimeout(timeout)
          active = undefined
          inFlight = false
        })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping()
    }
    const onPageShow = () => ping()
    const onFocus = () => ping()
    const onOnline = () => { nextAttemptAt = 0; ping() }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    // Run once on mount to cover the cold-open case where the PWA HTML was
    // served from the service worker cache and the initial navigation never
    // reached the middleware.
    ping()

    return () => {
      disposed = true
      active?.abort()
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [router])

  return null
}
