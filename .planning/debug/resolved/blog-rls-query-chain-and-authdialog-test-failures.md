---
status: resolved
trigger: "Investigate issue: blog-rls-query-chain-and-authdialog-test-failures"
created: 2026-07-05T00:00:00Z
updated: 2026-07-05T00:20:00Z
---

## Current Focus

hypothesis: Two SEPARATE root causes, not shared, plus one masking issue discovered during reproduction.
(1) tests/integration/blog-rls.test.ts: the hand-rolled `makeAnonClient()` mock's `eq` fn always returns `{ order, maybeSingle }` regardless of call count — it does not include `eq` itself in the returned object, so a second chained `.eq()` call (as used in `getBlogPost` at blog.ts:42) fails with "eq is not a function". Real Supabase query builder supports arbitrary `.eq().eq()...` chaining; the mock does not. CONFIRMED.
(2) tests/unit/components/landing-page.test.tsx: commit 950a9226 ("perf(1001-04): preserve static landing HTML") rewrote landing-page.tsx to read `window.location.search` / call `window.history.replaceState` directly instead of `useSearchParams()` / `router.replace()` (to allow static rendering, per tests/unit/seo/home-cacheability.test.ts which pins this exact string-level contract). The test file was never updated in that commit — it still mocks `next/navigation` and sets `currentSearchParams`, which the component no longer consults. CONFIRMED via git show 950a9226 diff.
(3) DISCOVERED DURING REPRODUCTION (not in original symptom report): rendering full `LandingPage` in this test also renders `TopNav` -> `TopNavAuth`, which calls `createClient()` from `@/lib/supabase/client` in a `useEffect` on mount. In this worktree there is no `.env.local`, so `NEXT_PUBLIC_SUPABASE_URL` is undefined and `createBrowserClient` throws synchronously inside the passive-effect commit, which vitest reports as the actual test failure (NOT a `findByRole` timeout as the symptom report guessed — that's environment-dependent; with valid env vars it'd likely be the timeout instead, but a deterministic fix must not depend on env vars being present). Established codebase pattern (tests/unit/notifications/notification-bell.test.tsx) mocks `@/lib/supabase/client` for any component test that renders something depending on it.
test: read both source files completely + git log/show to confirm which came first + checked existing mock pattern in notification-bell.test.tsx + confirmed tests/unit/seo/home-cacheability.test.ts pins the intentional window.location-based contract
expecting: confirms two independent pre-existing/regression bugs plus one environment-dependent masking issue; all three need fixing for the test file to pass deterministically regardless of .env.local presence
next_action: all 3 fixes applied and verified. Awaiting human confirmation that this matches the reported symptoms and is acceptable before archiving.

## Symptoms

expected: `npx vitest run tests/integration/blog-rls.test.ts` passes; the chained Supabase query `.eq('slug', slug).eq('status', 'published')` in lib/queries/blog.ts:42 resolves normally. Also tests/unit/components/landing-page.test.tsx passes, with AuthDialog auto-opening and its "Sign in" heading becoming visible.
actual: tests/integration/blog-rls.test.ts fails with `TypeError: supabase.from(...).select(...).eq(...).eq is not a function` at lib/queries/blog.ts:42. tests/unit/components/landing-page.test.tsx fails on `findByRole('heading', {name: /sign in/})` timeout.
errors: |
  1. TypeError: supabase.from(...).select(...).eq(...).eq is not a function (lib/queries/blog.ts:42)
  2. Testing Library timeout: unable to find role="heading" name=/sign in to/i in landing-page.test.tsx
reproduction: |
  - npx vitest run tests/integration/blog-rls.test.ts (isolated, deterministic)
  - npx vitest run tests/unit/components/landing-page.test.tsx (isolated, deterministic)
started: Blog RLS mock bug looks pre-existing (mock never supported 2x eq chaining, and getBlogPost has always called .eq().eq()). AuthDialog test is a regression introduced by commit 950a9226 (2026-07-05) which changed landing-page.tsx to stop using useSearchParams()/router.replace(), without updating the test.

