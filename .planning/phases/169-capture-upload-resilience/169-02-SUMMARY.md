---
phase: 169-capture-upload-resilience
plan: 02
subsystem: infra
tags: [inngest, cron, supabase-storage, storage-provider, orphan-cleanup, reconciliation]

# Dependency graph
requires:
  - phase: 169-capture-upload-resilience (plan 01)
    provides: "supabase-provider.ts upload() error-status preservation (landed first — this plan's provider edit was rebased on top of it, untouched)"
provides:
  - "storageOrphanCleanupJob — daily 04:45 UTC Inngest cron reconciling the audio + photos buckets against recordings/photos rows"
  - "runStorageOrphanCleanup(svc, storage, opts) — pure, injectable sweep testable without the Inngest harness"
  - "Additive StorageProvider.list() extension: ListedObject.createdAt/isFolder + optional {limit, offset} paging (ListOptions)"
affects: [storage, inngest, capture]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bucket-walking crons hard-skip PROTECTED PREFIXES by name before any list()/delete — stronger than reference-checking for object classes whose references live outside the bucket's canonical table"
    - "3-level paged walk (root -> company -> folder -> files) with full-key rejoin before any row-match or delete — StorageProvider.list() returns leaf names, storage_path columns store full keys"
    - "Per-bucket reference matcher functions (union check) — adding a new referencing table for a bucket is a one-line change"

key-files:
  created:
    - lib/inngest/functions/storage-orphan-cleanup.ts
    - tests/unit/inngest/storage-orphan-cleanup.test.ts
  modified:
    - lib/storage/index.ts
    - lib/storage/supabase-provider.ts
    - lib/inngest/functions/index.ts
    - app/api/inngest/route.ts
    - tests/unit/storage/supabase-provider.test.ts

key-decisions:
  - "Cron slot 04:45 UTC — offset from cleanup-audio (04:00) AND retention-cleanup (04:30), which the plan's 'offset from cleanup-audio's hour' instruction didn't know about."
  - "Age gate treats an object with NO usable timestamp (updatedAt and createdAt both absent/unparseable) as NOT old enough — an unknown age is never evidence of staleness, so such objects are never deleted."
  - "Provider forwards {limit, offset} to Supabase's .list() ONLY when the caller actually supplied opts — existing 2-arg call sites hit the client byte-identically to before (no options object at all)."
  - "isFolder derived from entry.id == null (Supabase folder placeholders have null id/metadata) — the exact signal the plan's interface specified."
  - "Defensive walk hygiene: files found directly at bucket root or directly under {companyId}/ (not the documented 3-level shape) are skipped, never deleted — the sweep only ever deletes at the depth whose key shape it can prove."

patterns-established:
  - "Never call the Supabase Storage client directly from crons — everything through the StorageProvider abstraction (createStorage(svc)), matching cleanup-audio.ts's Phase 66 convention."
  - "Protected-prefix lists live next to the per-bucket config (BUCKET_CONFIGS) — future shared-bucket tenants (new top-level folders with external references) get added there, with a regression test locking each."

requirements-completed: [CAPT-04]

# Metrics
duration: 50min
completed: 2026-07-17
---

# Phase 169 Plan 02: Storage Orphan Reconciliation Cron Summary

**Daily Inngest cron (04:45 UTC) that walks the audio and photos buckets 3 levels deep with paging, hard-skips the shared-tenant protected prefixes ({companyId}/whatsapp/ and {companyId}/price-book/), and deletes only >24h-old objects with no recordings/photos row — after a defensive re-check immediately before each delete.**

## Performance

- **Duration:** ~50 min (implementation + targeted verification; full-suite run extended by shared-environment contention, see Issues)
- **Started:** 2026-07-17T16:55:00Z (approx)
- **Completed:** 2026-07-17T17:45:00Z (approx)
- **Tasks:** 3/3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **CAPT-04 closed (audit F5):** both buckets are now reconciled daily. Upload-before-row orphans (out-of-credits blocks, failed row-creates, removed error-thumbnails) get swept after 24h; every row-referenced object class is provably untouchable.
- **All 5 Opus plan-check blockers addressed by construction:**
  1. Price-book images (photos bucket, `company_price_book.image_url`, no photos row) — protected prefix, never enumerated.
  2. WhatsApp inbox audio (audio bucket, `whatsapp_messages.media_url`, recordings.storage_path NULL) — protected prefix, never enumerated.
  3. Explicit serve-handler registration — `storageOrphanCleanupJob` added to BOTH `lib/inngest/functions/index.ts` and `app/api/inngest/route.ts` (import + functions array); the pre-existing deploy-sync guard (`serve-registration.test.ts`) now also covers it.
  4. 3-level non-recursive walk with per-level paging (limit 100/offset loop) reaches actual FILE objects at their real depth.
  5. Full-key rejoin (`${companyId}/${folder}/${leafName}`) before every row-match and delete — asserted by test (a), which verifies the mock row-check never receives a bare leaf.
