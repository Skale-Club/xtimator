---
phase: 160-url-contract-public-access-security
plan: 01
subsystem: database
tags: [supabase, postgres, migration, url-builder, crypto, vitest]

# Dependency graph
requires: []
provides:
  - "companies.slug + estimates.public_slug_token dormant columns, each with own partial unique index"
  - "lib/estimate/public-url.ts: generatePublicSlugToken, slugify, buildEstimatePublicPath, parsePublicSlugParam"
  - "Estimate TS interface extended with public_slug_token: string | null"
  - "Permanent static regression test locking the migration to zero anon grants/policies"
affects: [160-02, 160-03, 160-04, 160-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dormant-first additive migration (ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS), mirroring phase129/phase135"
    - "Static SQL-file regression test (readFileSync + regex assertions, no live DB) mirroring company-members-migration.test.ts"
    - "Fixed-length token generation + fixed-length suffix parsing (never split-on-last-hyphen, since base64url includes '-')"

key-files:
  created:
    - supabase/migrations/20260708000001_phase160_public_url_contract.sql
    - tests/unit/phase160-public-url-contract-migration.test.ts
    - lib/estimate/public-url.ts
    - tests/unit/estimates/public-url.test.ts
  modified:
    - lib/queries/estimate.ts

key-decisions:
  - "Token: randomBytes(9).toString('base64url') = exactly 12 chars, ~71-bit entropy, no padding (9 is a multiple of 3)"
  - "buildEstimatePublicPath signature takes (company, estimate) as separate params — not a merged object — to keep the two independent partial-unique-index-backed identifiers explicit at every call site"
  - "parsePublicSlugParam uses fixed-length suffix slice, not split-on-last-hyphen, since base64url's alphabet includes '-' making that ambiguous"

patterns-established:
  - "lib/estimate/public-url.ts is now the SOLE builder of estimate public paths (PUBURL-04) — every other Phase 160 plan and any future call-site migration imports from here, never re-implements"

requirements-completed: [PUBURL-01, PUBURL-03, PUBURL-04]

# Metrics
duration: 12min
completed: 2026-07-08
---

# Phase 160 Plan 01: URL Contract Schema Foundation Summary

**Dormant-first `companies.slug` + `estimates.public_slug_token` migration (each with its own partial unique index, zero anon grants) plus `lib/estimate/public-url.ts` — a 12-char/~71-bit token generator, isomorphic friendly-path builder with legacy fallback, and its exact-inverse parser.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-08T14:00:00Z (approx, worktree fast-forwarded from main first)
- **Completed:** 2026-07-08T14:12:00Z
- **Tasks:** 2 completed
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- Authored `supabase/migrations/20260708000001_phase160_public_url_contract.sql`: two new nullable columns (`companies.slug`, `estimates.public_slug_token`), each with its own `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE ... IS NOT NULL` partial index, fully idempotent, zero anon grants/policies of any kind.
- Locked that invariant permanently with a static SQL-file regression test (`tests/unit/phase160-public-url-contract-migration.test.ts`, 7/7 assertions green) — the file can never be edited to add an `anon` policy/grant without failing CI.
- Extended the `Estimate` TS interface (`lib/queries/estimate.ts`) with `public_slug_token: string | null`, placed immediately after `share_token` per the plan's exact insertion point.
- Built `lib/estimate/public-url.ts` — the one new module every downstream Phase 160 plan (02-05) imports from: `generatePublicSlugToken()` (12-char base64url, ~71-bit entropy), `slugify()` (dependency-free, mirrors the proven `app/admin/blog/actions.ts` one-liner), `buildEstimatePublicPath()` (friendly path when slug data exists, legacy `share_token` fallback otherwise), and `parsePublicSlugParam()` (exact inverse, fixed-length suffix slice — never split-on-last-hyphen).
- Followed full TDD RED→GREEN flow for Task 2: wrote all 10 behavior tests first (confirmed failing — module didn't exist), then implemented to green, 10/10 passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the idempotent schema migration + its permanent static contract test** - `b9bb34ab` (feat)
2. **Task 2 (RED): failing test for public-url.ts** - `939138c6` (test)
3. **Task 2 (GREEN): implement public-url.ts** - `5b9e5b02` (feat)

**Plan metadata:** _pending_ (docs: complete plan — added after this summary)

_Note: Task 2 used TDD (test → feat); no refactor commit needed, implementation matched the plan spec exactly on first pass._

## Files Created/Modified
- `supabase/migrations/20260708000001_phase160_public_url_contract.sql` - Dormant-first DDL adding `companies.slug` + `estimates.public_slug_token`, each with own partial unique index, zero anon grants/policies
- `tests/unit/phase160-public-url-contract-migration.test.ts` - Permanent static regression guard (7 assertions) against the migration file drifting toward an anon-accessible policy
- `lib/estimate/public-url.ts` - Token generator, slugify, friendly-path builder, and inverse parser — the sole module every other Phase 160 plan imports from
- `tests/unit/estimates/public-url.test.ts` - 10/10 unit tests covering all documented behaviors
- `lib/queries/estimate.ts` - Added `public_slug_token: string | null` to the `Estimate` interface

## Decisions Made
- Token generation uses `randomBytes(9).toString('base64url')`, which is always exactly 12 characters with no padding (9 is a multiple of 3) — chosen over the `share_token`'s UUID/hex idiom because it's shorter (better for a friendly URL) while still comfortably exceeding the ≥60-bit entropy floor (~71 bits).
- `buildEstimatePublicPath(company, estimate)` takes two explicit params rather than a single merged row, keeping the "two independent secrets, two independent unique indexes" invariant visible at the call site (a merged object could tempt a future caller into conflating them).
- No collision-retry logic was added to the token generator itself in this plan — the unique index is authored as the DB-level guarantee; the backfill script (Plan 05) and `generate-estimate.ts` (Plan 05) are the call sites that will need to handle the astronomically rare collision (documented as their concern, not this plan's).

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep checks, test counts, exact regex matches) passed on the first implementation attempt with zero fix cycles.

## Issues Encountered

**Worktree was stale relative to `main`.** This plan's worktree branch (`worktree-agent-a4bd6028437654c31`) was created before the phase-160 planning docs (`160-01-PLAN.md` through `160-05-PLAN.md`, `160-CONTEXT.md`, `160-RESEARCH.md`, `160-VALIDATION.md`, and updated `REQUIREMENTS.md`/`ROADMAP.md`/`STATE.md`) were committed to `main`. Since the worktree branch tip (`7c8d1eb0`) was a strict git ancestor of `main`'s tip (`5e63b84b`) with zero divergent commits, a `git merge --ff-only main` safely brought all planning docs into the worktree with no conflicts before execution began. This is an environment/setup artifact, not a plan deviation — no plan content was altered.

## User Setup Required

None - no external service configuration required. The migration is authored-only and will be applied via the existing CI→GHCR→Coolify pipeline; it was explicitly NOT applied to any remote database from this environment, per the plan's scope fence.

## Next Phase Readiness

- Plan 02 (`lib/queries/share.ts` additions, `getEstimateByPublicToken()`) can now import `PublicUrlEstimate`/`PublicUrlCompany` types and reuse the same service-role + exact-match posture documented in the migration's comments.
- Plan 03 (new route `app/estimate/[companySlug]/[estimateSlug]/page.tsx`) can now import `parsePublicSlugParam()` directly.
- Plan 04 (call-site migration) and Plan 05 (wiring into `generate-estimate.ts` + backfill script) can now import `generatePublicSlugToken()` and `buildEstimatePublicPath()` as the sole implementations.
- No blockers. The migration file itself still needs to travel through CI→GHCR→Coolify before `public_slug_token`/`slug` actually exist on any real database — Plans 02-05 build against the dormant, not-yet-applied schema, consistent with every other dormant-first migration in this codebase.

---
*Phase: 160-url-contract-public-access-security*
*Completed: 2026-07-08*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commits (`b9bb34ab`, `939138c6`, `5b9e5b02`) verified present in git log. No missing items.
