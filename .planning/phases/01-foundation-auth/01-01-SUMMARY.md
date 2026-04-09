---
phase: 01-foundation-auth
plan: 01
subsystem: infra
tags: [nextjs, typescript, tailwind, shadcn, supabase, vitest, playwright, next-themes]

# Dependency graph
requires: []
provides:
  - Next.js 16 App Router project scaffold with Bun package manager
  - TypeScript strict mode configured
  - Tailwind CSS 4 via PostCSS
  - 29 shadcn/ui components (New York style) in components/ui/
  - types/env.d.ts with typed env vars (SEC-03 compliant)
  - app/layout.tsx with Inter font, ThemeProvider, Toaster
  - app/page.tsx redirect to /auth/login (D-04)
  - vitest + playwright test infrastructure (Wave 0)
  - 5 test files scaffolded
affects:
  - 01-02 (Supabase wiring — depends on project scaffold and env types)
  - 01-03 (migrations — depends on scaffold)
  - 01-04 (auth UI — depends on shadcn components and test stubs)
  - all subsequent phases

# Tech tracking
tech-stack:
  added:
    - next@16.2.3
    - react@19.2.4
    - @supabase/supabase-js@2.103.0
    - "@supabase/ssr@0.10.2"
    - react-hook-form@7.72.1
    - zod@4.3.6
    - next-themes@0.4.6
    - sonner@2.0.7
    - lucide-react@1.8.0
    - class-variance-authority@0.7.1
    - radix-ui@1.4.3
    - clsx@2.1.1
    - tailwind-merge@3.5.0
    - vitest@4.1.4
    - "@playwright/test@1.59.1"
    - "@vitejs/plugin-react@6.0.1"
    - jsdom@29.0.2
  patterns:
    - shadcn/ui New York style with CSS variables (neutral palette)
    - Inter font via next/font/google with --font-inter CSS variable
    - ThemeProvider wraps all children in root layout
    - Toaster (sonner) at root layout level for global notifications
    - Unit tests in tests/unit/, E2E tests in tests/e2e/ (vitest excludes e2e dir)

key-files:
  created:
    - app/layout.tsx
    - app/page.tsx
    - app/globals.css
    - types/env.d.ts
    - lib/utils.ts
    - components/ui/ (29 shadcn components)
    - vercel.json
    - vitest.config.ts
    - playwright.config.ts
    - tests/unit/env.test.ts
    - tests/unit/supabase.test.ts
    - tests/unit/middleware.test.ts
    - tests/e2e/auth.spec.ts
  modified:
    - package.json (scripts, dependencies)
    - .env.example (simplified to 3 core Supabase vars)
    - bun.lock

key-decisions:
  - "Used shadcn New York style (locked per D-09) with neutral base color and CSS variables"
  - "Excluded tests/e2e from vitest include pattern to prevent Playwright imports failing in jsdom"
  - "Kept Geist font removed; replaced with Inter per UI-SPEC.md requirement"
  - "SUPABASE_SERVICE_ROLE_KEY declared without NEXT_PUBLIC_ prefix — server-side only (SEC-03)"

patterns-established:
  - "All shadcn components use @/lib/utils cn() helper for class merging"
  - "ThemeProvider attribute='class' for Tailwind dark mode compatibility"
  - "vitest.config.ts include pattern: tests/unit/**/*.test.ts (explicitly excludes e2e)"

requirements-completed:
  - SEC-03

# Metrics
duration: 14min
completed: 2026-04-09
---

# Phase 1 Plan 01: Project Scaffold Summary

**Next.js 16 with TypeScript strict, Tailwind 4, 29 shadcn/ui (New York style) components, Supabase SSR deps, typed env vars (SEC-03), and vitest + Playwright test infrastructure wired and green**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-09T22:13:53Z
- **Completed:** 2026-04-09T22:27:39Z
- **Tasks:** 2
- **Files modified:** 52

## Accomplishments