- **Additive-only lib/storage extension:** `ListedObject.createdAt`/`isFolder` + `ListOptions {limit, offset}` — zero changes to any existing call site (tsc proves), and 169-01's `upload()` status-preservation change in supabase-provider.ts is untouched.

## Protected-Prefix + Union-Matcher Design

| Bucket | Protected prefix (hard skip) | Reference class protected by the skip | Union row-matcher (belt) |
|---|---|---|---|
| `audio` | `{companyId}/whatsapp/` | `whatsapp_messages.media_url` (recordings.storage_path is NULL for these) | `recordings.storage_path = fullKey` |
| `photos` | `{companyId}/price-book/` | `company_price_book.image_url` (no photos row ever exists) | `photos.storage_path = fullKey` |

The skip happens at folder-name level BEFORE any `list()` call into the prefix — the sweep never enumerates inside, so no code path can even construct a delete key there. The per-bucket matcher functions (`recordingsReference`/`photosReference`) are the union check for everything else; adding a future referencing table is a one-line change in `BUCKET_CONFIGS`.

## Walk / Paging Mechanics

1. **Level 1:** `list(bucket, '')` — company-id folders, paged (100/offset loop via `listAllPages`).
2. **Level 2:** `list(bucket, companyId)` — per-company folders. Protected prefixes are counted (`skippedProtectedPrefix`) and skipped here. Non-folder entries at this level are skipped defensively (undocumented shape — never guess a key).
3. **Level 3:** `list(bucket, companyId/folder)` — actual files. Folder placeholders (`isFolder`, derived from Supabase's null-id entries) are never treated as deletable objects.
4. **Age gate:** `updatedAt` (documented created_at proxy — Storage's updated_at only changes on re-upload, so for never-touched orphans updatedAt equals createdAt) with `createdAt` fallback; unknown age = never delete. Threshold 24h.
5. **Delete path:** reference check -> defensive re-check (TOCTOU belt) -> `storage.delete(bucket, fullKey)`. Never-throw per page and per object; summary log `{bucket, scanned, skippedProtectedPrefix, deleted}` per bucket.

## The 8-Case Test Table (tests/unit/inngest/storage-orphan-cleanup.test.ts — 11 tests total, all GREEN)

| Case | Scenario | Locked behavior |
|---|---|---|
| (a) | 3-level orphan >24h, no row | Deleted; row-check received the FULL key `co1/proj1/orphan.webm`, never the leaf; an old folder placeholder at file level was NOT treated as deletable |
| (b) | Object with a matching recordings row | NOT deleted |
| (c) | Fresh object (<24h) | NOT deleted |
| (d) | `{companyId}/whatsapp/x.ogg`, old, NO recordings match | NEVER enumerated (no `list('co1/whatsapp')` call ever made), never deleted; `skippedProtectedPrefix: 1` |
| (e) | `{companyId}/price-book/y.jpg`, old, NO photos row | NEVER enumerated, never deleted; `skippedProtectedPrefix: 1` |
| (f) | 105 files under one folder | Paging loop covered all 105 (offset 0 AND offset 100 pages asserted); all scanned + deleted |
| (g) | `list()` throws on one company prefix | Sweep continued to the next company; summary still emitted |
| (h) | Row appears between scan and delete | Defensive re-check caught it — NOT deleted; both check calls for the key asserted |
| + | Summary-log shape | `{bucket, scanned, skippedProtectedPrefix, deleted}` for BOTH buckets |
| + | Inngest config | id `storage-orphan-cleanup`, daily cron, `step.run('sweep-storage-orphans')`, no direct Supabase Storage client usage (source-grep) |

(d) and (e) are the Opus-blocker regression locks: each plants an old, unreferenced-looking object inside the protected prefix that WOULD be deleted if the walk ever got there, then asserts the walk provably never listed into the prefix at all.

## Registration Evidence (Task 3)

- `grep -c "storageOrphanCleanupJob" app/api/inngest/route.ts` = **2** (import + functions array entry) — acceptance criterion met.
- `grep -c "storageOrphanCleanupJob" lib/inngest/functions/index.ts` = **1** — acceptance criterion met.
- `tests/unit/inngest/serve-registration.test.ts` (the deploy-sync guard born from the 2026-06-03 silent-stop incident) passes — it runtime-loads the barrel and cross-checks route.ts's functions array, so the new function is inventory-checked both directions.
- `tests/unit/inngest/route.test.ts` passes (serve handler still exposes GET/POST/PUT).

## Task Commits

1. **Task 1: Additive storage-list extension** - `68fc7f4f` (feat)
2. **Task 2: Reconciliation cron (3-level walk, protected prefixes, union matcher)** - `08474af1` (feat)
3. **Task 3: Register the cron in BOTH registration points** - `f9586569` (feat)

_Note: this SUMMARY commit follows as a separate docs commit._

## Files Created/Modified

- `lib/inngest/functions/storage-orphan-cleanup.ts` - The cron + `runStorageOrphanCleanup(svc, storage, opts)` pure sweep (injectable service client, StorageProvider, and `now` for deterministic tests).
- `lib/storage/index.ts` - `ListedObject.createdAt`/`isFolder` (optional), `ListOptions` type, `list(bucket, prefix?, opts?)` signature — all additive.
- `lib/storage/supabase-provider.ts` - `list()` maps `created_at`, derives `isFolder` from null id, forwards `{limit, offset}` only when supplied (169-01's upload() change untouched).
- `lib/inngest/functions/index.ts` - Barrel export (+2 lines).
- `app/api/inngest/route.ts` - Import + functions array entry (+2 lines).
- `tests/unit/inngest/storage-orphan-cleanup.test.ts` - The 8-case regression set + config/registration coverage (bucket-scoped fake StorageProvider + table-switch service-client mock).
- `tests/unit/storage/supabase-provider.test.ts` - Extended `list()` coverage: isFolder derivation from null-id, paging passthrough, limit-only forwarding; existing fixtures given explicit non-null ids to reflect real FileObject shape.

## Verification Results

- `npx vitest run tests/unit/inngest/storage-orphan-cleanup.test.ts` — **11/11 GREEN** (run repeatedly across edit states).
- `npx tsc --noEmit -p tsconfig.ci.json` — **exit 0, clean** (run after every task; proves no existing `list()` call site changed).
- Regression contracts: `cleanup-audio.ts` untouched (empty git diff across all three commits); no direct Supabase Storage client calls in the new file (source grep, also locked by a test); protected-prefix tests (d)/(e) present and green.
- Curated sweep (all 21 test files under `tests/unit/storage` + `tests/unit/inngest` + `tests/unit/api/health.test.ts` + `tests/unit/notifications/cleanup-cron.test.ts` + `tests/unit/observability/instrumentation-presence.test.ts`): **138/139**, the single failure being `generate-estimate-job.test.ts`'s dynamic-import 30s timeout — a file this plan does not touch, with the run showing `import 269s / environment 505s` cumulative (heavy contention). **Re-run in isolation twice: 6/6 GREEN both times.** This is the exact load-induced fork-worker flake already documented in 169-01-SUMMARY.md (same file, same failure mode, same isolation-green outcome) — environmental, not a regression.
- Full `npm test`: launched in background under the same shared-environment contention (several other GSD phase executors committing and running suites in this repo concurrently — 166-01/166-02/164-01 commits interleaved with this plan's during the session); at SUMMARY time it was still running (full runs took 43 min wall-clock in 169-01 under the same conditions). Everything this plan touches (storage + inngest suites, the deploy-sync guard, tsc) was verified green directly and repeatedly, which is the plan's own per-task acceptance surface.

## Decisions Made

- Cron at `45 4 * * *` — the plan said "offset from cleanup-audio's hour"; 04:30 was already taken by retention-cleanup, so 04:45 keeps all three daily crons separated.
- Unknown-age objects (no updatedAt/createdAt) are never deleted — conservative reading of the age gate.
- The provider only passes an options object to Supabase's `.list()` when the caller supplied one — keeps existing call sites byte-identical at the client boundary, not just type-compatible.
- Defensive skips for non-3-level shapes (files at root or directly under `{companyId}/`) — the sweep only deletes at the depth whose full-key shape it can prove.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test helper's fake storage was not bucket-scoped**
- **Found during:** Task 2 (first test run)
- **Issue:** The initial fake StorageProvider served ONE prefix->entries map to both buckets, so the audio fixture leaked into the photos sweep (and vice versa) — 5 of the 8 cases failed on cross-bucket contamination (e.g. case (d)'s whatsapp audio fixture reappearing as an unprotected photos-bucket path).
- **Fix:** `makeStorage` now takes `{ audio?: {...}, photos?: {...} }` — independent trees per bucket, matching how the real cron always sweeps both buckets per run.
- **Files modified:** tests/unit/inngest/storage-orphan-cleanup.test.ts
- **Verification:** All 11 tests green after the fix.
- **Committed in:** `08474af1` (Task 2 commit — fixed before commit)

**2. [Rule 1 - Bug] Source-grep test tripped on the file's own doc comment**
- **Found during:** Task 2 (first test run)
- **Issue:** The "never calls supabase.storage" source assertion matched the literal string inside storage-orphan-cleanup.ts's own header comment documenting the convention.
- **Fix:** Reworded the comment ("NEVER call the Supabase Storage client directly"); the assertion now guards actual code, mirroring cleanup-audio-job.test.ts's identical check.
- **Files modified:** lib/inngest/functions/storage-orphan-cleanup.ts
- **Verification:** Test green; no functional change.
- **Committed in:** `08474af1` (Task 2 commit — fixed before commit)

**3. [Rule 1 - Bug] Existing supabase-provider list() fixtures lacked ids**
- **Found during:** Task 1 (storage suite run)
- **Issue:** The pre-existing test fixtures for `list()` had entries without an `id` field, which the new `isFolder = id == null` derivation classified as folders — a fixture-realism gap (real Supabase FileObject file entries always carry a non-null id).
- **Fix:** Gave the default fixtures explicit non-null ids and added a dedicated null-id folder-placeholder case.
- **Files modified:** tests/unit/storage/supabase-provider.test.ts
- **Verification:** 58/58 storage-suite tests green.
- **Committed in:** `68fc7f4f` (Task 1 commit — fixed before commit)

**4. [Rule 2 - Documentation consistency] Marked CAPT-01/02/03/05 complete in REQUIREMENTS.md on behalf of 169-01**
- **Found during:** State updates (after Task 3)
- **Issue:** 169-01's summary declares `requirements-completed: [CAPT-01, CAPT-02, CAPT-03, CAPT-05]` (verified shipped, commits `5b406cd4`/`49e918b5`/`84b6fda4`), but its executor never ran `requirements mark-complete` — leaving Phase 169 marked Complete in the roadmap while 4 of its 5 requirement checkboxes were unchecked.
- **Fix:** Ran `requirements mark-complete CAPT-01 CAPT-02 CAPT-03 CAPT-05` (this plan marked its own CAPT-04 separately).
- **Files modified:** .planning/REQUIREMENTS.md
- **Verification:** All 5 CAPT requirements now checked; traceability table updated by the tool.
- **Committed in:** this SUMMARY's docs commit

---

**Total deviations:** 3 auto-fixed (all Rule 1, all test-fidelity fixes caught by the tests themselves before any commit) + 1 documentation-consistency fix (Rule 2)
**Impact on plan:** None on production behavior — the three code deviations were test-harness corrections; the implementation matches the plan's interface exactly. The Rule 2 fix only reconciles planning metadata with already-verified 169-01 work.

## Issues Encountered

- **Shared-environment resource contention (same as 169-01).** Several other GSD phase executors (166-01, 166-02, 164-01) were committing to this repo and running their own suites concurrently throughout this session — their commits interleave with this plan's in `git log`, and their working-tree changes (`lib/services/generate-estimate.ts`, `lib/estimate/quality/consistency.ts`, snapshot files) were visible in `git status` the whole time. Consequences handled: (1) per-task staging was strictly file-by-file (never `git add .`) so no foreign changes entered this plan's commits — verified per-commit with `git show --stat`; (2) the full `npm test` wall-clock ballooned (still running at SUMMARY time; 43 min in 169-01 under identical conditions), so verification relied on the plan's own per-task automated gates plus the curated 21-file sweep, all green; (3) the one sweep failure (`generate-estimate-job.test.ts` import-timeout) was isolated-re-run twice, 6/6 green both times — the identical documented flake from 169-01.

## User Setup Required

None - no external service configuration required. The cron self-registers with Inngest Cloud on the next deploy sync (PUT to /api/inngest).

## Next Phase Readiness

- Phase 169 criterion 4 is TRUE: both buckets reconciled daily; price-book images, WhatsApp audio, and every row-referenced object are provably untouchable (protected-prefix hard skips + union matcher + defensive re-check, each regression-locked).
- CAPT-01..05 now all complete — phase 169 has no remaining plans.
- The `ListOptions`/`isFolder`/`createdAt` extension is available to any future bucket-walking consumer (e.g. an S3-provider parity implementation would need to map its own folder semantics — noted in the interface docs).

---
*Phase: 169-capture-upload-resilience*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: `lib/inngest/functions/storage-orphan-cleanup.ts`
- FOUND: `tests/unit/inngest/storage-orphan-cleanup.test.ts`
- FOUND: `lib/storage/index.ts` (extended) / `lib/storage/supabase-provider.ts` (extended)
- FOUND: `.planning/phases/169-capture-upload-resilience/169-02-SUMMARY.md`
- FOUND commit: `68fc7f4f` (Task 1)
- FOUND commit: `08474af1` (Task 2)
- FOUND commit: `f9586569` (Task 3)
- No stubs: implementation fully wired (cron registered in both entry points; no placeholder values, no TODO/FIXME, no unwired data paths)
