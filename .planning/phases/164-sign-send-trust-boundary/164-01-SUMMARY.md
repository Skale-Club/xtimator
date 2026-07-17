---
phase: 164-sign-send-trust-boundary
plan: 01
subsystem: api
tags: [supabase, jsonb, trust-boundary, estimate-signatures, share-link, pdf]

# Dependency graph
requires: []
provides:
  - "estimate_signatures.signed_content JSONB + signed_total NUMERIC(12,2) (nullable, no backfill)"
  - "lib/estimate/signed-snapshot.ts: SignedContentSnapshot type + buildSignedContentSnapshot() + applySignedSnapshot()"
  - "lib/estimate/lock.ts: isEstimateLocked() pure predicate + EstimateLockFields type"
  - "lib/queries/share.ts: loadLatestSignedSnapshot() shared query, exported for reuse by the PDF route"
  - "Signed estimates render from an immutable snapshot on the public share page (both share_token and public_slug_token lookups) and the on-demand PDF route"
affects: [164-sign-send-trust-boundary (Plan 02), 165-save-atomicity-version-authority]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REPLACE-not-merge overlay: applySignedSnapshot() overwrites the FULL enumerated rendered-content field set wholesale from a frozen snapshot, never a partial `{...live, ...partial}` merge"
    - "Fail-closed signing: a signature insert is aborted (500) if the content snapshot cannot be loaded/serialized, rather than persisting a signature with no evidence"
    - "One shared query (loadLatestSignedSnapshot) + one shared overlay (applySignedSnapshot) reused across all 3 render call sites (2 share lookups + PDF route) — no duplicated logic"

key-files:
  created:
    - supabase/migrations/20260717000001_phase164_signature_snapshot.sql
    - lib/estimate/lock.ts
    - lib/estimate/signed-snapshot.ts
    - tests/unit/estimate/lock.test.ts
    - tests/unit/estimate/signature-snapshot.test.ts
  modified:
    - app/api/estimates/[id]/sign/route.ts
    - lib/queries/share.ts
    - app/api/estimates/[id]/pdf/route.ts
    - tests/unit/share-query.test.ts
    - tests/unit/estimates/public-token.test.ts

key-decisions:
  - "buildSignedContentSnapshot + applySignedSnapshot live together in lib/estimate/signed-snapshot.ts (a sibling module to lock.ts, not lock.ts itself) so lock.ts stays a single tiny dependency-free predicate for Plan 02 to import cleanly"
  - "loadLatestSignedSnapshot (the estimate_signatures query) is exported from lib/queries/share.ts and imported by the PDF route, rather than duplicated — one query, three call sites"
  - "PDF route ETag switches from est-{id}-{updated_at} to sig-{signature_id}-{signed_at} once a snapshot is in play, so a post-sign live edit (which still bumps updated_at) cannot invalidate an already-correct cached signed PDF"
  - "total_amount_cents is re-derived from signed_total (not from the overlaid estimate.total) at both share lookup call sites, per the plan-checker's explicit blocker #4 fix"
  - "Migration adds only 2 nullable columns, NO backfill — historical signatures cannot be reconstructed truthfully, so legacy rows stay on the live-render path forever"

requirements-completed: [TRUST-01]

# Metrics
duration: ~1h45m wall-clock (~35min active implementation; remainder was waiting out severe shared-environment test/build resource contention — see Issues Encountered)
completed: 2026-07-17
---

# Phase 164 Plan 01: Sign & Send Trust Boundary — Signature Snapshot Summary

**Signed estimates now carry an immutable JSONB snapshot captured at sign time, and the public share page + on-demand PDF render from that frozen snapshot (not live rows) via one shared REPLACE-not-merge overlay — closing audit finding A1/A2 where a post-sign edit silently changed what the client's link showed.**

## Performance

- **Duration:** ~1h45m wall-clock (~35min actual implementation work; the rest was waiting out extreme shared-environment CPU/process contention during test verification — see Issues Encountered)
- **Started:** 2026-07-17T14:24:00Z (UTC)
- **Completed:** 2026-07-17T16:16:00Z (UTC)
- **Tasks:** 3/3
- **Files modified:** 9 (5 created, 4 modified in production/test code, plus migration)

## Accomplishments

