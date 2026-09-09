---
phase: 260909-eul-fix-login-twice-redirect-www-to-canonica
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - proxy.ts
  - app/(auth)/callback/route.ts
  - app/api/auth/keepalive/route.ts
  - tests/unit/middleware.test.ts
  - tests/unit/auth/callback-route.test.ts
autonomous: true
requirements: [LOGIN-TWICE-01]

must_haves:
  truths:
    - "A request to https://www.xtimator.com/<path>?<query> is answered by the proxy with a 308 to https://xtimator.com/<path>?<query> before any Supabase client is built"
    - "Requests on xtimator.com, localhost, demo.xtimator.com, or any other host are NOT host-redirected"
    - "Every redirect emitted by app/(auth)/callback/route.ts uses a RELATIVE Location (/dashboard, /onboarding, /update-password, /?auth=login) so the browser stays on the host that just received the Set-Cookie headers"
    - "The keepalive route comment no longer claims public/sw.js treats /api as NetworkOnly"
  artifacts:
    - path: "proxy.ts"
      provides: "exported pure helper getCanonicalHostRedirect + www→canonical 308 at the top of proxy()"
      contains: "getCanonicalHostRedirect"
    - path: "app/(auth)/callback/route.ts"
      provides: "host-preserving relative redirects"
      contains: "Location"
    - path: "tests/unit/middleware.test.ts"
      provides: "coverage for getCanonicalHostRedirect"
      contains: "getCanonicalHostRedirect"
    - path: "tests/unit/auth/callback-route.test.ts"
      provides: "coverage that all four callback branches emit relative Location headers"
      contains: "Location"
  key_links:
    - from: "proxy.ts proxy()"
      to: "getCanonicalHostRedirect(getRequestOrigin(request), pathname, search, getCanonicalBaseUrl())"
      via: "first statement of proxy(), before classifyDemoEntryRequest"
      pattern: "getCanonicalHostRedirect\\("
    - from: "app/(auth)/callback/route.ts"
      to: "new NextResponse(null, { status: 307, headers: { Location: <relative path> } })"
      via: "local relativeRedirect() helper"
      pattern: "status: 307"
---

<objective>
Fix the "I have to log in twice" bug.

Root cause (verified with curl against production on 2026-09-09):
- `https://www.xtimator.com` and `https://xtimator.com` BOTH serve the app with no
  redirect between them (both answer 200). Cookies are host-scoped, so a session
  created on `www` exists only on `www`.
- `app/(auth)/callback/route.ts` builds every redirect from `resolveBaseUrl()`, which
  prefers the runtime `APP_ORIGIN` (= `https://xtimator.com`). Verified:
  `curl -sI https://www.xtimator.com/callback` → `Location: https://xtimator.com/?auth=login`.
- So: Google OAuth (or password recovery) started on `www` → Supabase sends the user
  back to `https://www.xtimator.com/callback?code=…` → `exchangeCodeForSession` sets
  the auth cookies on `www` → the route 307s to `https://xtimator.com/dashboard` →
  apex has no cookies → proxy.ts 307s to `/?auth=login` → the user logs in AGAIN (this
  time on apex, which then works). Any absolute link built from
  `getCanonicalBaseUrl()` (email, WhatsApp, notifications) reproduces the same split
  whenever the session lives on `www`.

Fix (two independent parts, both required):
1. Collapse the two cookie jars into one: proxy.ts issues a permanent 308 from the
   exact `www.` alias of the canonical host to the canonical host, path + query
   preserved, before doing anything else. Only that one alias — never localhost,
   never the demo host, never tenant custom domains.
2. Make the OAuth/recovery callback host-preserving by construction: emit RELATIVE
   `Location` headers. The cookies were just written on the request host, so the
   redirect must stay there. This also removes the last dependency of the callback on
   `resolveBaseUrl()`.

Plus one stale comment fix in the keepalive route (it cites a NetworkOnly rule in
public/sw.js that no longer exists — sw.js is now a no-fetch self-unregistering worker).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@proxy.ts
@app/(auth)/callback/route.ts
@app/api/auth/keepalive/route.ts
@lib/utils/site-url.ts
@lib/demo/session.ts
@tests/unit/middleware.test.ts
@tests/unit/billing/connect-callback.test.ts

