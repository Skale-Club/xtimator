---
phase: 81-company-switcher-ui-add-company-flow
plan: 02
subsystem: server-actions
tags: [server-action, multi-tenancy, tdd, vitest, revalidate]

requires:
  - phase: 79-multi-company-support
    provides: ACTIVE_COMPANY_COOKIE + ACTIVE_COMPANY_COOKIE_OPTIONS + company_members RLS + supabase server client
  - phase: 81-01
    provides: getMembershipCompanies() (sibling helper in lib/queries/active-company.ts)
provides:
  - switchActiveCompany(companyId) server action with discriminated-union return
  - 3 unit tests covering success / forbidden / unauthenticated branches
affects: [81-03-CompanySelector-rewrite, 81-04-layout-integration]

tech-stack:
  added: []
  patterns:
    - "Server action with discriminated-union return: { ok: true } | { error: 'unauthenticated' | 'forbidden' } — type-narrowable at the call site"
    - "Belt-and-suspenders cache invalidation: revalidateTag('company') + revalidatePath('/', 'layout') in the same action (D-06)"
    - "RLS-bound membership verification — request-scoped createClient() never requireServiceClient even for authorization checks"
    - "Generic 'forbidden' error string — never reveals whether the target company exists (information-leak prevention per SWITCH-06)"

key-files:
  created:
    - lib/actions/active-company.ts
    - tests/unit/switch-active-company.test.ts
  modified: []

key-decisions:
  - "New file lib/actions/active-company.ts (not co-located in lib/actions/company.ts) — keeps the switcher concern isolated from create/update flows"
  - "Discriminated-union return shape per SWITCH-08 — callers narrow at the type level ('forbidden' triggers toast + router.refresh, 'unauthenticated' redirects to /login)"
  - "Both revalidateTag('company') AND revalidatePath('/', 'layout') — Phase 79's loadCompanyById uses unstable_cache(tags: ['company']) so tag invalidation flushes the company row, path invalidation flushes layout-level RSC trees"
  - "Membership check uses two .eq() calls (.eq('user_id', sub).eq('company_id', companyId)) — the user_id filter is redundant under RLS but explicit, defense-in-depth"
  - "(revalidateTag as any)('company') cast — matches the project-wide workaround for the Next.js canary revalidateTag(tag, profile) signature (mirrors lib/actions/settings.ts:103, estimate-template.ts:47, custom-domain.ts:45)"

patterns-established:
  - "Server actions that flip multi-tenant state ALWAYS pair cookie write + revalidateTag + revalidatePath('/', 'layout') — never one without the others"
  - "Test mocks for next/cache must include unstable_cache pass-through when the SUT imports from lib/queries/active-company.ts (which wraps loadCompanyById in unstable_cache)"

requirements-completed: [SWITCH-06, SWITCH-08]

duration: 4min
completed: 2026-05-26
---

# Phase 81 Plan 02: switchActiveCompany Server Action Summary

**switchActiveCompany(companyId) server action shipped in lib/actions/active-company.ts — verifies membership via the RLS-bound supabase client, writes the active_company_id cookie via Phase 79's exported constants, then revalidates both the 'company' tag and the layout path. Discriminated-union return so Plan 03's UI can narrow forbidden / unauthenticated branches at the type level.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-26T03:39:00Z
- **Completed:** 2026-05-26T03:42:47Z
- **Tasks:** 3 (test RED → impl GREEN → SUMMARY)
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- New exported async function `switchActiveCompany(companyId: string): Promise<{ ok: true } | { error: 'unauthenticated' | 'forbidden' }>` in `lib/actions/active-company.ts`.
- Six-step SWITCH-06 sequence implemented exactly as locked in 81-RESEARCH.md Pattern 2: getClaims → unauthenticated guard → membership check → forbidden guard → cookie write → revalidateTag('company') → revalidatePath('/', 'layout') → return { ok: true }.
- 3 RED→GREEN unit tests under `tests/unit/switch-active-company.test.ts` mirroring the mock-setup pattern from `tests/unit/active-company-helpers.test.ts`.
- All plan-checker BLOCK gates pass: no hardcoded `'active_company_id'`, no `requireServiceClient`, both revalidate calls present.

## Tests

```
npx vitest run tests/unit/switch-active-company.test.ts
✓ Case A — success: sets cookie + revalidates tag/path, returns { ok: true }
✓ Case B — forbidden: no membership row → { error: 'forbidden' }, no side effects
✓ Case C — unauthenticated: no claims → { error: 'unauthenticated' }, no DB call

Test Files  1 passed (1)
     Tests  3 passed (3)
```

`npx tsc --noEmit` — clean.

## Requirements Satisfied

- **SWITCH-06** — switchActiveCompany server action with the six-step sequence (getClaims → membership check → cookie write → revalidateTag('company') → revalidatePath('/', 'layout') → return).
- **SWITCH-08** — discriminated-union return shape `{ ok: true } | { error: 'unauthenticated' | 'forbidden' }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] next/cache mock missing `unstable_cache` export**
- **Found during:** Task 2.2 (vitest run after implementation)
- **Issue:** Tests imported the new action which imports `ACTIVE_COMPANY_COOKIE` from `lib/queries/active-company.ts`. That module wraps `loadCompanyById` in `unstable_cache(...)` at module scope. The initial `vi.mock('next/cache', ...)` stub only exported `revalidatePath` + `revalidateTag`, so importing the cookie constants triggered a real `unstable_cache` invocation at the wrong layer (no request context) — vitest crashed before any test ran.
- **Fix:** Added `unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn` pass-through to the mock — mirrors the exact pattern already in use in `tests/unit/active-company-helpers.test.ts`.
- **Files modified:** `tests/unit/switch-active-company.test.ts`
- **Commit:** folded into the GREEN commit fa4310c (test fix was a prerequisite to GREEN).

**2. [Rule 1 — Bug] revalidateTag tsc error in Next.js canary signature**
- **Found during:** Task 2.2 (npx tsc --noEmit after first GREEN run)
- **Issue:** This Next.js version types `revalidateTag(tag: string, profile: string | CacheLifeConfig)` — two required args. Direct call `revalidateTag('company')` failed tsc with TS2554.
- **Fix:** Used the project-wide workaround `;(revalidateTag as any)('company')` matching `lib/actions/settings.ts:103`, `lib/actions/estimate-template.ts:47`, `lib/actions/custom-domain.ts:45`. Runtime behavior unchanged — the second arg has a runtime default.
- **Files modified:** `lib/actions/active-company.ts`
- **Commit:** folded into fa4310c.

## Follow-ups for Plan 03

- CompanySelector imports the action: `import { switchActiveCompany } from '@/lib/actions/active-company'`.
- Wrap the call in `useTransition()` for pending UI; on `error: 'forbidden'` → `toast.error('You no longer have access to that company.')` + `router.refresh()` per SWITCH-08; on `error: 'unauthenticated'` → `router.push('/login')`.

## Commits

- 2af554d — `test(81-02): RED tests for switchActiveCompany action`
- fa4310c — `feat(81-02): switchActiveCompany server action`
- (this commit) — `docs(81-02): summarize switchActiveCompany plan`

## Self-Check: PASSED

- `lib/actions/active-company.ts` — FOUND
- `tests/unit/switch-active-company.test.ts` — FOUND
- `.planning/phases/81-company-switcher-ui-add-company-flow/81-02-SUMMARY.md` — FOUND (this file)
- Commit 2af554d — FOUND
- Commit fa4310c — FOUND
- 3/3 tests green; tsc clean; all plan-checker gates pass
