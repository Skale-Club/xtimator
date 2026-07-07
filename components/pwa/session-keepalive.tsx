'use client'

import { useEffect } from 'react'

// Fires a lightweight server round-trip whenever the app returns to the
// foreground so the middleware can re-emit the Supabase auth cookies via a
// Set-Cookie response header (server-set cookies are exempt from Safari ITP's
// 7-day cap on script-written cookies). See app/api/auth/keepalive/route.ts for
// the full rationale.
//
// Only mounted inside the authenticated app shell (app/(app)/layout.tsx), so it
// never runs on the public landing page.

// Throttle so we hit the server at most once per window, even if several
// foreground signals (visibilitychange + focus + pageshow) fire back-to-back on
// the same reopen. Keeps us well under Supabase's token_refresh rate limit
// (150 / 5 min) and avoids redundant refreshes.
const KEEPALIVE_MIN_INTERVAL_MS = 5 * 60 * 1000

export function SessionKeepalive() {
  useEffect(() => {
    let lastRun = 0
    let inFlight = false

    const ping = () => {
      // Only ping when the document is actually visible — pageshow/focus can
      // fire while still hidden.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      const now = Date.now()
      if (inFlight || now - lastRun < KEEPALIVE_MIN_INTERVAL_MS) return
      lastRun = now
      inFlight = true

      // Same-origin GET, never cached. The middleware refreshes an expired
      // access token server-side and re-emits Set-Cookie on the way back.
      void fetch('/api/auth/keepalive', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
      })
        .catch(() => {})
        .finally(() => {
          inFlight = false
        })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping()
    }
    const onPageShow = () => ping()
    const onFocus = () => ping()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onFocus)

    // Run once on mount to cover the cold-open case where the PWA HTML was
    // served from the service worker cache and the initial navigation never
    // reached the middleware.
    ping()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}
