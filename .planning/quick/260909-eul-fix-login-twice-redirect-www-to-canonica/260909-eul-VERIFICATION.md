---
quick_task: 260909-eul
verified: 2026-09-09T13:20:00Z
status: human_needed
score: 4/4 must-have truths verified
re_verification: false
commits_verified:
  - 695ed367
  - 8f2ec309
  - 725e8b10
tests_run: "npx vitest run tests/unit/middleware.test.ts tests/unit/auth/callback-route.test.ts → 2 files passed, 34 tests passed, exit 0"
human_verification:
  - test: "After deploy: curl -sI 'https://www.xtimator.com/dashboard?x=1'"
    expected: "HTTP/2 308 + location: https://xtimator.com/dashboard?x=1"
    why_human: "Requires the deployed container behind the real Coolify/Traefik edge; also proves www.xtimator.com actually routes to THIS container (if www is served by a registrar forward or a different app, proxy.ts never sees the request and the fix cannot fire)."
  - test: "After deploy: curl -sI 'https://xtimator.com/callback'"
    expected: "location: /?auth=login (relative, no scheme/host)"
    why_human: "Confirms no CDN/edge layer rewrites the relative Location into an absolute one."
  - test: "Full Google sign-in from a cold browser starting at www.xtimator.com"
    expected: "Exactly ONE login; lands on xtimator.com/dashboard"
    why_human: "End-to-end OAuth against the real Supabase project; cannot be exercised offline."
  - test: "Supabase Auth redirect allow-list contains https://xtimator.com/callback (apex)"
    expected: "Apex callback URL allowed; www entry may be removed once the 308 is live"
    why_human: "Supabase dashboard config, outside the repo."
---

# Quick Task 260909-eul Verification Report

**Goal:** Fix "login twice" caused by split cookie jars between `www.xtimator.com` and `xtimator.com` — (1) 308 the `www.` alias to canonical before any Supabase client is built, (2) relative `Location` on every auth-callback branch, (3) drop the stale sw.js NetworkOnly claim.

**Verified:** 2026-09-09
**Status:** human_needed — all four code-level truths verified, tests green; only post-deploy/production confirmation remains.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `https://www.xtimator.com/<path>?<query>` is answered with a 308 to the canonical host, **before** any Supabase client is built | ✓ VERIFIED | `proxy.ts:184-193` — `getCanonicalHostRedirect(...)` is the first statement of `proxy()`; `createServerClient` is only reached at line 218, after the demo/claim-free branches. Path + query preserved via `${canon.origin}${pathname}${search}` (`proxy.ts:128`). |
| 2 | Requests on apex, localhost, demo.xtimator.com, or any other host are NOT host-redirected | ✓ VERIFIED | `proxy.ts:126-127` — bails unless canonical protocol is `https:` AND `req.hostname === "www." + canon.hostname` (both lowercased). 6 dedicated unit cases (apex / localhost / demo / other host / http-canonical / garbage input) all assert `null`. |
| 3 | Every redirect from `app/(auth)/callback/route.ts` uses a RELATIVE Location | ✓ VERIFIED | All four sites (`:28`, `:34`, `:75`, `:81`) call `relativeRedirect()` (`:13-15`) → `new NextResponse(null, { status: 307, headers: { Location: path } })`. `grep -n resolveBaseUrl app/(auth)/callback/route.ts` → no matches. 5 unit tests assert `status === 307`, exact relative path, and `not.toContain('http')`, using the internal bind origin `https://0.0.0.0:3000` so any regression to a request/base-URL-derived redirect fails loudly. |
| 4 | The keepalive comment no longer claims sw.js treats `/api` as NetworkOnly | ✓ VERIFIED | `app/api/auth/keepalive/route.ts:16-17` now reads "is never served by a service worker (public/sw.js is a no-fetch worker that only cleans old caches)". Cross-checked against `public/sw.js`: install→skipWaiting, activate→cleanup caches + `registration.unregister()`, **no `fetch` listener**. The new comment is factually accurate. |