- Next.js 16.2.3 project scaffolded with Bun, TypeScript strict, Tailwind 4 via PostCSS
- All 29 shadcn/ui components (New York style, neutral base) installed and importable
- types/env.d.ts declares all 3 env vars; SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix (SEC-03)
- app/layout.tsx configured with Inter font (--font-inter), ThemeProvider, and Toaster (sonner)
- app/page.tsx redirects to /auth/login by default (D-04)
- Test infrastructure live: vitest (jsdom) + Playwright configured, 5 test files scaffolded, `bun run test` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js project** - `932bb5d` (feat)
2. **Task 2: Scaffold test infrastructure** - `9db2748` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `app/layout.tsx` - Root layout with Inter font, ThemeProvider, Toaster
- `app/page.tsx` - Root redirect to /auth/login (D-04)
- `app/globals.css` - shadcn/ui CSS variables (neutral palette, New York style), Inter font body rule
- `types/env.d.ts` - TypeScript env var declarations (SEC-03 compliant)
- `lib/utils.ts` - cn() helper using clsx + tailwind-merge
- `components/ui/` - 29 shadcn/ui components (New York style)
- `components.json` - shadcn config (style: new-york, baseColor: neutral, cssVariables: true)
- `vercel.json` - Vercel deployment config with Bun commands
- `vitest.config.ts` - Unit test config (jsdom env, includes only tests/unit/**)
- `playwright.config.ts` - E2E config (baseURL: localhost:3000, chromium)
- `tests/unit/env.test.ts` - 3 passing env var declaration tests
- `tests/unit/supabase.test.ts` - Stub todos for Plan 02
- `tests/unit/middleware.test.ts` - Stub todos for Plan 02
- `tests/e2e/auth.spec.ts` - 7 describe stubs (AUTH-01 through AUTH-07)
- `package.json` - All dependencies + test scripts

## Decisions Made

- Used `shadcn new-york` style with `neutral` base color (D-09 locked — New York style required)
- vitest `include` pattern explicitly set to `tests/unit/**/*.test.ts` to prevent Playwright imports bleeding into vitest's jsdom runner
- `SUPABASE_SERVICE_ROLE_KEY` declared without `NEXT_PUBLIC_` prefix per SEC-03 requirement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing jsdom dependency**
- **Found during:** Task 2 (test infrastructure)
- **Issue:** vitest with `environment: 'jsdom'` requires the `jsdom` package separately — not bundled with vitest
- **Fix:** Ran `bun add -d jsdom @types/jsdom`
- **Files modified:** package.json, bun.lock
- **Verification:** `bun run test` exits 0 with 3 passing tests
- **Committed in:** 9db2748 (Task 2 commit)

**2. [Rule 3 - Blocking] Excluded e2e tests from vitest include pattern**
- **Found during:** Task 2 (test infrastructure)
- **Issue:** Playwright `@playwright/test` imports fail in vitest's jsdom environment; auth.spec.ts was being picked up by vitest
- **Fix:** Added `include: ['tests/unit/**/*.test.ts']` and `exclude: ['tests/e2e/**']` to vitest.config.ts
- **Files modified:** vitest.config.ts
- **Verification:** `bun run test` exits 0, e2e spec not executed by vitest
- **Committed in:** 9db2748 (Task 2 commit)

**3. [Rule 3 - Blocking] Scaffolded project via temp dir due to create-next-app conflict detection**
- **Found during:** Task 1 (project scaffold)
- **Issue:** `create-next-app` refuses to run in directories with existing files (.env.local, .planning/, CLAUDE.md)
- **Fix:** Created scaffold in /tmp/nextjs-scaffold, then copied all generated files to project root (excluding .git and conflicting files)
- **Files modified:** All scaffold files
- **Verification:** `bun run build` exits 0
- **Committed in:** 932bb5d (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues)
**Impact on plan:** All auto-fixes essential for project setup. No scope creep. .env.local was preserved (not overwritten).

## Issues Encountered

- `create-next-app` conflict check blocked initialization in existing project directory — resolved by scaffolding in temp dir then merging files
- `jsdom` not bundled with vitest despite being a well-known test environment — required explicit installation

## User Setup Required

None - project uses existing `.env.local` (already configured with Supabase credentials per PROJECT.md).

## Next Phase Readiness

- Project scaffold complete, all dependencies installed, `bun run build` and `bun run test` both green
- Plan 02 (Supabase wiring) can begin: env types declared, `@supabase/supabase-js` and `@supabase/ssr` installed
- shadcn/ui components available for auth UI in Plan 04

---
*Phase: 01-foundation-auth*
*Completed: 2026-04-09*
