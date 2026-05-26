---
phase: 81-company-switcher-ui-add-company-flow
plan: 01
subsystem: database
tags: [query, multi-tenancy, supabase, rls, tdd, vitest]

requires:
  - phase: 79-multi-company-support
    provides: company_members table + RLS + getAuthClaims + lib/queries/active-company.ts module
provides:
  - getMembershipCompanies() exported from lib/queries/active-company.ts
  - 4 new unit tests covering single/multiple/unauthenticated/zero-membership cases
affects: [81-02-switchActiveCompany-action, 81-03-CompanySelector-rewrite, 81-04-layout-integration]

tech-stack:
  added: []
  patterns:
    - "Membership listing via foreign-table ASC ordering (.order('created_at', { foreignTable: 'companies', ascending: true }))"
    - "RLS-bound request-scoped client for user-scoped reads (never service-role bypass when auth.uid() suffices)"
    - "Public shape narrowing in .map() — drop internal columns (created_at) from return type"

key-files:
  created: []
  modified:
    - lib/queries/active-company.ts
    - tests/unit/active-company-helpers.test.ts

key-decisions:
  - "Co-located getMembershipCompanies with Phase 79 helpers in lib/queries/active-company.ts (per SWITCH-02) — not a new file"
  - "ASC ordering by companies.created_at (stable dropdown insertion order) — differs from Phase 79's DESC fallback (which wants most-recent for first-time landing)"
  - "Request-scoped createClient() (RLS-bound) — never requireServiceClient: Phase 79 RLS on company_members already gates by user_id = auth.uid()"
  - "Public shape narrowed to { id, name, logo_url } — created_at stays internal so consumers can't accidentally couple to ordering metadata"
  - "Casted data via unknown as MembershipRow[] — supabase-js types !inner joins as arrays even when 1:1; documented pitfall per 81-RESEARCH.md Pattern 1"

patterns-established:
  - "Foreign-table ordering syntax: .order(column, { foreignTable, ascending }) — column FIRST, foreign table in options (81-RESEARCH.md Pitfall 1)"
  - "Zero-trust auth check: getAuthClaims() and early return [] before touching supabase — saves a round-trip for unauthenticated callers"

requirements-completed: [SWITCH-04, SWITCH-02]

duration: 3min
completed: 2026-05-26
---

# Phase 81 Plan 01: getMembershipCompanies Query Helper Summary

**getMembershipCompanies() helper added to lib/queries/active-company.ts — returns every company the signed-in user owns, ordered ASC by created_at, public shape { id, name, logo_url }[] only, RLS-bound (never service role).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-26T03:33:36Z
- **Completed:** 2026-05-26T03:36:24Z
- **Tasks:** 3 (test RED → impl GREEN → SUMMARY)
- **Files modified:** 2

## Accomplishments

- New exported async function `getMembershipCompanies(): Promise<Array<{ id: string; name: string; logo_url: string | null }>>` co-located with Phase 79's `getActiveCompanyId` / `getActiveCompany` / `ACTIVE_COMPANY_COOKIE`.
- 4 new unit tests under `describe('getMembershipCompanies', ...)` covering: multiple memberships sorted ASC, single membership, unauthenticated (no supabase call), authenticated-but-zero-memberships.
- Phase 79's existing 8 tests still pass — 12/12 green overall.
- `npx tsc --noEmit` clean.
- Foreign-table ordering syntax verified by mock assertion: `expect(order).toHaveBeenCalledWith('created_at', { foreignTable: 'companies', ascending: true })`.

## Task Commits

1. **Task 1.1: RED tests for getMembershipCompanies** — `37e5e31` (test)
2. **Task 1.2: Implement getMembershipCompanies** — `493b4ef` (feat)
3. **Task 1.3: Plan SUMMARY** — pending in this commit (docs)

## Files Created/Modified

- `lib/queries/active-company.ts` — appended `getMembershipCompanies()` (43 LOC including docblock) at the bottom of the module; no changes to Phase 79 exports.
- `tests/unit/active-company-helpers.test.ts` — appended `describe('getMembershipCompanies', ...)` with 4 cases + a new `makeMembershipSupabase()` helper (95 LOC).

## Decisions Made

- Co-located in the existing Phase 79 module per SWITCH-02 — keeps active-company concerns in one file; Plans 02-04 import from one path.
- ASC ordering (not DESC) — switcher dropdown reads top-to-bottom in user's join order; Phase 79's DESC fallback solves a different problem ("default to newest company") and was deliberately not changed.
- Cast `data as unknown as MembershipRow[]` — supabase-js types `!inner` 1:1 joins as arrays despite the runtime shape being a single nested object. Documented inline as a known supabase-js TS quirk.
- Auto-fix: added a fourth test (M3b: authenticated but zero memberships) on top of the three the plan specified — the plan's Case C mentioned both unauthenticated AND zero/null data paths, so splitting into M3a + M3b made each case independently asserted. Within scope of the plan's Case C.

## Deviations from Plan

**1. [Rule 1 — Type Correctness] Replaced `(row: any)` with a typed cast block**
- **Found during:** Task 1.2 (tsc verification)
- **Issue:** The plan's Pattern 1 snippet uses `(row: any) => ...` which works at runtime but loses type information at the consumer boundary. With strict TS, `tsc --noEmit` also flagged the inferred array shape on the join.
- **Fix:** Declared an inline `type MembershipRow = { companies: { id, name, logo_url } }` and cast `data as unknown as MembershipRow[]` before the map. Equivalent runtime, stronger consumer types, single documented cast point.
- **Files modified:** `lib/queries/active-company.ts`
- **Verification:** `npx tsc --noEmit` exit 0; tests still 12/12 green.
- **Committed in:** `493b4ef` (Task 1.2 commit).

---

**Total deviations:** 1 auto-fixed (1 Rule-1 type correctness).
**Impact on plan:** Zero scope change. Same function signature, same behavior, stronger types at the call site for Plans 03 + 04.

## Issues Encountered

None.

## User Setup Required

None — pure TypeScript helper; no env vars, no DB changes, no external service config.

## Next Phase Readiness

- **Plan 02 (switchActiveCompany action):** Will mutate cookie + call `revalidateTag('company')`. Per 81-RESEARCH.md Open Question 3 ("No caching in v1") this function is **NOT** memoized, so no cache invalidation wiring is required for it specifically — `revalidateTag('company')` already covers `loadCompanyById`.
- **Plan 03 (CompanySelector rewrite):** Can import `getMembershipCompanies` directly from `@/lib/queries/active-company` and render the dropdown list. Public shape is exactly the 3 fields the UI needs.
- **Plan 04 (layout integration):** Can wire `getMembershipCompanies()` into the layout's `Promise.all` alongside `getActiveCompany()` for parallel fetch.

---
*Phase: 81-company-switcher-ui-add-company-flow*
*Completed: 2026-05-26*

## Self-Check: PASSED

Verified:
- FOUND: lib/queries/active-company.ts (modified — `getMembershipCompanies` export at line 156)
- FOUND: tests/unit/active-company-helpers.test.ts (modified — 4 new tests, 12/12 green)
- FOUND: commit 37e5e31 (test RED)
- FOUND: commit 493b4ef (feat impl)
- `grep getMembershipCompanies` returns exactly one export line (line 156)
- `grep requireServiceClient` confined to Phase 79's `loadCompanyById` (line 120) — no new usage
- `npx tsc --noEmit` exit 0
- `npx vitest run tests/unit/active-company-helpers.test.ts` → 12/12 passed