**Score: 4/4**

### Required Artifacts

| Artifact | Expected | Level 1 exists | Level 2 substantive | Level 3 wired | Status |
| -------- | -------- | -------------- | ------------------- | ------------- | ------ |
| `proxy.ts` | exported `getCanonicalHostRedirect` + 308 at top of `proxy()` | ✓ | ✓ (pure, try/catch-guarded, 18 LOC) | ✓ called at `proxy.ts:185`; imports `getCanonicalBaseUrl` (`:5`) and `getRequestOrigin` (`:4`) | ✓ VERIFIED |
| `app/(auth)/callback/route.ts` | host-preserving relative redirects | ✓ | ✓ | ✓ `relativeRedirect` used at all 4 return sites; zero `resolveBaseUrl`/`baseUrl` refs | ✓ VERIFIED |
| `app/api/auth/keepalive/route.ts` | corrected comment | ✓ | ✓ | n/a (comment-only, handler untouched) | ✓ VERIFIED |
| `tests/unit/middleware.test.ts` | coverage for the helper | ✓ | ✓ 8 new cases in `describe('Canonical host redirect (quick-260909-eul)')` | ✓ imports `getCanonicalHostRedirect` from `@/proxy` (`:9`) | ✓ VERIFIED |
| `tests/unit/auth/callback-route.test.ts` | 5 branches, relative Location | ✓ (new, 127 lines) | ✓ | ✓ imports the real route via late `await import('@/app/(auth)/callback/route')` | ✓ VERIFIED |

### Key Links

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `proxy()` | `getCanonicalHostRedirect(getRequestOrigin(request), pathname, search, getCanonicalBaseUrl())` | first statement of `proxy()`, before `classifyDemoEntryRequest` | ✓ WIRED (`proxy.ts:185-190`) |
| callback route | `new NextResponse(null, { status: 307, headers: { Location } })` | local `relativeRedirect()` | ✓ WIRED (`:13-15`, used 4×) |
| `getRequestOrigin` | `x-forwarded-host` → real edge host | `lib/demo/session.ts:31-36` | ✓ WIRED — behind Traefik the proxy sees the browser-facing host, not the `0.0.0.0:3000` bind |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Both target test files pass | `npx vitest run tests/unit/middleware.test.ts tests/unit/auth/callback-route.test.ts` | `Test Files 2 passed (2) / Tests 34 passed (34)`, exit 0, 7.27s | ✓ PASS |
| Diff scope | `git show --stat 695ed367 8f2ec309 725e8b10` | exactly the 5 planned files (45+48, 25+127, 3 lines) — nothing else | ✓ PASS |
| No stray `middleware.ts` shadowing `proxy.ts` | `ls middleware.ts` | not found (Next 16.2.6 uses `proxy.ts`) | ✓ PASS |
| Production 308/relative-Location | curl against xtimator.com | not run — requires deploy | ? SKIP → human |

---

## Deep-Dive Answers to the Three Specific Questions

### 1. Does Next.js 16 merge `cookies().set()` writes into a manually constructed `new NextResponse(null, { status: 307, headers: { Location } })`?

**Yes — identically to `NextResponse.redirect()`. Confirmed in source.**

Next version in this repo: **16.2.6** (`node_modules/next/package.json`).

`node_modules/next/dist/server/route-modules/app-route/module.js`, the tail of `do()` (around lines 500-515), runs on the **returned response of every route handler**, with no special-casing of how that response was constructed:

```js
// It's possible cookies were set in the handler, so we need
// to merge the modified cookies and the returned response
// here.
const headers = new Headers(res.headers);
if ((0, _requestcookies.appendMutableCookies)(headers, requestStore.mutableCookies)) {
    return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
    });
}
return res;
```

