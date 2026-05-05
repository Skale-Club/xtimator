# Deferred Items — Phase 17 Navigation Performance

Items discovered during execution that are out of scope for plan 17-02 and were not fixed.

## Pre-existing TypeScript errors

Discovered: 2026-05-05 during plan 17-02 verification (Task 3-1).

```
components/blog/blog-content.tsx(1,22): error TS2307: Cannot find module 'react-markdown' or its corresponding type declarations.
components/blog/blog-content.tsx(2,23): error TS2307: Cannot find module 'remark-gfm' or its corresponding type declarations.
```

**Why deferred:** Pre-existing. Belongs to blog/landing components introduced in earlier phase (15 owner-admin-panel). Plan 17-02 only touches `lib/queries/auth.ts`, `app/(app)/layout.tsx`, and four `app/(app)/*/page.tsx` files — none of which import from blog modules.

**Suggested fix:** Either run `npm install react-markdown remark-gfm` or replace the markdown rendering with an existing alternative. To be addressed in a follow-up quick task or future phase.

## Pre-existing build failures

Discovered: 2026-05-05 during plan 17-02 verification (Task 3-3 production build).

`npm run build` (next build with Turbopack) fails with three errors, all pre-existing:

1. `app/globals.css` — `Can't resolve '@tailwindcss/typography'` (Tailwind plugin not installed)
2. `components/blog/blog-content.tsx` — `Can't resolve 'react-markdown'`
3. `components/blog/blog-content.tsx` — `Can't resolve 'remark-gfm'`

**Why deferred:** All three errors live in blog/landing surfaces shipped in Phase 15 (owner-admin-panel). Plan 17-02 only modifies auth/company caching helpers and five `app/(app)/*` files — none of which touch globals.css plugins or blog markdown rendering.

**Suggested fix:** A small dependency-restoration quick task: `npm install @tailwindcss/typography react-markdown remark-gfm`. Verify the production build passes afterwards. Out of scope here; flag for the next deferred-items sweep or quick task.

## Verification of plan 17-02 work

Despite the build noise above, the cached helpers introduced by this plan are verified by:

- `npx vitest run tests/unit/queries/` — 12/12 tests passing (3 new in `auth.test.ts` + existing 9)
- `npx tsc --noEmit` filtered to plan 17-02 surfaces — no new errors
- Manual inspection: layout, dashboard, clients, projects/new, settings all import and consume `getAuthClaims` / `getCachedCompany` correctly
- `revalidateTag('company')` is wired into `updateCompanySettings` in `lib/actions/settings.ts:93`
