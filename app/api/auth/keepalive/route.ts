import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Session keepalive for iOS/Safari PWAs.
//
// Why this exists: @supabase/ssr's browser client persists the session in a
// cookie written via `document.cookie`. Safari's ITP caps the effective lifetime
// of *script-written* cookies to 7 days, ignoring the 400-day maxAge the library
// requests. Cookies written by the SERVER via a `Set-Cookie` response header are
// exempt from that cap. So when a home-screen PWA is reopened after a few days,
// the script-written auth cookie may already be gone → cold-open finds no token →
// middleware redirects to /?auth=login (silent logout).
//
// This route is a lightweight, same-origin GET that the app fires on foreground
// (visibilitychange/pageshow/focus). Because it hits `/api/*` it:
//   1. is NetworkOnly in the service worker (public/sw.js) — never served from cache,
//   2. passes through the middleware (proxy.ts), whose getClaims() call refreshes an
//      expired access token server-side and re-emits the auth cookies via Set-Cookie.
// That server-set write re-stamps the refresh-token cookie as ITP-exempt, resetting
// the 7-day clock on every reopen — effectively keeping the session alive long-term.
//
// The refresh is done by the middleware, NOT here, to keep a single refresh path on
// foreground (avoids racing the refresh-token rotation window). This handler only
// needs to force the request through the middleware and confirm the session.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const loggedIn = !!data?.claims?.sub

  return NextResponse.json(
    { ok: true, loggedIn },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