The only other `appendMutableCookies` call in that file (line 465) is on the `redirect()`-thrown-error path (`isRedirectError`), which is irrelevant here. The merge above is the one that matters, and it keys off nothing but `res` being a `Response` — `NextResponse.redirect()` returns a `NextResponse`, and so does `new NextResponse(null, {...})`. `status`, `statusText` and every explicitly-set header (including our `Location`) are carried over verbatim.

`appendMutableCookies` (`node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js`) is order-safe:

```js
const resCookies = new ResponseCookies(headers);
const returnedCookies = resCookies.getAll();
for (const cookie of modifiedCookieValues) resCookies.set(cookie); // fallbacks
for (const cookie of returnedCookies) resCookies.set(cookie);      // res wins
```

so the auth cookies are appended as `Set-Cookie` on the 307 and any cookie already on the response takes precedence.

Both writers in this route feed `requestStore.mutableCookies` through the `next/headers` `cookies()` store, so both are covered:
- `lib/supabase/server.ts:5,15-19` — `const cookieStore = await cookies()` and `setAll` → `cookieStore.set(...)`. This is the store `@supabase/ssr`'s `createServerClient` writes to inside `exchangeCodeForSession`.
- `lib/theme/cookie.ts:20-28` — `writeThemeCookie` → `(await cookies()).set(...)`.

