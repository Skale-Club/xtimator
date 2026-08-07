---
phase: 191-object-migration-verification
plan: 01
subsystem: infra
tags: [storage, r2, supabase, migration, vitest, tdd]

# Dependency graph
requires:
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: five provisioned R2 buckets, s3ConfigFromEnv(), StorageProvider/ListedObject interface with isFolder
  - phase: 188-server-wide-provider-selection-integrity
    provides: serverStorageBackend() selection matrix (the exact trap this plan avoids)
provides:
  - "MIGRATION_BUCKETS, walkSupabaseBucket, enumerateSource — recursive, paging-safe Supabase bucket enumeration"
  - "readSourceObject, normalizeContentType, compareObject, formatMigrationReport — per-object comparison + report rendering"
  - "buildSourceStorage() — the one call site pinning the source side to createStorage(requireServiceClient()), immune to S3_* env"
affects: [191-02, 191-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-side storage pinning: never call the R2-aware default-provider factories for a read that must stay Supabase regardless of S3_* env — construct createStorage(requireServiceClient()) directly, same as lib/storage/asset-source.ts"
    - "Depth-first recursive bucket walk with a page-count ceiling (MAX_PAGES) that throws rather than truncates on paging misbehavior"
    - "Comparison functions take plain descriptors (DestinationObject), not live provider calls, so they stay pure and testable without a real R2 client"

key-files:
  created:
    - scripts/r2-migrate.ts
    - tests/unit/storage/r2-migrate.test.ts
    - .planning/phases/191-object-migration-verification/deferred-items.md
  modified: []

key-decisions:
  - "PAGE_SIZE=100, MAX_PAGES=50 (5000-object ceiling) — production scale is 51 objects total, so the ceiling is intentionally unreachable in practice; hitting it means a provider bug, not real growth"
  - ".emptyFolderPlaceholder entries are real objects (isFolder:false, they have an id) and are included in enumeration, never filtered — filtering would make source/destination counts disagree by design"
  - "compareObject checks size before content type so the more severe finding wins the single-status slot; 'match' requires both equal"
  - "Source content type absent + destination application/octet-stream -> 'unknown-source-content-type' (WARN, not fatal); source absent + destination anything else -> 'content-type-mismatch' (real mismatch)"
  - "[EXTRA] rows (destination-only objects) are reported and counted but never flip allPassed to false — expected once Phase 188/189 route writes directly to R2, and is the W1 rollback signal per docs/STORAGE-MIGRATION.md"
  - "allPassed is computed from rows.every(r => r.label !== 'FAIL') inside formatMigrationReport, never accepted as a caller argument"

patterns-established:
  - "Pattern: any script that must talk to Supabase specifically during an R2-configured migration run constructs createStorage(requireServiceClient()) directly at one clearly-commented call site, never via lib/storage/server's default-provider factories"

requirements-completed: [MIG-02]

duration: 35min
completed: 2026-08-07
---

# Phase 191 Plan 01: Object Migration Verification (Source Enumeration + Comparison Engine) Summary

**Recursive, paging-safe Supabase bucket enumeration pinned away from R2 by construction, plus a pure per-object comparison engine that fails loudly on any size or content-type drift — including the extensionless-key case that is the whole reason MIG-02 exists.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-07T00:17:14Z
- **Tasks:** 2/2
- **Files modified:** 2 created (`scripts/r2-migrate.ts`, `tests/unit/storage/r2-migrate.test.ts`)

## Accomplishments

- `walkSupabaseBucket` recursively enumerates a Supabase bucket at any nesting depth, joining keys with `/`, skipping folder placeholder entries (`isFolder: true`) while recursing into them, paging via `limit`/`offset`, and throwing (naming bucket + prefix) if paging exceeds `MAX_PAGES=50` rather than silently truncating.
- `enumerateSource` walks all five migration buckets (`audio`, `photos`, `pdfs`, `logos`, `platform-brand`), returns a flat `{ bucket, key }[]` in bucket order plus a per-bucket count map, and propagates any `list()` rejection instead of swallowing it.
- `readSourceObject` reads the TRUE byte size and content type off the downloaded blob body (`blob.type`, `arrayBuffer().byteLength`) — never off the listing's stale `metadata.size` and never inferred from the key's extension, which matters because production keys such as `platform/1784854705622-kvwo24` have none.
- `compareObject` classifies exactly one status per pair — `match` / `missing` / `size-mismatch` / `content-type-mismatch` / `unknown-source-content-type` — with size checked before content type, and proves the extensionless-key failure mode explicitly: right bytes + `application/octet-stream` destination against an `image/jpeg` source is `content-type-mismatch`, never `match`.
- `formatMigrationReport` renders `[MATCH]/[COPIED]/[FAIL]/[WARN]/[EXTRA]` rows plus per-bucket count lines and a summary; `allPassed` is derived purely from the rows (`.every(r => r.label !== 'FAIL')`) so no caller can assert success independently of what the rows say. `[WARN]` and `[EXTRA]` render distinctly from `[MATCH]` and never flip `allPassed`.
- The source side is pinned to `createStorage(requireServiceClient())` via `buildSourceStorage()`, with the trap explained both in the file's top docblock and at the call site — proved by grep: zero hits for the R2-aware default-provider factory names, at least one `createStorage` hit.
- 31 passing unit tests against hand-rolled fake `StorageProvider`s — zero network calls, zero real credentials. Fault-injected the size-mismatch branch (`if (false && ...)`) before finalizing and confirmed 2 tests immediately failed with the exact wrong-status assertion, then reverted — the gate is provably capable of failing.

## Task Commits

1. **Tasks 1 + 2 (combined, single TDD pass): source enumeration + comparison engine** - `031edcf3` (feat)

Both tasks share the same two files and were built/tested together in one TDD cycle (write exports, write the 31-test suite exercising every walk/paging/placeholder/comparison/report behavior from the plan, run green, commit once). No intermediate red-state commit was made since the plan's `tdd="true"` tasks target the same file pair sequentially rather than a strict single-behavior RED/GREEN split.

## Files Created/Modified

- `scripts/r2-migrate.ts` — enumeration (`MIGRATION_BUCKETS`, `walkSupabaseBucket`, `enumerateSource`, `buildSourceStorage`) + comparison/report layer (`readSourceObject`, `normalizeContentType`, `compareObject`, `formatMigrationReport`) and their supporting types. No `main()` yet (Plan 02). No upload/delete call anywhere.
- `tests/unit/storage/r2-migrate.test.ts` — 31 tests across `walkSupabaseBucket`, `enumerateSource`, `readSourceObject`, `normalizeContentType`, `compareObject`, `formatMigrationReport`, using a local `fakeStorage()` helper where every unimplemented method throws by default.
- `.planning/phases/191-object-migration-verification/deferred-items.md` — created, documenting two out-of-scope failures observed during the mandated full-suite gate (see below).

## Decisions Made

See `key-decisions` in frontmatter. The one worth calling out: the grep verification gate in the plan (`grep -n "getServerStorage\|serverStorage(" scripts/r2-migrate.ts` must return nothing) is stricter than it first appears — it also catches the literal strings inside explanatory comments. The docblock and call-site comment were worded to explain the S3_*-inline trap without using those exact identifier substrings (referring instead to "the R2-aware default-provider factories … in `@/lib/storage/server`"), so the gate passes literally while the reasoning stays fully documented.

## Deviations from Plan

None — plan executed exactly as written. `buildSourceStorage()` is an addition beyond the plan's literal export list (`MIGRATION_BUCKETS`, `walkSupabaseBucket`, `enumerateSource`, `readSourceObject`, `normalizeContentType`, `compareObject`, `formatMigrationReport`), added because the plan's own trap section requires "a comment at the call site" pinning the source to `createStorage(requireServiceClient())`, and there is no `main()` yet in this plan to host that call site — `buildSourceStorage()` is that call site, ready for Plan 02's `main()` to call. This is additive only; it does not remove or change any required export.

## Issues Encountered

**Full-suite gate showed 4 failing files, not the 2 documented CRLF failures — investigated each:**

1. `sign-estimate-atomic-migration.test.ts`, `signature-evidence-retention-migration.test.ts` — the two documented pre-existing Windows-CRLF failures. Expected, not a regression.
2. `mcp-route-contract.test.ts` — failed inside the full run (405/Allow-header assertion), but passed 8/8 in isolation (`npx vitest run tests/unit/mcp-route-contract.test.ts`). Confirmed fork-pool-contention flake per the plan's own note, not a regression.
3. `storage-seam-census.test.ts` — 2 failing assertions naming `components/projects/inline-audio-recorder.tsx`, `components/workspace/ai-input-group/use-ai-input-submit.ts`, and `lib/storage/browser-upload.ts`. **None of these files appear in 191-01's diff.** Confirmed by isolated re-run showing the identical failure, and by `git status` showing those three files as uncommitted local modifications belonging to the concurrently-executing sibling plan 189-03 (browser upload components), which was mid-edit in the same working tree while this plan's full-suite gate ran. Logged to `deferred-items.md` rather than fixed — fixing it would mean editing files this plan was explicitly told not to touch, and it is 189-03's own responsibility to register its new call sites in `STORAGE_SEAM_MANIFEST`.

Zero failures in the full run named `r2-migrate`. `npx tsc --noEmit` showed transient errors in `tests/unit/storage/upload-ticket.test.ts` and `components/capture/capture-recorder.tsx` from the same concurrent sibling edit (also confirmed to self-resolve on re-run once the sibling agent's in-progress edit settled) — not caused by, or attributable to, this plan. The scoped CI gate `npx tsc -p tsconfig.ci.json --noEmit` was clean on the run used for this plan's conclusion.

## Known Stubs

None. `scripts/r2-migrate.ts` has no `main()` yet by design (Plan 02 adds it) — this is documented in the file's own top docblock and is not a stub of a promised behavior for this plan; Task 1's action explicitly instructs omitting the direct-execution guard "rather than reference an undefined symbol."

## User Setup Required

None — no external service configuration required. Nothing in this plan touches R2, and no env vars are read except the pre-existing `NEXT_PUBLIC_SUPABASE_URL` / service-role key (via `requireServiceClient()`, unchanged) and the `.env.local` dotenv load, which is a no-op when the file is absent.

## Next Phase Readiness

- Plan 02 can now build `main()` around `buildSourceStorage()`, `enumerateSource()`, and the HeadObject/GET side against R2, feeding real `DestinationObject` descriptors into the already-tested `compareObject`/`formatMigrationReport`.
- Plan 03 (runbook) can cite the `PAGE_SIZE`/`MAX_PAGES` values, the `.emptyFolderPlaceholder`-inclusion decision, and the `[WARN]`/`[EXTRA]` semantics directly from this summary's frontmatter.
- No blockers for 191-02/191-03 from this plan. The one open item outside this plan's control is `storage-seam-census.test.ts` staying red until sibling plan 189-03 registers its new call sites — tracked in `deferred-items.md`, not a 191 blocker.

---
*Phase: 191-object-migration-verification*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: scripts/r2-migrate.ts
- FOUND: tests/unit/storage/r2-migrate.test.ts
- FOUND: .planning/phases/191-object-migration-verification/deferred-items.md
- FOUND: commit 031edcf3