- `estimate_signatures` gained nullable `signed_content JSONB` + `signed_total NUMERIC(12,2)` (dormant-first, no backfill)
- The sign route (`app/api/estimates/[id]/sign/route.ts`) now loads the full render content (sections + items, ordered by `sort_order`) and builds a `SignedContentSnapshot` (version 1) **before** inserting the signature — `signed_content` + `signed_total` land in the **same** insert, and the whole request fails closed (500) if the content can't be loaded or serialized
- `lib/estimate/signed-snapshot.ts` — new pure module: `buildSignedContentSnapshot()` (serializer) and `applySignedSnapshot()` (the one shared REPLACE-not-merge overlay)
- `lib/queries/share.ts` — both `getEstimateByShareToken` and `getEstimateByPublicToken` now overlay the latest signature's snapshot onto the live payload when one exists, and re-derive `total_amount_cents` from `signed_total` (not live `estimate.total`)
- `app/api/estimates/[id]/pdf/route.ts` — same overlay before rendering; the ETag now keys on the signature's `id`/`signed_at` instead of `updated_at` once a snapshot is in play
- `lib/estimate/lock.ts` — the shared `isEstimateLocked()` predicate Plan 02 depends on, landed and unit-tested
- Legacy signatures (`signed_content IS NULL`) are byte-identical to today's live-row rendering — proven by dedicated tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + lock predicate (TDD the predicate)** - `828c767f` (feat)
2. **Task 2: Capture the snapshot at signing** - `bc8a12ee` (feat)
3. **Task 3: Share + PDF render from snapshot when signed** - `1ea4a93b` (feat)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 1 followed TDD — `tests/unit/estimate/lock.test.ts` was written and run RED (import-not-found failure) before `lib/estimate/lock.ts` existed, then made GREEN by the implementation, all within the same commit per the plan's task grouping._

## Files Created/Modified

- `supabase/migrations/20260717000001_phase164_signature_snapshot.sql` - Adds `estimate_signatures.signed_content`/`signed_total`, nullable, no backfill, with column comments documenting the immutability contract
- `lib/estimate/lock.ts` - `isEstimateLocked()` pure predicate (`sent_at` set OR `client_response` set → locked) for Plan 02's freeze guards
- `lib/estimate/signed-snapshot.ts` - `SignedContentSnapshot` type, `buildSignedContentSnapshot()` serializer, `applySignedSnapshot()` shared overlay
- `app/api/estimates/[id]/sign/route.ts` - Widened the estimate select to `'*'`, loads sections+items, builds and inserts the snapshot atomically with the signature row, fails closed on content-load/serialize errors
- `lib/queries/share.ts` - New `loadLatestSignedSnapshot()` shared query + overlay wiring in both lookup functions + `total_amount_cents` re-derivation from `signed_total`
- `app/api/estimates/[id]/pdf/route.ts` - Overlay wiring + signature-keyed ETag
- `tests/unit/estimate/lock.test.ts` - 6 tests for `isEstimateLocked` (null/undefined/draft/sent/responded/both)
- `tests/unit/estimate/signature-snapshot.test.ts` - 6 tests for `buildSignedContentSnapshot` (full shape, sort_order re-sort, section id+subtotal preservation, per-item taxable/tax_category/discount, JSONB-safe nulls, empty-items section)
- `tests/unit/share-query.test.ts` - Extended: `estimate_signatures` mock branch added; new `describe` block with 3 tests proving snapshot-present drift protection (per-field: summary, estimate_date, estimate_number, deposit_type/value, discount_type/value, section subtotal, total_amount_cents) and legacy/no-signature byte-identical behavior
- `tests/unit/estimates/public-token.test.ts` - Same extension for the friendly-URL (`getEstimateByPublicToken`) sibling

## Decisions Made

See `key-decisions` in the frontmatter above. In short: the snapshot serializer + overlay live together in one new pure module (`lib/estimate/signed-snapshot.ts`) rather than inside `lock.ts`, so Plan 02 gets a minimal, truly dependency-free `lock.ts`; the "latest signature" query is exported once from `share.ts` and reused by the PDF route rather than duplicated; the PDF ETag keys off the signature instead of `updated_at` once signed, so a live edit after signing can't invalidate an already-correct cached PDF.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended two pre-existing test files' Supabase mocks to cover the new `estimate_signatures` query**
- **Found during:** Task 3
- **Issue:** `tests/unit/share-query.test.ts` and `tests/unit/estimates/public-token.test.ts` mock `serviceClientMock.from` with an explicit per-table switch; adding the `estimate_signatures` lookup to `getEstimateByShareToken`/`getEstimateByPublicToken` would otherwise call `.eq().order().limit().maybeSingle()` on an un-mocked `{ select: vi.fn() }` fallback and throw, breaking every existing test in both files.
- **Fix:** Added a `signatureRow` field to each file's `MockConfig` + an `estimate_signatures` branch in `installMock` (defaults to `null` when unset, preserving every existing test's behavior unchanged). Also added the new TRUST-01 overlay describe blocks proving snapshot-present drift protection and legacy byte-identical rendering, per the plan's Task 3 acceptance criteria.
- **Files modified:** tests/unit/share-query.test.ts, tests/unit/estimates/public-token.test.ts
- **Verification:** All pre-existing tests in both files still pass unchanged; new tests green.
- **Committed in:** `1ea4a93b` (Task 3 commit)

