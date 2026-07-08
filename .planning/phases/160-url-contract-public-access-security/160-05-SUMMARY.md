---
phase: 160-url-contract-public-access-security
plan: 05
subsystem: api
tags: [estimates, url-generation, backfill, supabase, vitest]

# Dependency graph
requires:
  - phase: 160-01
    provides: "generatePublicSlugToken()/slugify() in lib/estimate/public-url.ts and the public_slug_token/slug schema columns"
provides:
  - "Every NEW estimate created via lib/services/generate-estimate.ts (the single INSERT point shared by web, WhatsApp, MCP) now receives a public_slug_token at creation time"
  - "scripts/backfill-public-urls.ts: idempotent, re-runnable backfill for companies.slug + estimates.public_slug_token on pre-existing rows"
affects: [160-03, 160-04, url-contract-public-access-security]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-code-path generator reuse: generatePublicSlugToken()/slugify() from lib/estimate/public-url.ts consumed identically by the live insert path and the offline backfill script — never re-implemented"
    - "Idempotent backfill pattern: WHERE ... IS NULL page-scan + retry-on-23505 collision handling on partial unique indexes, safe to re-run"

key-files:
  created:
    - scripts/backfill-public-urls.ts
  modified:
    - lib/services/generate-estimate.ts
    - tests/unit/services/generate-estimate.test.ts

key-decisions:
  - "public_slug_token is set explicitly app-side at insert time (not a Postgres column DEFAULT) — this repo has zero pgcrypto/gen_random_bytes usage, and enabling it just for this would create a second, divergent RNG implementation"
  - "The vi.mock() factory-level mockReturnValue for generatePublicSlugToken had to be re-armed inside setupDefaults() because vi.resetAllMocks() in this test file's beforeEach wipes factory-level mock implementations — same pattern already used for getAIProvider"
  - "The backfill script is created but deliberately NOT executed against any remote in this plan — an explicit post-deploy operational step, per this repo's authored-migration/CI-GHCR-Coolify convention"

patterns-established:
  - "New-row generation and offline backfill scripts share exactly one token/slug generator module — a drift-prevention pattern for any future friendly-URL-style column"

requirements-completed: [PUBURL-01]

# Metrics
duration: 19min
completed: 2026-07-08
---

# Phase 160 Plan 05: New-Estimate Token Wiring + Idempotent Backfill Script Summary

**Every newly generated estimate now gets a `public_slug_token` at insert time via `generatePublicSlugToken()`, and a ready-to-run idempotent backfill script exists for pre-existing rows — both reusing the exact same Plan 160-01 generator, closing PUBURL-01's "existing and new" requirement.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-07-08T10:20:07-04:00 (worktree fast-forward-merged to main to pick up Wave 1)
- **Completed:** 2026-07-08T10:38:48-04:00
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `lib/services/generate-estimate.ts` — the single estimates INSERT point shared by web, WhatsApp, and MCP generation entry paths — now sets `public_slug_token: generatePublicSlugToken()` on every new row, proven by a deterministic unit test
- `scripts/backfill-public-urls.ts` created: an idempotent, re-runnable one-time script backfilling `companies.slug` and `estimates.public_slug_token` for pre-existing rows, with `WHERE ... IS NULL` guards and retry-on-23505 collision handling
- Confirmed (via `tsc --noEmit`) the backfill script type-checks cleanly and is not invoked anywhere in `package.json`/CI — it stays a documented, explicit post-deploy operational step

## Task Commits

Each task was committed atomically (Task 1 followed TDD: RED then GREEN):

1. **Task 1 RED: add failing test for public_slug_token insert wiring** - `600d188d` (test)
2. **Task 1 GREEN: wire public_slug_token into new-estimate insert path** - `47e41941` (feat)
3. **Task 2: idempotent backfill script for pre-existing companies/estimates** - `a7f1e68a` (feat)

**Plan metadata:** (this commit) `docs(160-05): complete plan`

## Files Created/Modified
- `scripts/backfill-public-urls.ts` - New one-time idempotent backfill script for `companies.slug` + `estimates.public_slug_token`, reusing `generatePublicSlugToken`/`slugify` from `lib/estimate/public-url.ts`
- `lib/services/generate-estimate.ts` - Added `generatePublicSlugToken` import and `public_slug_token: generatePublicSlugToken()` field to the estimates insert payload
- `tests/unit/services/generate-estimate.test.ts` - Added `vi.mock('@/lib/estimate/public-url', ...)`, hoisted `estimatesInsertSpy` in `makeSupabaseMock`, added a new PUBURL-01 test, and re-armed the mock's return value in `setupDefaults()` (required because `vi.resetAllMocks()` in `beforeEach` clears factory-level mock implementations)