## Eliminated

- hypothesis: The two failures share a root cause (e.g. same broken Supabase/auth mock or shared test setup file)
  evidence: blog.ts uses @/lib/supabase/server client mock defined inline in blog-rls.test.ts; landing-page.test.tsx mocks next/navigation and never touches Supabase. No shared mock/setup file. Confirmed unrelated.
  timestamp: 2026-07-05T00:08:00Z

## Evidence

- timestamp: 2026-07-05T00:03:00Z
  checked: lib/queries/blog.ts lines 36-45 (getBlogPost)
  found: Calls `.from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle()` — two chained .eq() calls.
  implication: Confirms the code under test genuinely double-chains .eq(), matching the real Supabase JS client's fluent builder API (each filter method returns `this`-like chainable builder supporting arbitrary additional filters).

- timestamp: 2026-07-05T00:04:00Z
  checked: tests/integration/blog-rls.test.ts lines 27-42 (makeAnonClient)
  found: |
    const eq = vi.fn().mockReturnValue({ order, maybeSingle: maybySingle })
    const select = vi.fn().mockReturnValue({ eq })
  implication: The object returned by calling `eq(...)` only has `order` and `maybeSingle` keys — no `eq` key. So `.eq('slug', slug).eq('status', 'published')` works for the first call but the returned object lacks `.eq`, causing "eq is not a function" on the second call. Root cause 1 confirmed.

- timestamp: 2026-07-05T00:06:00Z
  checked: components/landing/landing-page.tsx lines 32-44 (useEffect for auth param) and tests/unit/components/landing-page.test.tsx lines 14-30 + 116-123
  found: |
    Component: `const searchParams = new URLSearchParams(window.location.search)` ... `window.history.replaceState(...)`.
    Test: mocks `next/navigation`'s `useSearchParams`/`useRouter`, sets `currentSearchParams = new URLSearchParams('auth=login')`, expects `routerReplace` to have been called with `('/', { scroll: false })`.
  implication: Component no longer reads from the mocked `useSearchParams()` — it reads real `window.location.search`, which is empty in jsdom by default. So `authParam` is never set, AuthDialog never opens, heading query times out. Test also asserts `routerReplace` was called, which can never happen since component now uses `window.history.replaceState` directly. Root cause 2 confirmed.

