---
phase: 188-server-wide-provider-selection-integrity
plan: 03
subsystem: infra
tags: [storage, r2, s3, supabase, vitest, provider-selection, pdf, whatsapp, inngest]

requires:
  - phase: 188-server-wide-provider-selection-integrity
    plan: "01"
    provides: "lib/storage/server.ts — serverStorageBackend() / getServerStorage() / serverStorage(client), the single server-wide storage provider seam"
provides:
  - "lib/pdf/render-estimate-pdf.ts, lib/queries/share.ts (2 call sites): attached-photo signed URLs resolve through serverStorage(), following the same backend lib/estimate/adapters/whatsapp.ts writes to"
  - "lib/whatsapp/pdf-delivery.ts: PDF upload/signed-url on serverStorage()"
  - "lib/inngest/functions/cleanup-audio.ts, lib/inngest/functions/storage-orphan-cleanup.ts: both cleanup crons delete from the same backend the app writes to"
  - "Confirmed (not code-changed) storage-orphan-cleanup.ts's age gate is already fail-closed under an S3-shaped ListedObject (no createdAt, possibly no updatedAt) — covering test added"
affects: [188-04-plan, 190, 191, 192]

tech-stack:
  added: []
  patterns:
    - "Server read/delivery/cleanup call sites use serverStorage(client) from @/lib/storage/server, never createStorage(client) from @/lib/storage"
    - "Tests that exercise the real (unmocked) serverStorage(client) delegation path need `// @vitest-environment node` — the suite's global jsdom environment makes assertServer()'s `typeof window !== 'undefined'` guard spuriously throw otherwise"

key-files:
  created: []
  modified:
    - lib/pdf/render-estimate-pdf.ts
    - lib/queries/share.ts
    - lib/whatsapp/pdf-delivery.ts
    - lib/inngest/functions/cleanup-audio.ts
    - lib/inngest/functions/storage-orphan-cleanup.ts
    - tests/unit/inngest/cleanup-audio-job.test.ts
    - tests/unit/inngest/storage-orphan-cleanup.test.ts
    - tests/unit/whatsapp/pdf-delivery.test.ts
    - tests/unit/pdf/render-estimate-pdf-resolver.test.ts
    - tests/unit/share-query.test.ts
    - tests/unit/estimates/public-token.test.ts

key-decisions:
  - "storage-orphan-cleanup.ts's ageMsOf() (entry.updatedAt ?? entry.createdAt, null if neither present -> never delete) was ALREADY fail-closed and S3-safe with zero code change: the S3 provider populates updatedAt (from LastModified) for every real object, so the age gate works under both backends. Only a covering test was added, not a fix."
  - "storage-orphan-cleanup.ts's isFolder === false guards at the company/folder levels are Supabase-only defensive checks (never trigger under S3, since S3 never populates isFolder at all) — this does not create a fail-open path because the deletion decision is gated exclusively by ageMsOf() and the reference check, never by isFolder."
  - "Documented (not fixed, out of this plan's scope) a separate, deeper functional gap: the S3 provider's list() calls ListObjectsV2Command without a Delimiter, so it returns keys recursively rather than one folder level at a time the way Supabase's list() does. Under R2 this cron's 3-level folder-by-folder walk therefore does not line up with a flat/recursive listing, and real R2 orphans likely never reach the deletion path. This is a functional gap (orphans go unswept), not a safety gap (nothing gets deleted wrongly) — fixing it would require editing lib/storage/s3-provider.ts's list() (forbidden in this plan) or restructuring the walk (an architectural change, Rule 4). Left for a future plan."
  - "4 test files needed `// @vitest-environment node` because they exercise the real serverStorage(client) Supabase-mode delegation (mocking only the Supabase client's storage.from(), not @/lib/storage/server) and the suite's default jsdom environment makes assertServer() throw spuriously. Same root cause and fix pattern the sibling 188-02 plan independently found in its own admin-action tests (a826a19d)."

patterns-established:
  - "New server call sites reading/writing Storage must serverStorage(client), never createStorage(client) directly (Plan 04's census gate)"
  - "A test file that calls a function transitively resolving serverStorage()/getServerStorage() without mocking @/lib/storage/server needs `// @vitest-environment node`"

requirements-completed: [PROV-01]

duration: ~70min
completed: 2026-08-06
---

# Phase 188 Plan 03: Server-Wide Provider Selection Integrity (delivery/read/cleanup call sites) Summary