## Decisions Made
- `public_slug_token` set explicitly app-side (not a DB `DEFAULT`) — avoids introducing a second RNG mechanism (`pgcrypto`/`gen_random_bytes`) into a codebase that has none today; matches 160-RESEARCH.md's explicit "Migration approach" warning against a divergent implementation
- Test mock lifecycle fix: `vi.mocked(generatePublicSlugToken).mockReturnValue('deterministic-token-1')` moved into `setupDefaults()` (called every `beforeEach`) rather than relying solely on the `vi.mock()` factory default, since `vi.resetAllMocks()` wipes factory-level implementations — this is the same pattern the file already used for `getAIProvider`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock returned `undefined` instead of the deterministic token due to `vi.resetAllMocks()` wiping the `vi.mock()` factory implementation**
- **Found during:** Task 1 (GREEN verification — the new test failed even after wiring the source correctly)
- **Issue:** The plan's literal test interface showed `vi.mock('@/lib/estimate/public-url', () => ({ generatePublicSlugToken: vi.fn().mockReturnValue('deterministic-token-1') }))` as sufficient, but this test file's `beforeEach` calls `vi.resetAllMocks()`, which resets a mock function's implementation (including `mockReturnValue` set at factory-creation time) — so by test-run time `generatePublicSlugToken()` returned `undefined`
- **Fix:** Imported `generatePublicSlugToken` in the test file and added `vi.mocked(generatePublicSlugToken).mockReturnValue('deterministic-token-1')` inside `setupDefaults()` (called every `beforeEach`), mirroring the existing `getAIProvider` re-arm pattern already present in the same file
- **Files modified:** tests/unit/services/generate-estimate.test.ts
- **Verification:** `npx vitest run tests/unit/services/generate-estimate.test.ts` — 17/17 passed
- **Committed in:** `47e41941` (part of Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug/test-infrastructure fix)
**Impact on plan:** Necessary correctness fix for the test suite itself; no production behavior change. No scope creep — confined to the test file's mock lifecycle.

## Issues Encountered
- A transient API connection error interrupted execution mid-Task-1 (during the `setupDefaults()` edit). Recovered cleanly: `git log`/`git status` confirmed the RED commit (`600d188d`) was already committed and the in-progress GREEN edits were uncommitted-but-correct on disk; re-ran the test suite to confirm 17/17 green, then committed and continued from Task 2 with no rework needed.

## User Setup Required

None for this plan's code changes. However, per the plan's explicit scope fence, `scripts/backfill-public-urls.ts` was NOT run against any environment during this plan — it is a **pending operational step**: after migration `20260708000001_phase160_public_url_contract.sql` lands on a target environment (via the normal CI→GHCR→Coolify pipeline), an operator must run `npx tsx scripts/backfill-public-urls.ts` once against that environment to backfill `companies.slug` + `estimates.public_slug_token` on rows that predate the migration.

## Next Phase Readiness
- PUBURL-01 is now fully closed: every new estimate gets a token at creation (this plan), the schema/builder exist (160-01), the query layer exists (160-02), and a ready backfill script exists for existing rows (this plan)
- No blockers for 160-03/160-04 (parallel Wave 2 plans in this same phase) — this plan touched only `lib/services/generate-estimate.ts`, its test file, and the new standalone script, none of which overlap with 160-03/04's file lists per the plan's `depends_on`
- Operational follow-up carried forward to the phase SUMMARY: apply the Phase 160 migration to remote, then run the backfill script once

## Known Stubs

None. No placeholder/empty-value patterns introduced — the insert wiring is live and test-proven; the backfill script is a complete, functional (not stubbed) implementation intentionally deferred from execution per the plan's explicit scope fence.

---
*Phase: 160-url-contract-public-access-security*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: scripts/backfill-public-urls.ts
- FOUND: lib/services/generate-estimate.ts
- FOUND: tests/unit/services/generate-estimate.test.ts
- FOUND commit: 600d188d (test)
- FOUND commit: 47e41941 (feat)
- FOUND commit: a7f1e68a (feat)
