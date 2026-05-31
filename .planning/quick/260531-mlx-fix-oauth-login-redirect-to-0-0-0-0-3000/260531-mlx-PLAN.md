---
phase: quick-260531-mlx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/utils/site-url.ts
  - app/(auth)/callback/route.ts
  - tests/unit/site-url.test.ts
autonomous: true
requirements: [QUICK-OAUTH-REDIRECT]

must_haves:
  truths:
    - "After Google OAuth, the user lands on the public domain (https://xtimator.com/dashboard), never https://0.0.0.0:3000/dashboard"
    - "A trailing newline / quotes in NEXT_PUBLIC_SITE_URL does not leak into the redirect URL"
    - "When NEXT_PUBLIC_SITE_URL is unset, the callback uses X-Forwarded-Proto + X-Forwarded-Host from the proxy"
    - "All four callback redirects (recovery, dashboard, onboarding, /?auth=login fallback) use the canonical base URL"
  artifacts:
    - path: "lib/utils/site-url.ts"
      provides: "resolveBaseUrl(request) helper with sanitization + 3-tier fallback precedence"
      exports: ["resolveBaseUrl"]
    - path: "app/(auth)/callback/route.ts"
      provides: "OAuth callback that builds redirects against the canonical base URL"
      contains: "resolveBaseUrl"
    - path: "tests/unit/site-url.test.ts"
      provides: "Unit tests for sanitization + fallback precedence"
  key_links:
    - from: "app/(auth)/callback/route.ts"
      to: "lib/utils/site-url.ts"
      via: "import { resolveBaseUrl }"
      pattern: "resolveBaseUrl\\("
    - from: "resolveBaseUrl"
      to: "NEXT_PUBLIC_SITE_URL"
      via: "sanitized env read with header fallback"
      pattern: "NEXT_PUBLIC_SITE_URL"
---

<objective>
Fix OAuth/login redirect sending users to https://0.0.0.0:3000/dashboard after the Hetzner/Coolify migration.

Root cause (already diagnosed — do not re-investigate): `app/(auth)/callback/route.ts` derives `origin` from `new URL(request.url)`. Behind the Coolify reverse proxy, the Next.js standalone server binds `HOSTNAME=0.0.0.0 PORT=3000`, so `request.url`'s host resolves to the internal bind address `0.0.0.0:3000` instead of the public domain. Every `NextResponse.redirect(new URL('/path', origin))` therefore points at `https://0.0.0.0:3000`. The client-side Google button already uses `window.location.origin` (correct); email/password sign-in uses relative `redirect()` (unaffected). The bug is purely the callback route's server-side origin reconstruction.

Purpose: Make post-OAuth redirects resolve to the canonical public domain regardless of the internal bind address, with a defensive sanitizer for the malformed Coolify env value.
Output: A small, tested `resolveBaseUrl` helper + callback route wired to use it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Existing precedent to MIRROR. lib/oauth/issuer.ts already implements this exact
     shape (sanitization + proxy-header fallback) and has a matching vitest test at
     tests/unit/oauth-issuer.test.ts. Match its style for consistency. -->

From lib/oauth/issuer.ts (the pattern to copy):
```typescript
function normalize(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}
// proxy fallback:
const proto = h.get('x-forwarded-proto') ?? 'http'
const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:9633'
```

From lib/actions/auth.ts (existing NEXT_PUBLIC_SITE_URL convention):
```typescript
const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:9633'
// used as: `${origin}/callback?type=recovery`
```

Current callback (the bug) — app/(auth)/callback/route.ts:
```typescript
const { searchParams, origin } = new URL(request.url) // origin = https://0.0.0.0:3000 behind proxy
return NextResponse.redirect(new URL('/dashboard', origin))
```