- timestamp: 2026-07-05T00:07:00Z
  checked: git log -p -- components/landing/landing-page.tsx (last 3 commits)
  found: Commit 950a9226 "perf(1001-04): preserve static landing HTML" removed `useRouter`/`useSearchParams` imports and usage, replacing with `window.location.search` / `window.history.replaceState`, specifically to allow the page to render statically (avoiding Next.js's dynamic-rendering requirement triggered by `useSearchParams`). Test file tests/unit/components/landing-page.test.tsx was not touched in that commit or since.
  implication: This is a genuine regression from an uncoordinated refactor — intentional prod behavior change, test left stale. Confirms fix direction: update the test to match new (intentional) window.location-based approach, not revert the component (reverting would break static rendering / commit 950a9226's purpose, and would fail tests/unit/seo/home-cacheability.test.ts).

- timestamp: 2026-07-05T00:11:00Z
  checked: Ran `npx vitest run tests/unit/components/landing-page.test.tsx --reporter=verbose` to see actual failure reason
  found: |
    Both "LandingPage modal auto-open" tests fail with:
    `Error: @supabase/ssr: Your project's URL and API key are required to create a Supabase client!`
    thrown from components/landing/top-nav-auth.tsx:35 (`createClient()` inside useEffect), NOT a findByRole timeout.
    Confirmed no .env.local exists in this worktree (`ls .env.local` -> No such file or directory), so NEXT_PUBLIC_SUPABASE_URL is undefined.
    tests/setup/load-env.ts loads .env.local if present but there is none here.
  implication: LandingPage renders TopNav -> TopNavAuth, which calls @/lib/supabase/client's createClient() on mount regardless of whether the test cares about nav auth state. This crashes rendering in any environment lacking Supabase env vars. This is a 3rd, separate issue (test brittleness / missing mock) that must be fixed for the test to pass deterministically. Checked tests/unit/notifications/notification-bell.test.tsx — established codebase pattern is `vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({...fake client...}) }))`. Will apply the same pattern.

## Resolution

root_cause: |
  (1) tests/integration/blog-rls.test.ts: The hand-rolled Supabase mock's `eq()` returns a plain object `{ order, maybeSingle }` that does not itself expose `.eq`, so chaining `.eq().eq()` (as lib/queries/blog.ts:42 does, matching real Supabase client behavior) throws "eq is not a function" on the second call. Test mock does not model the real chainable builder's ability to apply multiple filters.
  (2) tests/unit/components/landing-page.test.tsx: Commit 950a9226 changed components/landing/landing-page.tsx to read `window.location.search` and call `window.history.replaceState` directly (to keep the page statically rendered), instead of using `useSearchParams()`/`router.replace()` from next/navigation. The test still mocks next/navigation and drives `currentSearchParams`/`routerReplace`, which the component no longer consults, so the AuthDialog never auto-opens in the test and the router.replace assertion can never pass.
  (3) Same test file also crashes for an unrelated 3rd reason discovered during reproduction: rendering full LandingPage renders TopNav -> TopNavAuth, which calls the real @/lib/supabase/client createClient() on mount; without .env.local / NEXT_PUBLIC_SUPABASE_URL set (as in this worktree), @supabase/ssr throws synchronously in the passive-effect commit, aborting the test before the findByRole assertion is even relevant. This masks whether fix (2) alone would suffice on a machine with a valid .env.local.
fix: |
  (1) Rewrote makeAnonClient() in tests/integration/blog-rls.test.ts so `eq` returns a chainable object that includes itself (`eq`) alongside `order`/`maybeSingle`, allowing unlimited `.eq().eq()...` chaining like the real Supabase builder.
  (2) Rewrote the "LandingPage modal auto-open" describe block in tests/unit/components/landing-page.test.tsx to drive `window.location.search` / spy on `window.history.replaceState` instead of the next/navigation mocks, matching the component's actual (intentional, static-rendering-preserving) implementation.
  (3) Added `vi.mock('@/lib/supabase/client', ...)` to tests/unit/components/landing-page.test.tsx returning a fake client with a no-op auth.getUser()/onAuthStateChange(), following the established pattern in tests/unit/notifications/notification-bell.test.tsx, so TopNavAuth's mount effect never touches the real Supabase SSR client.
verification: |
  - `npx vitest run tests/integration/blog-rls.test.ts` -> 4/4 pass (was 2 failing with "eq is not a function").
  - `npx vitest run tests/unit/components/landing-page.test.tsx` -> 5/5 pass (was 2 failing).
  - Ran both together plus adjacent related suites (tests/unit/seo/home-cacheability.test.ts, tests/unit/notifications/notification-bell.test.tsx) -> 22/22 pass, confirming no conflict between the new @/lib/supabase/client mock and existing patterns.
  - Ran the FULL suite (`npx vitest run`): 398 files / 2893 tests passed, 4 pre-existing failures unrelated to this fix:
      - tests/integration/cleanup-orphan-projects.test.ts, tests/integration/platform-brand-rls.test.ts, tests/integration/price-book-rls.test.ts: fail identically on a clean `git stash` (before this fix) because this worktree has no .env.local with real Supabase creds — these are real-Supabase integration tests, out of scope for this debug session.
      - tests/unit/company-action.test.ts: one test timed out only under full-suite resource contention; re-ran in isolation -> 11/11 pass. Flake, unrelated to blog/auth-dialog code paths.
  - Confirmed via `git stash` / `git stash pop` that all 4 of these failures pre-exist independent of this fix.
files_changed:
  - tests/integration/blog-rls.test.ts
  - tests/unit/components/landing-page.test.tsx
