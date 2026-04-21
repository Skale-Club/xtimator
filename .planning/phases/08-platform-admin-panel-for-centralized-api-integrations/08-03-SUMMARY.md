---
phase: 08-platform-admin-panel-for-centralized-api-integrations
plan: 03
subsystem: auth

tags: [proxy, super-admin, react-cache, scoped-dark-theme, css-vars, playwright, vitest, ssr]

# Dependency graph
requires:
  - phase: 08-platform-admin-panel-for-centralized-api-integrations
    provides: platform_admins table (08-01), service-role client + server-only pattern (08-02)
provides:
  - lib/supabase/admin-gate.ts (checkPlatformAdmin proxy helper)
  - lib/auth/admin-context.ts (getAdminContext + requireAdmin, React-cached)
  - app/globals.css scoped [data-theme="admin-dark"], [data-theme="dark-auth"] override block
  - tests/setup/seed-admin.ts (idempotent platform_admins upsert + cleanup helper)
  - tests/e2e/admin-gate.spec.ts (3-user-class gate spec)
  - proxy.ts wired with admin gate (404-rewrite for non-admins on /admin/*)
affects:
  - 08-04 admin UI (admin layout consumes requireAdmin; admin-dark theme on shell wrapper)
  - 08-05 auth dark pass (consumes [data-theme="dark-auth"] selector + var(--platform-primary) override)
  - 08-06 admins page (uses requireAdmin in server actions per R-05; uses seed-admin helper in e2e)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Proxy-side admin gate composed AFTER updateSession() but BEFORE its login-redirect for /admin/* — 404 rewrite never reveals the admin surface (D-07)"
    - "React cache() per-request memoisation: proxy + layout + nested server components share one platform_admins lookup"
    - "Scoped dark theme via [data-theme] attribute selector — does NOT collide with next-themes .dark class (D-20)"
    - "var(--platform-primary, fallback) CSS-var indirection so getBranding() can override admin/auth accent at runtime"
    - "checkPlatformAdmin() uses request-cookies SSR client (not next/headers cookies()) — required because proxy runs before render"
    - "requireAdmin() throws via notFound() — matches Next.js 16 idiom for hiding routes"
    - "Playwright innerText assertion (not raw HTML) for visible-content checks — avoids false-negatives from RSC payload leak"
    - "Test mocks for vi.mock('@supabase/ssr') + vi.mock('@/lib/supabase/server') + vi.mock('next/navigation') control gate inputs without a real DB"

key-files:
  created:
    - lib/supabase/admin-gate.ts
    - lib/auth/admin-context.ts
    - tests/setup/seed-admin.ts
    - tests/unit/admin-gate.test.ts
    - tests/e2e/admin-gate.spec.ts
  modified:
    - proxy.ts (composed admin gate; runs gate BEFORE updateSession redirect for /admin/*)
    - app/globals.css (scoped dark override block appended to @layer base)

key-decisions:
  - "Admin gate runs BEFORE updateSession's auth redirect for /admin/* paths — original logic would have redirected anon users to /auth/login, which leaks the existence of the admin route. Truth-preserving fix: 404 takes precedence (D-07)."
  - "requireAdmin throws via notFound() so Next.js renders the same 404 page that the proxy rewrites to — visually identical from the user perspective."
  - "Visible-text assertion in e2e (innerText) — Next.js dev RSC payload includes the requested pathname literally, but it never renders to the user. Asserting against raw HTML would create flaky false negatives."
  - "Mock next/navigation.notFound() to throw a recognisable error in unit tests so we can assert it was called without actually exiting the test runner."

patterns-established:
  - "Per-request gate triple: proxy (admin-gate.ts) + layout (admin-context.ts via cache()) + server action (requireAdmin()). Belt-and-braces per Next.js 16 docs."
  - "vi.mock factory for chainable Supabase service client: { from, select, eq, single, maybeSingle } all return the chain; terminal call resolves to mocked response."

requirements-completed: [ADMIN-01]

# Metrics
duration: 8min
completed: 2026-04-21
---

# Phase 08 Plan 03: Admin Gate + Scoped Dark Theme Summary

**Composed proxy admin gate (404-rewrites non-admins on /admin/* without redirecting to login), React-cache()d admin-context helper for layout/server-action belt-and-braces, scoped dark CSS vars usable by both /admin/* and /(auth)/*, and a 3-user-class e2e spec — completes Wave 2 and unblocks every Wave 3 admin UI plan.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-21T01:16:13Z
- **Completed:** 2026-04-21T01:24:10Z
- **Tasks:** 2 (Task 1 TDD: gate + context + CSS + seed; Task 2: proxy wiring + e2e spec)
- **Files created:** 5
- **Files modified:** 2
- **Test assertions:** 7 unit (all passing) + 3 e2e (1 passing locally, 1 requires live signup, 1 env-gated)

## Accomplishments

- **`lib/supabase/admin-gate.ts`** — `checkPlatformAdmin(request)` reads SSR session from request cookies (not next/headers cookies(); proxy runs pre-render), looks up `platform_admins` via service-role client, returns boolean. Never throws — proxy needs a clean negative for the 404 rewrite.
- **`lib/auth/admin-context.ts`** — `getAdminContext()` wrapped in React `cache()` for per-request memoisation; `requireAdmin()` throws `notFound()` on negative. Used by upcoming admin layout (P-01c) and every admin server action (R-05 mitigation).
- **`proxy.ts`** — composes existing `updateSession()` + new `checkPlatformAdmin()`. For `/admin/*`, the gate runs UNCONDITIONALLY (anon → 404, non-admin → 404) BEFORE honouring updateSession's normal "redirect anon to /auth/login" behaviour. Loop guard for `pathname === '/404'` (R-06).
- **`app/globals.css`** — appended scoped `[data-theme="admin-dark"], [data-theme="dark-auth"]` block within `@layer base`. Uses `var(--platform-primary, 220 91% 60%)` so `getBranding()` can override accent at runtime. Does NOT modify `:root` or `.dark` — preserves next-themes global toggle (D-20).
- **`tests/setup/seed-admin.ts`** — idempotent upsert helper for e2e DB seeding. Documents the 2-admin-row invariant required so cleanup never trips the last-admin trigger.
- **`tests/e2e/admin-gate.spec.ts`** — 3 cases. Anon (always runs, verified passing). Non-admin (signs up a fresh user via the live signup flow). Admin (env-gated `test.skip` unless TEST_ADMIN_EMAIL/PASSWORD set).

## Task Commits

1. **Task 1 RED — failing tests for admin-gate + admin-context** — `9ac8bde` (test)
2. **Task 1 GREEN — admin-gate + admin-context + scoped dark CSS + seed helper** — `77484de` (feat)
3. **Task 2 — proxy.ts admin gate wiring + e2e spec** — `0e300dc` (feat)

TDD cycle followed for Task 1 (RED commit + GREEN commit). Task 2 combined implementation + spec because the proxy and the e2e are tightly coupled — they're verified together as a single behaviour.

## Files Created/Modified

### Created

- `lib/supabase/admin-gate.ts` — `checkPlatformAdmin(request: NextRequest): Promise<boolean>` (server-only)
- `lib/auth/admin-context.ts` — `getAdminContext` (React-cache()d) + `requireAdmin` + `AdminContext` type (server-only)
- `tests/setup/seed-admin.ts` — `seedPlatformAdmin(userId)` returning cleanup fn
- `tests/unit/admin-gate.test.ts` — 7 tests (3 checkPlatformAdmin, 3 getAdminContext, 1 requireAdmin)
- `tests/e2e/admin-gate.spec.ts` — 3 Playwright cases

### Modified

- `proxy.ts` — replaced thin updateSession-only proxy with composed gate. Admin paths get the 404-precedence treatment; non-admin paths preserve the original redirect-to-login behaviour.
- `app/globals.css` — appended ~22-line scoped dark override block inside `@layer base`. No edits to existing `:root` or `.dark` blocks.

## Decisions Made

- **Admin gate must run BEFORE updateSession's redirect for `/admin/*` paths.** The plan's truth statements demand 404 (not redirect-to-login) for unauthenticated visitors to `/admin/*`. The original `lib/supabase/proxy.ts` redirects all non-auth-route, non-public-estimate paths to `/auth/login` when there's no session. For the admin surface, that redirect itself reveals the route exists. Resolution: in the new proxy, when pathname starts with `/admin`, run `checkPlatformAdmin` and 404-rewrite on negative — only fall through to the (potentially redirected) updateSession response when the user IS an admin. Non-admin paths keep the original redirect flow untouched.
- **`requireAdmin` throws `notFound()` rather than returning a discriminated union.** Cleaner call sites — `const ctx = await requireAdmin()` is always defined. Matches Next.js 16's idiom for "hide this route entirely."
- **Mock `notFound()` to throw a recognisable string in unit tests.** Lets us assert it was called without actually exiting the test runner. The mock value `'NEXT_NOT_FOUND'` is pattern-matched in the test.
- **Visible-text assertion in e2e (`innerText`), not raw HTML.** Next.js dev mode includes the requested pathname literally in the streamed RSC payload — that's a routing artifact, not visible UI. Asserting against raw HTML would falsely flag the URL segment "integrations" as a leak. The 404 page's *visible* content is "404 — This page could not be found," which is what the user sees.
- **`var(--platform-primary, 220 91% 60%)` for both `--primary` and `--ring` in the dark block.** Lets `app/(auth)/layout.tsx` (Plan 07) and `app/admin/layout.tsx` (Plan 04) inject `style={{ '--platform-primary': hexToHslTriplet(branding.primaryColor) }}` and have the accent take effect with zero JS re-renders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Playwright Chromium binary not installed**

- **Found during:** Task 2 first e2e run (`bunx playwright test ...`)
- **Issue:** `Error: browserType.launch: Executable doesn't exist at C:\Users\Vanildo\AppData\Local\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe`. Playwright was upgraded since the last e2e run; binaries weren't refreshed.
- **Fix:** `bunx playwright install chromium` — downloaded 111.5 MiB Chromium headless shell.
- **Files modified:** none (browser binary lives outside the repo at `~/AppData/Local/ms-playwright/`).
- **Verification:** `bunx playwright test ... --grep "anon 404"` exits 0 after install.
- **Committed in:** N/A (binary install, not a code change).

**2. [Rule 1 — Bug] Original proxy redirects /admin/* anon visitors to /auth/login (leaks admin existence)**

- **Found during:** Task 2 first e2e run — anon visitor got HTTP 200 on `/admin/integrations` instead of 404 because they were being redirected to `/auth/login` (which renders 200).
- **Issue:** The pre-existing `lib/supabase/proxy.ts` returns a redirect to `/auth/login` for any non-authenticated request to a non-auth, non-public-estimate path. This is correct for `/dashboard` but WRONG for `/admin/*` per D-07 (truth: "anon user receives 404, NOT redirect to login").
- **Fix:** Reordered the gate logic in `proxy.ts`: the `/admin/*` check now runs unconditionally — if `checkPlatformAdmin` returns false (which covers BOTH "no session" and "not an admin"), rewrite to `/404` regardless of whether updateSession returned a redirect. Non-admin paths keep the original behaviour (3xx short-circuit).
- **Files modified:** `proxy.ts`
- **Verification:** anon e2e test passes (404 status, "This page could not be found" visible text).
- **Committed in:** `0e300dc` (Task 2)

**3. [Rule 1 — Bug] e2e visible-content assertion matched RSC payload pathname leak**

- **Found during:** Task 2 second e2e run — anon test got the right 404 status but the body assertion `expect(body).not.toMatch(/Integrations/i)` failed because Next's dev-mode RSC payload includes the requested pathname (`"c":["","admin","integrations"]`) inside the streamed JSON.
- **Issue:** `page.content()` returns the raw HTML INCLUDING the streamed RSC payload. The lowercase URL segment matches the case-insensitive `Integrations` regex. This is not actual leaked UI content — it's a routing artifact.
- **Fix:** Switched to `page.locator('body').innerText()` which returns only rendered visible text. Added a positive assertion (`toMatch(/This page could not be found/i)`) to confirm it really is the 404 page.
- **Files modified:** `tests/e2e/admin-gate.spec.ts`
- **Verification:** anon e2e test passes (1 passed in 4.0s).
- **Committed in:** `0e300dc` (Task 2)

---

**Total deviations:** 3 auto-fixed (1 blocking env issue, 2 small bugs in proxy logic + e2e assertion). All necessary for the plan's stated truths to hold; no scope creep.

## Issues Encountered

- **Non-admin e2e test (`non-admin 404`) not run locally in this pass.** Running it requires a real Supabase signup against the dev project (it creates a throwaway user via the live `/auth/signup` flow). The verifier agent will run it during phase verification.
- **Admin positive case (`admin sees panel`) is env-gated.** Requires `TEST_ADMIN_EMAIL` + `TEST_ADMIN_PASSWORD` set AND the corresponding `auth.users` row pre-seeded into `platform_admins` (per `supabase/ADMIN-BOOTSTRAP.md`). Until Plan 04 ships an actual `/admin/integrations` page, the test asserts `not.toBe(404)` — even a 500 (page doesn't exist yet) confirms the gate is letting the admin through.
- **Windows line-ending warnings (LF→CRLF) on git commit** — cosmetic, no file corruption.

## User Setup Required

For Wave 3 e2e admin-positive runs:

1. Bootstrap an admin in the dev DB per `supabase/ADMIN-BOOTSTRAP.md`.
2. Seed a SECOND admin row (so cleanup in `seedPlatformAdmin` doesn't trip the last-admin trigger).
3. Set in `.env.local` (or shell): `TEST_ADMIN_EMAIL=…` and `TEST_ADMIN_PASSWORD=…` matching an account that's in `platform_admins`.

For all other e2e tests (anon, non-admin) no additional setup is required.

## Next Phase Readiness

- **Wave 3 (08-04 admin UI):** `getAdminContext` + `requireAdmin` are ready. Admin layout can be:
  ```tsx
  // app/admin/layout.tsx
  import { requireAdmin } from '@/lib/auth/admin-context'
  export default async function AdminLayout({ children }) {
    await requireAdmin()
    return <div data-theme="admin-dark">{children}</div>
  }
  ```
  Server actions in `/admin/*` should also start with `await requireAdmin()` (R-05 mitigation).
- **Wave 3 (08-07 auth dark pass):** `[data-theme="dark-auth"]` selector is live in `globals.css`. Auth layout can wrap with `<div data-theme="dark-auth" style={{ '--platform-primary': hexToHslTriplet(primaryColor) }}>` to get the dark theme + branded accent.
- **Wave 3 (08-06 admins page):** `seedPlatformAdmin` from `tests/setup/seed-admin.ts` is the standard pattern for e2e test setup that needs admin context.
- **R-06 mitigated:** loop guard on `pathname === '/404'` in proxy.

## Self-Check: PASSED

- `lib/supabase/admin-gate.ts` — FOUND (commit `77484de`)
- `lib/auth/admin-context.ts` — FOUND (commit `77484de`)
- `tests/setup/seed-admin.ts` — FOUND (commit `77484de`)
- `tests/unit/admin-gate.test.ts` — FOUND (commit `9ac8bde`); 7/7 tests pass
- `tests/e2e/admin-gate.spec.ts` — FOUND (commit `0e300dc`); anon 404 case verified passing locally
- `proxy.ts` — MODIFIED (commit `0e300dc`); contains `checkPlatformAdmin`, `NextResponse.rewrite`, `'/404'` × 2, `pathname.startsWith('/admin')`, `updateSession` × 3
- `app/globals.css` — MODIFIED (commit `77484de`); contains `data-theme="admin-dark"`, `data-theme="dark-auth"`, `240 6% 6%`, `var(--platform-primary` × 2
- Commit `9ac8bde` — FOUND in `git log --oneline` (Task 1 RED)
- Commit `77484de` — FOUND in `git log --oneline` (Task 1 GREEN)
- Commit `0e300dc` — FOUND in `git log --oneline` (Task 2)
- Acceptance grep counts: all met (verified via shell grep before each commit)

---
*Phase: 08-platform-admin-panel-for-centralized-api-integrations*
*Completed: 2026-04-21*