<interfaces>
<!-- Contracts the executor needs. Do not go exploring for these. -->

lib/demo/session.ts (already imported by proxy.ts):
```ts
export function getRequestOrigin(request: NextRequest): string
// → `${x-forwarded-proto ?? nextUrl.protocol}://${x-forwarded-host ?? host}`; falls back to request.nextUrl.origin
```

lib/utils/site-url.ts:
```ts
export function getCanonicalBaseUrl(): string
// → APP_ORIGIN ?? NEXT_PUBLIC_SITE_URL ?? NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com' (trimmed, no trailing slash)
export function resolveBaseUrl(request: Request): string   // currently used by the callback — to be dropped there
```

proxy.ts today — top of proxy():
```ts
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const demoEntry = classifyDemoEntryRequest(request)
  if (demoEntry.kind === 'apex') { return NextResponse.redirect(demoEntry.destination, 303) }
  ...
```
Existing exported pure helpers in proxy.ts that tests import: `isPublicRoute`, `isProtectedRoute`.
tests/unit/middleware.test.ts imports `from '@/proxy'` and tests ONLY pure helpers (never calls proxy()).

app/(auth)/callback/route.ts today — the four redirect sites:
```ts
const baseUrl = resolveBaseUrl(request)
...
return NextResponse.redirect(new URL('/?auth=login', baseUrl))     // exchange error
return NextResponse.redirect(new URL('/update-password', baseUrl)) // type === 'recovery'
return NextResponse.redirect(new URL(redirectTo, baseUrl))         // '/dashboard' | '/onboarding'
return NextResponse.redirect(new URL('/?auth=login', baseUrl))     // no code / no user
```
`NextResponse.redirect()` REJECTS relative URLs ("URL is malformed"), which is why a
raw `new NextResponse(null, { status: 307, headers: { Location: '/dashboard' } })` is
required for a relative Location.

lib/theme/cookie.ts exports used by the callback: `writeThemeCookie(theme)`, `isValidTheme(value)`.
lib/auth-logger.ts: `logAuthEvent(payload)` — mock it as `vi.fn()`.

Route-handler test idiom to copy from tests/unit/billing/connect-callback.test.ts:
hoisted `vi.mock('@/lib/supabase/server', …)` returning a configurable `createClient`
mock, `vi.mock('@/lib/auth-logger', () => ({ logAuthEvent: vi.fn() }))`, build a
`NextRequest` via `new NextRequest('https://0.0.0.0:3000/callback?code=abc')`, import
the route late (`const { GET } = await import('@/app/(auth)/callback/route')`), assert
on `res.status` and `res.headers.get('location')`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: www → canonical host 308 in proxy.ts (pure helper + wiring + tests)</name>
  <files>proxy.ts, tests/unit/middleware.test.ts</files>
  <action>
In proxy.ts:

1. Add `import { getCanonicalBaseUrl } from '@/lib/utils/site-url'` (keep the existing
   `getRequestOrigin` import from lib/demo/session).

2. Add an EXPORTED pure helper (placed next to `isPublicRoute` / `isProtectedRoute`):

```ts
/**
 * Quick-260909-eul — collapse the `www.` alias into the canonical host.
 *
 * Both `www.xtimator.com` and `xtimator.com` are served by this container and
 * cookies are host-scoped, so a session created on `www` was invisible on the
 * apex: the OAuth callback (which redirects to APP_ORIGIN) and every absolute
 * link built from getCanonicalBaseUrl() landed the user on a host with no
 * cookies → /?auth=login → "I had to log in twice". One cookie jar, one host.
 *
 * Returns the absolute redirect target, or null when no redirect applies.
 * ONLY the exact `www.` + canonical hostname alias is redirected — localhost,
 * the demo host, tenant custom domains and anything else pass through — and
 * only when the canonical base is https (never in http dev).
 */
