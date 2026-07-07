import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the iOS/Safari PWA session-keepalive mechanism. The bug (pwa-ios-logout):
// @supabase/ssr's browser client writes the auth cookie via document.cookie, which
// Safari ITP caps at 7 days regardless of the requested 400-day maxAge. Forcing a
// server round-trip on foreground lets the middleware re-emit the cookie via a
// Set-Cookie header (ITP-exempt), keeping the session alive long-term.

const route = readFileSync(
  resolve(process.cwd(), 'app/api/auth/keepalive/route.ts'),
  'utf8',
)
const component = readFileSync(
  resolve(process.cwd(), 'components/pwa/session-keepalive.tsx'),
  'utf8',
)
const appLayout = readFileSync(
  resolve(process.cwd(), 'app/(app)/layout.tsx'),
  'utf8',
)

describe('keepalive route', () => {
  it('validates the session with the server (middleware-covered) client', () => {
    expect(route).toContain("from '@/lib/supabase/server'")
    expect(route).toContain('auth.getClaims')
  })

  it('is dynamic and never cached', () => {
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('no-store')
  })

  it('lives under /api so the service worker treats it as NetworkOnly', () => {
    // public/sw.js returns early (NetworkOnly) for url.pathname.startsWith('/api/')
    const sw = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    expect(sw).toContain("url.pathname.startsWith('/api/')")
  })
})

describe('session-keepalive component', () => {
  it('fires on every foreground signal (visibilitychange, pageshow, focus)', () => {
    expect(component).toContain("addEventListener('visibilitychange'")
    expect(component).toContain("addEventListener('pageshow'")
    expect(component).toContain("addEventListener('focus'")
  })

  it('pings the keepalive route same-origin, uncached', () => {
    expect(component).toContain("fetch('/api/auth/keepalive'")
    expect(component).toContain("credentials: 'same-origin'")
    expect(component).toContain("cache: 'no-store'")
  })

  it('throttles to stay under the token_refresh rate limit', () => {
    expect(component).toContain('KEEPALIVE_MIN_INTERVAL_MS')
  })
})

describe('authenticated shell wiring', () => {
  it('mounts SessionKeepalive in the authenticated app layout (not the public landing)', () => {
    expect(appLayout).toContain(
      "import { SessionKeepalive } from '@/components/pwa/session-keepalive'",
    )
    // Present in both render branches (support-mode + normal).
    const mounts = appLayout.match(/<SessionKeepalive \/>/g) ?? []
    expect(mounts.length).toBe(2)
  })
})