**Converted the 6 remaining read/delivery/cleanup storage call sites (PDF renderer, public share page x2, WhatsApp PDF delivery, and both Inngest cleanup crons) from `createStorage(client)` to `serverStorage(client)`, closing the split-brain 404 risk the field assessment predicted — and confirmed, without touching `s3-provider.ts`, that the orphan-cleanup cron's age gate is already fail-closed under an S3-shaped `ListedObject`.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-08-06T17:50:00Z (approx, first file read)
- **Completed:** 2026-08-06T18:32:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 11 (5 production, 6 test)

## Accomplishments

- `lib/pdf/render-estimate-pdf.ts`, `lib/queries/share.ts` (both `getEstimateByShareToken`/`getEstimateBySlugToken`/`getEstimateByPublicToken` call sites), and `lib/whatsapp/pdf-delivery.ts` now resolve attached-photo signed URLs and the WhatsApp PDF upload through `serverStorage(client)` — the same backend `lib/estimate/adapters/whatsapp.ts` already writes inbound media to, closing the exact silent-404 failure mode the plan's objective described.
- `lib/inngest/functions/cleanup-audio.ts` and `lib/inngest/functions/storage-orphan-cleanup.ts` (both service-role, row/bucket-driven cleanup jobs) now resolve `serverStorage(svc)` instead of `createStorage(svc)`, so both crons sweep the backend the app actually writes to.
- **Orphan-sweep S3/R2 safety review (the plan's highest-risk item) — confirmed already-safe, zero production-code change needed:** `ageMsOf()` already reads `entry.updatedAt ?? entry.createdAt` and returns `null` (never delete) when neither is present. The S3 provider populates `updatedAt` from S3's `LastModified` for every real object it lists, so the age gate works correctly under both backends without modification. Added a new covering test — `(i) Phase 188 PROV-01: S3-shaped entry with neither updatedAt nor createdAt is treated as unknown age and NEVER deleted (fail-closed)` — to lock this in as a regression test.
- `isFolder` review: the leaf-level guard (`if (fileEntry.isFolder) continue`) only ever skips a Supabase folder placeholder (`isFolder: true`); under S3 `isFolder` is always `undefined` (falsy), so no real S3 object is ever incorrectly skipped there. The bucket/folder-level `isFolder === false` guards are Supabase-only defensive checks against unexpected files at a folder-only level — under S3 they simply never trigger, which affects which prefixes get walked but never the deletion decision itself (that's gated exclusively by the age check + reference check).
- Documented (see Deviations) a separate, deeper functional limitation in the orphan sweep under R2 mode — the S3 provider's flat/recursive `list()` vs. the walk's assumed non-recursive folder-by-folder paging — as an out-of-scope, safety-neutral gap rather than fixing it (would require editing the forbidden `s3-provider.ts` or restructuring the walk algorithm).
- 4 test files needed `// @vitest-environment node`, not just the 2 the plan named, because they transitively exercise `serverStorage()` -> `assertServer()` without mocking `@/lib/storage/server`, and the suite's global `jsdom` environment makes `assertServer()`'s `typeof window` guard throw spuriously. Fixed all 4 rather than leaving 3 of them red.

## Task Commits

1. **Task 1: Convert the 6 delivery/read/cleanup call sites** - `292685ff` (feat)
2. **Task 2: Repoint the affected test mocks and prove the full suite** - `06cfab07` (test)

_Plan-metadata commit (this SUMMARY/STATE/ROADMAP update) is the next commit._

## Files Created/Modified

- `lib/pdf/render-estimate-pdf.ts` — import + call site: `createStorage(supabase)` -> `serverStorage(supabase)`, with a one-line PROV-01 comment noting the caller-supplied client's RLS scoping is preserved.
- `lib/queries/share.ts` — both photo-signed-URL call sites (`getEstimateByShareToken`/`getEstimateBySlugToken` at ~line 154 and `getEstimateByPublicToken` at ~line 418, both fed a `requireServiceClient()` instance) converted the same way.
- `lib/whatsapp/pdf-delivery.ts` — PDF upload call site converted the same way.
- `lib/inngest/functions/cleanup-audio.ts` — import + call site converted (service-role client); header docblock's stale `createStorage(...)` reference corrected to `serverStorage(...)`.
- `lib/inngest/functions/storage-orphan-cleanup.ts` — import + call site converted (service-role client); header docblock extended with the full S3/R2 `ListedObject` safety review (age-gate confirmation, `isFolder` analysis, and the documented-but-deferred recursive-listing limitation).
- `tests/unit/inngest/cleanup-audio-job.test.ts` — `vi.mock('@/lib/storage', …)` -> `vi.mock('@/lib/storage/server', …)` exposing `serverStorage`; header comment updated.
- `tests/unit/inngest/storage-orphan-cleanup.test.ts` — new test case `(i)` covering the S3-shaped fail-closed age gate. (This file injects the `StorageProvider` directly into `runStorageOrphanCleanup()`, so it was never coupled to `createStorage`/`serverStorage` and needed no mock repoint.)
- `tests/unit/whatsapp/pdf-delivery.test.ts` — plan predicted this would pass unchanged; it did not (see Deviations) — added `// @vitest-environment node`.
- `tests/unit/pdf/render-estimate-pdf-resolver.test.ts`, `tests/unit/share-query.test.ts`, `tests/unit/estimates/public-token.test.ts` — not in the plan's file list, but direct, unmocked consumers of the 2 converted production files (`render-estimate-pdf.ts`, `share.ts`); each needed the same `// @vitest-environment node` fix once the conversion made them exercise `assertServer()` for the first time.

## Decisions Made

- **No change to `lib/storage/s3-provider.ts`** — confirmed empty via `git diff --stat lib/storage/s3-provider.ts` at every checkpoint, per the hard constraint.
- **The orphan-sweep age gate needed no code change** — see Accomplishments/Deviations for the full analysis. This directly satisfies the plan's central safety requirement ("must fail closed — never delete an object whose age cannot be established").
- **The S3 flat-listing-vs-non-recursive-walk mismatch was documented, not fixed.** It's a functional gap (R2-mode orphans may go unswept) rather than a safety gap (nothing gets deleted wrongly — the mismatch causes constructed prefixes to diverge from any real key, so real objects simply never reach the age/delete path under R2). Fixing it needs either `s3-provider.ts` (forbidden) or a walk-algorithm rewrite (architectural, Rule 4) — out of scope for this plan, called out in the file's header docblock for whoever picks it up next.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tests/unit/whatsapp/pdf-delivery.test.ts` failed after conversion — plan predicted it would pass unchanged**
- **Found during:** Task 2, first run of the plan's Task-2-named test files.
- **Issue:** The plan's rationale ("mocks the Supabase client's `storage.from`, not the factory... it should pass unchanged") was correct about the mocking shape but missed that `serverStorage()` calls `assertServer()`, which throws `typeof window !== 'undefined'`. The suite's global `vitest.config.ts` environment is `jsdom`, where `window` is always defined — so 5 of the file's 10 tests threw `[lib/storage/server] this module is server-only...` instead of exercising the mocked Supabase client.
- **Fix:** Added `// @vitest-environment node` at the top of the file (same fix Plan 01 already used in `tests/unit/storage/server-provider.test.ts` for the identical root cause).
- **Files modified:** `tests/unit/whatsapp/pdf-delivery.test.ts`.
- **Verification:** All 10 tests pass.
- **Committed in:** `06cfab07` (Task 2).

**2. [Rule 1 - Bug] 3 more test files outside the plan's `files_modified` list broke for the identical reason**
- **Found during:** Task 2, full-suite verification run (`tests/unit/estimates/public-token.test.ts`, and discovered while investigating: `tests/unit/pdf/render-estimate-pdf-resolver.test.ts`, `tests/unit/share-query.test.ts`).
- **Issue:** These 3 files are direct, unmocked consumers of `lib/pdf/render-estimate-pdf.ts` and `lib/queries/share.ts` (Task 1's conversion targets) — they mock the Supabase client's `storage.from()`/`createSignedUrl()` but never mock `@/lib/storage` or `@/lib/storage/server`, so before this plan they exercised `createStorage(client)` (no `assertServer()` guard) and passed under `jsdom`. After conversion to `serverStorage(client)`, all 3 hit the same spurious `assertServer()` throw as pdf-delivery.test.ts. None of the 3 were named in the plan's `files_modified`, but all 3 are a direct, mechanical consequence of Task 1's conversion — not out-of-scope pre-existing failures — so fixing them is in scope per the plan's own Task 2 instruction to "sweep ... watch for share-page, PDF-render ... tests that this plan's conversion touches."
- **Fix:** Added `// @vitest-environment node` to all 3, identical fix and rationale as #1.
- **Files modified:** `tests/unit/pdf/render-estimate-pdf-resolver.test.ts`, `tests/unit/share-query.test.ts`, `tests/unit/estimates/public-token.test.ts`.
- **Verification:** All 3 files pass in full (9, 15, and 13 tests respectively). Full-suite run confirms no other test regressed from this plan's conversion.
- **Committed in:** `06cfab07` (Task 2).

---

**Total deviations:** 2 auto-fixed (both Rule 1 bug fixes — a plan-prediction miss and its blast radius — both test-infrastructure only, zero production-behavior changes beyond what the plan specified).
**Impact on plan:** No scope creep in production code. The 3 additional test files fixed were not named in the plan but are direct, mechanical fallout of Task 1's conversion of `render-estimate-pdf.ts`/`share.ts` — leaving them red would have been a plan-caused regression, not an out-of-scope pre-existing issue.

## Issues Encountered

**Transient full-suite flakes observed and resolved by re-running in isolation (matches the pattern documented in 188-01's SUMMARY, per this plan's own verification instructions):**
- The 1st full-suite run showed 17 `FAIL` lines, including `tests/unit/branding-actions.test.ts` and `tests/unit/seo-actions.test.ts` (both 188-02/sibling-plan files, outside this plan's scope) plus `tests/unit/estimates/public-token.test.ts` (fixed above) plus the 2 known CRLF failures. Isolated re-runs of `branding-actions.test.ts`/`seo-actions.test.ts` passed clean (9/9), confirming those were fork-pool-contention flakes unrelated to this plan (the sibling 188-02 plan independently hit and fixed the identical root-cause class of failure in its own test files, commit `a826a19d`).
- The 2nd and 3rd full-suite runs (after all fixes were in place) both showed exactly 3 `FAIL` lines: the 2 known CRLF failures plus `tests/unit/mcp-route-contract.test.ts` — the exact same pre-documented, unrelated flake called out in 188-01's own SUMMARY ("timeout-sensitive under vitest fork-pool contention," zero references to storage or any file this plan touches). Confirmed in isolation: passes 8/8 standalone.
- The 4th (final, sign-off) full-suite run shows exactly the 2 known CRLF-only `FAIL` lines and no others — used as the sign-off record below.

## User Setup Required

None — no external service configuration required. R2 stays fully dormant: no `S3_*` value, real or placeholder, was added to `.env.local`, Coolify, or any committed env file (`git status` shows no `.env*` change throughout this plan).

## Verification Record

- **`npx tsc -p tsconfig.ci.json --noEmit`:** 0 errors.
- **`npx tsc --noEmit` (bare):** 0 errors.
- **Census check (all 5 Task-1 files):** `node -e "..."` script from the plan's `<verify>` block — `all 5 files converted` (zero `createStorage(` calls, `serverStorage(` present, `@/lib/storage/server` import present, in all 5 files).
- **`git diff --stat lib/storage/s3-provider.ts`:** empty at every checkpoint.
- **`git status` `.env*` check:** no changes to any `.env*` file throughout this plan.
- **Full-suite `npx vitest run tests/unit tests/eval` (final sign-off run, exit code captured directly, not through a pipe):** `Tests 2 failed | 5138 passed | 20 todo (5160)`, `VITEST_EXIT=1`. The exact `FAIL` line set:
  - `tests/unit/sign-estimate-atomic-migration.test.ts > sign_estimate_atomic migration (S2) — shape > is SECURITY DEFINER (a documented departure from save_estimate_atomic INVOKER) with search_path pinned`
  - `tests/unit/signature-evidence-retention-migration.test.ts > fix-pack F2, finding #2 — erase_company_for_compliance (GoTrue hard-delete escape hatch) > is SECURITY DEFINER with search_path pinned`

  Both are the pre-documented Windows-CRLF-only failures (pass in CI) — not regressions from this plan. No third `FAIL` line in this sign-off run.

## Next Phase Readiness

Plan 04 (the static import-graph gate) has a clean baseline: `lib/storage/index.ts` remains free of S3/service-role/env references, `lib/storage/s3-provider.ts` is untouched, and this plan's 5 converted files are documented as clean examples of the required pattern. The one open item for a future plan (not blocking, safety-neutral): the S3 provider's `list()` returns keys recursively (no `Delimiter`), which doesn't line up with `storage-orphan-cleanup.ts`'s non-recursive 3-level walk — under R2, real orphans likely go unswept rather than being wrongly deleted. Flagged in the file's header docblock.

No blockers for Plan 04.

## Self-Check: PASSED

All 11 files created/modified verified present on disk; both task commits (`292685ff`, `06cfab07`) verified present in `git log`.

---
*Phase: 188-server-wide-provider-selection-integrity*
*Completed: 2026-08-06*