**2. [Rule 3 - Blocking] New pure module `lib/estimate/signed-snapshot.ts` not in the plan's `files_modified` list**
- **Found during:** Task 2
- **Issue:** The plan's interface section left the snapshot serializer's file location to the executor ("same file or lib/estimate/lock.ts sibling module"). Placing `buildSignedContentSnapshot`/`applySignedSnapshot` directly in `lock.ts` would violate the plan's own explicit requirement that `lock.ts` stay "dependency-free and pure" for Plan 02, and would bloat a file meant to be a single tiny predicate.
- **Fix:** Created `lib/estimate/signed-snapshot.ts` as a sibling module. Both new exported functions plus the `SignedContentSnapshot` type family live there; `lock.ts` is untouched beyond its own Task 1 scope.
- **Files modified:** lib/estimate/signed-snapshot.ts (new)
- **Verification:** `lock.ts` still exports exactly `isEstimateLocked` + `EstimateLockFields`; no new imports added to it.
- **Committed in:** `bc8a12ee` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — both necessary to keep `npm test` green and to honor the plan's own file-scoping intent for `lock.ts`)
**Impact on plan:** No scope creep — both fixes are directly downstream of implementing Task 2/3 exactly as specified.

## Issues Encountered

**Severe shared-environment resource contention during test verification.** This session ran on a machine/repo shared concurrently with other active GSD sessions (visible in `git log`: `f9d2c1cc` 166-01 and `5b406cd4` 169-01 landed on `main` interleaved with this plan's 3 commits; `ps`/`Get-CimInstance Win32_Process` showed 30-40+ concurrent `node.exe`/`vitest` worker processes at peak, plus unrelated processes from entirely different repos on the same box). Effects observed:
- Two separate `npx vitest run` (full-suite) background invocations each took 45+ minutes; one completed with `3279 passed / 5 failed` where **all 5 failures were `[vitest-pool]: Failed to start forks worker` / `Timeout waiting for worker to respond` infra errors** in files this plan never touches (`tests/unit/inngest/route.test.ts`, `tests/unit/billing/whisper-cost.test.ts`, `tests/unit/env.test.ts`, `tests/unit/mcp-server-registration.test.ts`, `tests/unit/seo/home-cacheability.test.ts`, `tests/unit/ai/refine-shared-prompt.test.ts`, `tests/unit/actions/estimate-save-no-gate.test.ts`); a second invocation never produced output and was eventually killed by the harness.
- `git commit` (gitleaks pre-commit hook) took 2+ minutes on one commit under the same contention (normally sub-second).
- This repo's own `vitest.config.ts` has a pre-existing comment explicitly documenting this exact flake class ("under full-suite parallel CPU contention it can exceed 5s, producing load-induced timeout flakes (not code bugs)") — this is a known, previously-observed characteristic of this suite/environment, not something introduced by this plan.

**Resolution:** Rather than keep re-running an unreliable full suite, I ran the complete blast-radius of tests that exercise this plan's changed files — `tests/unit/estimate/lock.test.ts`, `tests/unit/estimate/signature-snapshot.test.ts`, `tests/unit/share-query.test.ts`, `tests/unit/estimates/public-token.test.ts`, and `tests/unit/settings/team-staff-consolidation.test.ts` (a static-grep test asserting substrings in the PDF route that this plan's edits preserved) — together as one command: **5 files, 39 tests, 100% green.** Combined with the completed full-suite run's zero regressions in any plan-relevant file and a clean `npx tsc --noEmit -p tsconfig.ci.json` (0 errors, verified twice after edits), this constitutes solid verification evidence despite not obtaining one single clean full-suite run within a reasonable time budget.

**`gsd-tools state` subcommands repeatedly corrupted `.planning/STATE.md`'s frontmatter** (reverting `milestone`/`status`/progress to stale, unrelated values — a pre-existing bug already documented in STATE.md's own history for v4.17 and v4.18 executions). Manually re-asserted the correct `milestone: v4.19` frontmatter and `Current Position` section after every tool invocation.

## User Setup Required

None - no external service configuration required. The migration file is authored-only per repo convention (never applied from this environment — CI→GHCR→Coolify deploy pipeline applies it).

## Next Phase Readiness

- Plan 02 (freeze-on-send/sign guards, TRUST-02/03) can proceed immediately — `lib/estimate/lock.ts`'s `isEstimateLocked()` is ready to import into `saveEstimate` and the refine route exactly as specified.
- `lib/actions/estimate.ts` and `app/api/estimates/[id]/refine/route.ts` were NOT touched by this plan, per the hard constraint — both remain exactly as Plan 02/167-01 will find them.
- No new anon RLS was added to `estimates` (v4.18 locked decision preserved) — the migration only adds two nullable columns to `estimate_signatures`.

## Known Stubs

None. No hardcoded/placeholder values were introduced.

## Known Limitation (carried forward, not a stub)

**Photo URLs are NOT part of the frozen snapshot.** Signed URLs expire hourly, so freezing one at sign time would just break after 1 hour — attached photos always re-resolve from the live `estimate_photos` rows on both the share page and the PDF. A photo added or removed after signing is therefore still visible on an already-signed estimate's public link/PDF. This is documented in `lib/estimate/signed-snapshot.ts`'s `applySignedSnapshot` doc comment and is an intentional, bounded scope decision (not a defect) — company branding and share metadata are likewise intentionally excluded from the frozen set.

---
*Phase: 164-sign-send-trust-boundary*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; all 3 task commit hashes (`828c767f`, `bc8a12ee`, `1ea4a93b`) confirmed in `git log`.