export function getCanonicalHostRedirect(
  requestOrigin: string,
  pathname: string,
  search: string,
  canonicalBase: string
): string | null {
  let req: URL
  let canon: URL
  try {
    req = new URL(requestOrigin)
    canon = new URL(canonicalBase)
  } catch {
    return null
  }
  if (canon.protocol !== 'https:') return null
  if (req.hostname.toLowerCase() !== `www.${canon.hostname.toLowerCase()}`) return null
  return `${canon.origin}${pathname}${search}`
}
```

3. Wire it as the FIRST statements inside `proxy()`, before `classifyDemoEntryRequest`:

```ts
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const canonicalTarget = getCanonicalHostRedirect(
    getRequestOrigin(request),
    pathname,
    search,
    getCanonicalBaseUrl()
  )
  if (canonicalTarget) {
    return NextResponse.redirect(canonicalTarget, 308)
  }
  const demoEntry = classifyDemoEntryRequest(request)
  ...
```
Keep everything else in proxy() byte-identical (do not restructure the demo / claim-free /
protected-route logic). 308 (not 301/307) so method + body are preserved and browsers
cache it as permanent.

In tests/unit/middleware.test.ts add `getCanonicalHostRedirect` to the `from '@/proxy'`
import and append a new `describe('Canonical host redirect (quick-260909-eul)')` with
these cases (canonical = 'https://xtimator.com' unless stated):
- `https://www.xtimator.com` + `/dashboard` + `?tab=1` → `'https://xtimator.com/dashboard?tab=1'`
- `https://WWW.Xtimator.com` + `/` + `''` → `'https://xtimator.com/'` (case-insensitive host)
- `https://xtimator.com` (apex) → null
- `http://localhost:3000` → null
- `https://demo.xtimator.com` → null
- `https://other.example.com` → null
- canonical `http://localhost:3000` with request `http://www.localhost:3000` → null (http canonical never redirects)
- garbage requestOrigin (`'not a url'`) → null (never throws)

Run: `npx vitest run tests/unit/middleware.test.ts` — all green.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/middleware.test.ts</automated>
  </verify>
  <done>proxy.ts exports getCanonicalHostRedirect and calls it first thing in proxy(); the 8 new cases pass alongside the pre-existing middleware tests.</done>
</task>

<task type="auto">
  <name>Task 2: Host-preserving relative redirects in the auth callback (+ new test file)</name>
  <files>app/(auth)/callback/route.ts, tests/unit/auth/callback-route.test.ts</files>
  <action>
In app/(auth)/callback/route.ts:

1. Remove `import { resolveBaseUrl } from '@/lib/utils/site-url'` and the
   `const baseUrl = resolveBaseUrl(request)` line together with its 2-line comment
   about the Coolify bind address.

2. Add a small local helper above `GET`:

```ts
/**
 * Quick-260909-eul — relative Location on purpose. exchangeCodeForSession() has
 * just written the auth cookies on THIS request's host; an absolute redirect to
 * APP_ORIGIN used to strand a `www.` session on the apex (no cookies there →
 * /?auth=login → second login). NextResponse.redirect() rejects relative URLs,
 * hence the raw response. Route handlers merge cookies() writes into it.
 */
function relativeRedirect(path: `/${string}`): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}
```

3. Replace the four redirect sites:
   - exchange error → `return relativeRedirect('/?auth=login')`
   - recovery → `return relativeRedirect('/update-password')`
   - user branch → `return relativeRedirect(redirectTo)` (keep `const redirectTo = hasCompany ? '/dashboard' : '/onboarding'`; type it as `'/dashboard' | '/onboarding'` if TS complains about the template-literal param)
   - fallback → `return relativeRedirect('/?auth=login')`
   Leave `new URL(request.url)` / searchParams parsing, the company resolution, the
   theme-cookie sync and every logAuthEvent call untouched.