Test runner: vitest. Existing example test: tests/unit/oauth-issuer.test.ts (uses
beforeEach/afterEach env backup, vi.resetModules(), explicit imports from 'vitest').
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create resolveBaseUrl helper + unit tests</name>
  <files>lib/utils/site-url.ts, tests/unit/site-url.test.ts</files>
  <behavior>
    resolveBaseUrl(request: Request): string — resolution precedence:
    - Test 1: NEXT_PUBLIC_SITE_URL set to "https://xtimator.com" → returns "https://xtimator.com"
    - Test 2 (the live Coolify bug): NEXT_PUBLIC_SITE_URL = 'https://xtimator.com\n' → returns "https://xtimator.com" (trailing newline stripped)
    - Test 3: NEXT_PUBLIC_SITE_URL = '"https://xtimator.com"' (surrounding double quotes) → returns "https://xtimator.com" (quotes stripped)
    - Test 4: NEXT_PUBLIC_SITE_URL = 'https://xtimator.com/' → returns "https://xtimator.com" (trailing slash stripped)
    - Test 5: NEXT_PUBLIC_SITE_URL = '   \n  ' (whitespace/empty) → falls through to header fallback
    - Test 6 (proxy fallback): env unset, request has headers X-Forwarded-Proto=https, X-Forwarded-Host=xtimator.com → returns "https://xtimator.com"
    - Test 7 (last resort): env unset, no X-Forwarded-* headers, request host = 0.0.0.0:3000 → returns "https://0.0.0.0:3000" (documents the last-resort behavior; proxy headers are the realistic path)
  </behavior>
  <action>
    Create lib/utils/site-url.ts exporting `resolveBaseUrl(request: Request): string`.

    Precedence (mirror lib/oauth/issuer.ts style):
    1. Sanitized process.env.NEXT_PUBLIC_SITE_URL — if non-empty after sanitization, return it.
    2. Else build from proxy headers: `${request.headers.get('x-forwarded-proto') ?? 'http'}://${request.headers.get('x-forwarded-host') ?? request.headers.get('host')}` — only if a host is present.
    3. Else last resort: `new URL(request.url).origin`.

    Sanitizer `normalize(raw)`:
    - return null for undefined/null
    - trim() whitespace (handles the literal trailing \n in the Coolify env)
    - strip surrounding single/double quotes (env value may be quoted: "https://xtimator.com")
    - re-trim after quote strip
    - strip a single trailing slash
    - return null if empty after all of the above (so caller falls through)

    Keep it synchronous (takes the Request directly — no next/headers async call needed, since the callback already has `request`). This differs from resolveIssuer() which is async; that's fine — document the difference in a one-line comment.

    Then create tests/unit/site-url.test.ts matching the tests/unit/oauth-issuer.test.ts structure:
    - import { afterEach, beforeEach, describe, expect, it } from 'vitest' (explicit imports — tsc requires it per Phase 22 decision)
    - beforeEach: back up + delete process.env.NEXT_PUBLIC_SITE_URL
    - afterEach: restore
    - Build fake Request objects with `new Request('https://0.0.0.0:3000/callback', { headers: {...} })` to exercise the header + last-resort branches.
    - Cover all 7 behavior cases above.

    Do NOT use next/headers here (resolveBaseUrl reads from the passed Request, so the test needs no next/headers mock — simpler than oauth-issuer.test.ts).
  </action>
  <verify>
    <automated>npx vitest run tests/unit/site-url.test.ts</automated>
  </verify>
  <done>site-url.ts exports resolveBaseUrl; all 7 tests pass; sanitization strips trailing \n, quotes, and trailing slash; header fallback and last-resort branches covered.</done>
</task>

<task type="auto">
  <name>Task 2: Wire callback route to use resolveBaseUrl for all redirects</name>
  <files>app/(auth)/callback/route.ts</files>
  <action>
    Edit app/(auth)/callback/route.ts:
    1. Add `import { resolveBaseUrl } from '@/lib/utils/site-url'`.
    2. Replace `const { searchParams, origin } = new URL(request.url)` with:
       - `const { searchParams } = new URL(request.url)` (still need searchParams for code/type)
       - `const baseUrl = resolveBaseUrl(request)`
    3. Replace ALL FOUR `new URL('<path>', origin)` calls to use `baseUrl` instead of `origin`:
       - recovery → `new URL('/update-password', baseUrl)`
       - dashboard/onboarding → `new URL(redirectTo, baseUrl)`
       - fallback → `new URL('/?auth=login', baseUrl)`
    4. Do NOT change the logging, the supabase exchange, the claims/company logic, or theme cookie writing — only the origin source for redirect URL construction.

    OUT OF SCOPE for this task (do NOT touch): lib/utils/share-link.ts and lib/actions/auth.ts resetPassword. The brief marks reusing the helper there as OPTIONAL; keep scope tight — the must-fix is the callback. Leave them unchanged.
  </action>
  <verify>
    <automated>npx tsc --noEmit; npx vitest run tests/unit/site-url.test.ts</automated>
  </verify>
  <done>callback/route.ts imports resolveBaseUrl and uses it for all four redirects; no remaining reference to `origin` from new URL(request.url) in redirect construction; tsc clean.</done>
</task>

</tasks>

<verification>
- `npx vitest run tests/unit/site-url.test.ts` — all sanitization + fallback tests pass
- `npx tsc --noEmit` — no type errors
- Grep `app/(auth)/callback/route.ts` for `origin` — must NOT appear in any `new URL(...)` redirect call (only `resolveBaseUrl(request)` / `baseUrl`)
- All four redirect sites (recovery, dashboard, onboarding, fallback) construct URLs against `baseUrl`
</verification>

<success_criteria>
- After Google OAuth behind the Coolify proxy, redirect targets the public domain, never 0.0.0.0:3000
- A trailing newline or surrounding quotes in NEXT_PUBLIC_SITE_URL is sanitized away
- Helper has 3-tier precedence: sanitized env → X-Forwarded-Proto/Host → request origin
- New helper is unit-tested and reusable
</success_criteria>

<output>
After completion, create `.planning/quick/260531-mlx-fix-oauth-login-redirect-to-0-0-0-0-3000/260531-mlx-SUMMARY.md`

NOTE FOR HUMAN (out of scope for this code change — infra config in Coolify UI):
The Coolify env var `NEXT_PUBLIC_SITE_URL` currently contains a literal trailing newline and/or
surrounding quotes (e.g. `"https://xtimator.com\n"`). Set it to exactly `https://xtimator.com`
(no quotes, no trailing whitespace/newline) in the Coolify UI, then rebuild — NEXT_PUBLIC_* are
inlined at BUILD time via Docker build args (see Dockerfile lines 51-60), so a runtime-only change
will not take effect until the next build. The code sanitization added here is a defensive
belt-and-suspenders measure, not a replacement for fixing the env var.
</output>
