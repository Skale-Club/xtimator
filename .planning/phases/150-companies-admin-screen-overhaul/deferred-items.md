# Deferred Items — Phase 150 Plan 01

Pre-existing, out-of-scope failures observed during `npm test` full-suite verification (Task 3). Not caused by this plan's changes (`app/admin/companies/page.tsx`, `app/admin/companies/companies-controls.tsx`, `tests/unit/admin/companies-*.test.ts`) — none of the files below were touched by this plan.

## 1. `tests/integration/blog-rls.test.ts` (2 failures)

- `blog_posts RLS — public visibility (BLOG-02) > getBlogPost returns null for a draft post slug via anon client`
- `blog_posts RLS — public visibility (BLOG-02) > getBlogPost returns post object for a published post slug via anon client`
- Requires a live Supabase connection (integration test); fails in this environment without a reachable DB / valid env credentials. Last touched by an unrelated prior commit (`5dcbe578`).

## 2. `tests/unit/components/landing-page.test.tsx` (1 failure)

- `LandingPage modal auto-open > opens the AuthDialog in login mode when ?auth=login and strips the param via router.replace`
- Async `findByRole` timing flake unrelated to companies admin work; portal-mounted `AuthDialog` heading not found within the default wait window in this run. Last touched by an unrelated prior commit (`5dcbe578`).

Neither failure touches `app/admin/companies/*` or `tests/unit/admin/companies-*`. All 5 Wave-0 companies contract tests (22 assertions) plus the Phase-93 Event Log regression check (7 assertions) are green. `tsc --noEmit` shows zero new errors attributable to this plan's files.