**Conclusion: no cookie loss.** The relative-307 is exactly as cookie-safe as the previous `NextResponse.redirect(new URL(...))` was. (Note the unit tests cannot prove this — they call `GET()` directly, outside Next's `workUnitAsyncStorage`, so `writeThemeCookie` is mocked and no merge occurs. The guarantee comes from the framework source above, and is worth re-confirming on any Next major upgrade.)

### 2. Can the 308 loop, or fire for demo.xtimator.com / localhost / tenant custom domains?

**No loop, and no false fires.**

- **Loop safety.** The redirect target is always `canon.origin`. On the follow-up request `req.hostname === canon.hostname`, and the guard requires `req.hostname === "www." + canon.hostname` — an apex host can never satisfy that. Even in the pathological config where `APP_ORIGIN=https://www.xtimator.com`, the target host would have to be `www.www.xtimator.com` to re-fire; it isn't, so it's a single no-op, not a loop. A hostname cannot be a strict `www.`-prefixed superstring of itself, so the fixpoint is reached in one hop by construction.
- **demo.xtimator.com.** `"demo.xtimator.com" !== "www.xtimator.com"` → `null`. The demo handoff (`classifyDemoEntryRequest`) still runs unchanged immediately after. A visit to `www.xtimator.com/demo/entry` produces a legitimate two-hop chain (308 → apex, then 303 → demo host), not a loop.
- **localhost.** Two independent guards: `canon.protocol !== 'https:'` returns `null` for any http dev canonical, and the hostname compare fails anyway. Covered by two explicit tests.
- **Tenant custom domains** (`app/(app)/settings/custom-domain`, share pages on e.g. `www.acme.com`). The compare is against the *canonical* hostname, so `www.acme.com !== www.xtimator.com` → `null`. Only the single literal `www.xtimator.com` alias is ever redirected.
- **Fail-open on weirdness.** Malformed origin, missing `Host`/`x-forwarded-host` (falls back to the internal bind origin), or a trailing-dot host all yield `null` — the request passes through untouched rather than redirecting somewhere wrong.
- **Scope caveat (INFO, not a gap):** the `config.matcher` excludes `_next/static`, `_next/image`, `favicon.ico` and `*.svg|png|jpg|jpeg|gif|webp`, so those asset paths on `www` are served without a 308. They carry no auth cookies, so the cookie-jar fix is unaffected.
- **Permanence caveat (INFO):** 308 is cached indefinitely by browsers and is deliberately hard to undo. That is the intent ("one cookie jar forever"), but if `www` ever needs to serve independently, already-redirected clients will be sticky. Accepted trade-off; worth remembering rather than fixing.

### 3. Are `?ref=` affiliate params and the `?auth=login&next=...` invite flow preserved?

**Yes for both, with one nuance worth knowing.**

- **`?ref=` affiliate.** The 308 target is `${canon.origin}${pathname}${search}` and `search` comes straight from `request.nextUrl.search` (leading `?` included), so `https://www.xtimator.com/?ref=CODE` → `https://xtimator.com/?ref=CODE`. The `?tab=1` unit case locks query preservation. The referral cookie is *not* written on the www hop (`applyReferralCookie` sits below the early return) — which is correct: writing it on `www` would land it in the doomed cookie jar. It is written on the apex request that immediately follows, by `proxy.ts:275`. Net effect is strictly better than before: attribution now always lands in the single jar the signup will read from (`lib/affiliates/attribution-server.ts`).
- **`?auth=login&next=...` / `?auth=signup&next=...`.** Both producers (`app/oauth/authorize/page.tsx:85`, `app/invite/accept/page.tsx:50`) emit a relative `redirect('/?auth=login&next=<encoded>')`, and the consumer is client-side (`components/landing/landing-page.tsx:41-52` reads `auth` + `next` from `window.location.search` and threads `next` into the auth dialog). The 308 preserves the whole query string, so `www.xtimator.com/invite/accept?token=X` → `xtimator.com/invite/accept?token=X` → `/?auth=signup&next=...` on the canonical host. Nothing in this flow was touched.
- **Nuance (pre-existing, not a regression):** the Google-OAuth branch never carried `next` through `/callback` — the callback goes to `/dashboard` or `/onboarding` and always did (previously via `new URL(redirectTo, baseUrl)`, now via `relativeRedirect(redirectTo)`). So an invite accepted via Google still loses the `next` deep-link. Identical behavior before and after this change; flagged as a known limitation, not a gap for this task.
- **Reinforcement:** `components/landing/auth-dialog.tsx:91`, `components/auth/google-oauth-button.tsx:21` and `app/(auth)/login/login-form.tsx:66` all build `redirectTo: ${window.location.origin}/callback`. With the 308 live, `window.location.origin` can only ever be the apex, so Supabase can only ever call back to the apex — the two fixes are mutually reinforcing rather than redundant.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `proxy.ts` | 123 | empty `catch {}` | ℹ️ Info | Deliberate fail-open on malformed URLs; the plan required "never throws" and a unit test locks it. Not a stub. |
| `app/(auth)/callback/route.ts` | 14 | `new NextResponse(null, ...)` | ℹ️ Info | Required — `NextResponse.redirect()` rejects relative URLs. Cookie merging verified against Next source (see Q1). |

No TODO/FIXME/placeholder/`return null`-stub patterns in any of the five touched files.

## Transient Edge Case (INFO — worth watching for ~1 hour after deploy)

A PKCE OAuth flow **already in flight** when the deploy lands (started on `www`, so the `sb-*-auth-token-code-verifier` cookie is scoped to `www`) will now be 308'd to the apex at callback time, where that verifier cookie does not exist → `exchangeCodeForSession` errors → `/?auth=login`. That user logs in once more and is then permanently fine. This cannot recur after the 308 is cached/known, because the sign-in page itself can no longer be reached on `www`. No code change needed; just don't misread it as the bug persisting.

## Gaps Summary

**None.** All four must-have truths are verified in the actual code, the two target test files pass (34/34, exit 0), the diff touches exactly the five planned files, and the SUMMARY's claims were independently confirmed rather than taken at face value. Status is `human_needed` solely because the plan's own verification step 5 — production `curl` against the deployed edge — cannot be executed locally, and because it is the only thing that proves `www.xtimator.com` actually terminates at this container.

---

_Verified: 2026-09-09_
_Verifier: Claude (gsd-verifier)_