Create tests/unit/auth/callback-route.test.ts (copy the mock idiom from
tests/unit/billing/connect-callback.test.ts). Mock:
- `@/lib/supabase/server` → `createClient` resolving `{ auth: { exchangeCodeForSession: exchangeMock }, from: fromMock }` where `fromMock` returns a chainable builder whose terminal `maybeSingle()` resolves configurable `{ data }` per table ('companies' / 'company_members').
- `@/lib/auth-logger` → `{ logAuthEvent: vi.fn() }`
- `@/lib/theme/cookie` → `{ writeThemeCookie: vi.fn(), isValidTheme: () => false }`
Requests are built with the INTERNAL bind origin on purpose
(`new NextRequest('https://0.0.0.0:3000/callback?code=abc')`) to prove the redirect no
longer depends on request.url's origin. Assert, for each branch, `res.status === 307`
and `res.headers.get('location')` is EXACTLY the relative path (starts with '/', never
contains 'http'):
1. exchange error → `/?auth=login`
2. `?type=recovery` with successful exchange → `/update-password`
3. successful exchange, user owns a company → `/dashboard`
4. successful exchange, no company, no membership → `/onboarding`
5. no `code` param → `/?auth=login`

Run: `npx vitest run tests/unit/auth/callback-route.test.ts tests/unit/middleware.test.ts`.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/auth/callback-route.test.ts tests/unit/middleware.test.ts</automated>
  </verify>
  <done>The callback route has zero references to resolveBaseUrl/baseUrl; all five branches return 307 with a relative Location; the new test file and middleware tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Stale sw.js comment in keepalive route + CI gates</name>
  <files>app/api/auth/keepalive/route.ts</files>
  <action>
In app/api/auth/keepalive/route.ts, the header comment says the route "is NetworkOnly in
the service worker (public/sw.js) — never served from cache". public/sw.js is now a
no-fetch worker that only cleans caches and unregisters itself, so that rationale is
stale. Rewrite ONLY that bullet (item 1 in the numbered list) to read:
`1. is never served by a service worker (public/sw.js is a no-fetch worker that only cleans old caches), so it always hits the network,`
Keep every other line of the comment and the handler unchanged.

Then run both CI gates and report REAL numbers:
```bash
npx tsc -p tsconfig.ci.json; echo "TSC_EXIT=$?"
npx vitest run tests/unit tests/eval > "$SCRATCH/vitest.log" 2>&1; echo "EXIT=$?"
```
Write vitest.log to the session scratchpad, not the repo. Never pipe vitest through
head/tail (masks the exit code). Known-benign baseline on this Windows machine: 2
migration-shape tests fail via CRLF; tests/unit/mcp-route-contract.test.ts may time out
cold (re-run alone). Anything else failing is a regression from this change — fix it.
  </action>
  <verify>
    <automated>npx tsc -p tsconfig.ci.json</automated>
  </verify>
  <done>tsc exits 0; vitest shows no failures beyond the documented baseline, with real failed/passed counts reported in the SUMMARY.</done>
</task>

</tasks>

<verification>
1. `npx tsc -p tsconfig.ci.json` → exit 0.
2. `npx vitest run tests/unit tests/eval` → no NEW failures vs baseline.
3. `git diff --stat` touches ONLY: proxy.ts, app/(auth)/callback/route.ts,
   app/api/auth/keepalive/route.ts, tests/unit/middleware.test.ts,
   tests/unit/auth/callback-route.test.ts.
4. `grep -n resolveBaseUrl "app/(auth)/callback/route.ts"` → no matches.
5. After deploy (human): `curl -sI https://www.xtimator.com/dashboard?x=1` →
   `HTTP/1.1 308` + `location: https://xtimator.com/dashboard?x=1`;
   `curl -sI https://xtimator.com/callback` → `location: /?auth=login` (relative).
</verification>

<success_criteria>
- A visit to any `www.xtimator.com` URL lands on the same path on `xtimator.com`
  permanently, so a session can only ever be created on the canonical host.
- The OAuth / recovery callback never changes host on its redirect.
- Unit coverage locks both behaviors; CI gates green.
- Three atomic conventional commits (one per task), none touching files outside the list.
</success_criteria>

<output>
After completion, create
`.planning/quick/260909-eul-fix-login-twice-redirect-www-to-canonica/260909-eul-SUMMARY.md`
</output>
