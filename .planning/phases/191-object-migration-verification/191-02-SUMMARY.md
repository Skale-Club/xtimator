---
phase: 191-object-migration-verification
plan: 02
subsystem: infra
tags: [storage, r2, supabase, migration, vitest, aws-sdk-client-mock]

# Dependency graph
requires:
  - phase: 191-01
    provides: MIGRATION_BUCKETS, walkSupabaseBucket, enumerateSource, readSourceObject, compareObject, formatMigrationReport, buildSourceStorage()
provides:
  - "headDestinationObject/listDestinationKeys — R2 destination reads (HeadObjectCommand/ListObjectsV2Command) via a raw S3Client, since StorageProvider has no stat/head operation"
  - "copyObject/migrateBucket/runMigration — idempotent per-object copy+re-verify sequencing over MigrationDeps ({ sourceStorage, destStorage, s3Client })"
  - "parseArgs/main — the CLI surface: --verify-only, --bucket <name>, exit 0/1 contract, npm run migrate:r2"
affects: [191-03]

tech-stack:
  added: []
  patterns:
    - "MigrationDeps as an explicit injected bag ({ sourceStorage, destStorage, s3Client }) rather than module-level singletons, so tests supply fakes/mocks without vi.mock gymnastics"
    - "Raw S3Client kept alongside destStorage (a StorageProvider) specifically for HeadObject/ListObjectsV2 — the two operations StorageProvider cannot express — while all writes still go through destStorage.upload() (the proven, unmodified s3-provider.ts)"
    - "main(argv = process.argv.slice(2)) — argv is an optional parameter, not a hardcoded process.argv.slice(2) call in the body, so tests can call main(['--verify-only', ...]) without inheriting the test runner's own process.argv"
    - "vi.resetModules() + a fresh `await import('@aws-sdk/client-s3')` (mocked with a NEW mockClient()) is required whenever a test also vi.doMock()s a dependency of the module under test — resetModules busts ALL cached modules including third-party ones, so an S3Client mock built before the reset silently stops intercepting calls made by the freshly re-imported script"
    - "vi.spyOn(...).mockRestore() clears the spy's recorded call history — capture the value you need to assert (e.g. `exitSpy.mock.calls[0]?.[0]`) BEFORE calling mockRestore(), not after"

key-files:
  created: []
  modified:
    - scripts/r2-migrate.ts
    - tests/unit/storage/r2-migrate.test.ts
    - package.json

key-decisions:
  - "headDestinationObject treats HeadObject NotFound/404/NoSuchKey as absent (null); every other rejection (AccessDenied, network error, etc.) throws — swallowing an authorization failure as 'absent' would silently re-upload everything and report a migration it never actually verified"
  - "copyObject writes source.contentType RAW, never normalizeContentType()'d — normalization exists for comparison only (Plan 01 decision, preserved)"
  - "migrateBucket's write path always re-heads and re-compares after copyObject — a PutObject that returns success but doesn't land (or lands with different metadata) is reported [FAIL], never [COPIED], because 'the write succeeded' and 'the write landed correctly' are different claims"
  - "In --verify-only, copyObject is never called for any non-match status — verified by asserting zero PutObjectCommand calls across three distinct corruption scenarios (missing/size-mismatch/content-type-mismatch) run through main() itself, not just migrateBucket()"
  - "listDestinationKeys reuses MAX_PAGES=50 (Plan 01's existing ceiling) for its own continuation-token loop rather than introducing a second constant — same 'throw rather than silently truncate' posture, same unreachable-at-51-objects headroom"
  - "main()'s missing-S3_*-config error message intentionally avoids spelling the literal env var name S3_ACCESS_KEY_ID (points to lib/storage/s3-config.ts instead) — required by the plan's own grep gate (`grep -c \"S3_ACCESS_KEY_ID\" scripts/r2-migrate.ts` must be 0), which also caught a pre-existing usage-example line in the docblock carried over from Plan 01 that had never been checked against this exact gate before"
  - "main(argv: string[] = process.argv.slice(2)) — argv is an optional, test-overridable parameter rather than main() reading process.argv internally, because under vitest process.argv contains the test runner's own arguments (e.g. the test file path), which would make parseArgs() throw on every call to main() with no args"

requirements-completed: [MIG-01, MIG-02]

duration: 70min
completed: 2026-08-06
---

# Phase 191 Plan 02: Object Migration Verification (Destination Layer, Idempotent Copy, CLI) Summary

**The re-runnable `npm run migrate:r2` / `npm run migrate:r2 -- --verify-only` command: R2 HeadObject/ListObjectsV2 reads layered onto Plan 01's comparison engine, an unconditional-overwrite copy that always re-verifies after writing, and a CLI whose `--verify-only` mode is provably write-free even when it catches a deliberately corrupted destination object.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-08-06T20:45:25-04:00
- **Tasks:** 2/2
- **Files modified:** `scripts/r2-migrate.ts`, `tests/unit/storage/r2-migrate.test.ts`, `package.json`

## Accomplishments

- `headDestinationObject` reads HeadObject; a NotFound/404/NoSuchKey-shaped rejection resolves to `null` (absent), while any other rejection (proven with `AccessDenied`) throws instead of being silently treated as "absent" — the exact failure mode that would otherwise cause the script to re-upload everything on every run and report a clean migration it never verified.
- `listDestinationKeys` pages a destination bucket via `ListObjectsV2Command`'s `ContinuationToken`/`IsTruncated` protocol, sharing Plan 01's `MAX_PAGES=50` ceiling so an unhandled truncation can never silently under-report `[EXTRA]` objects.
- `copyObject` calls `destStorage.upload()` (the untouched, R2-proven provider from `lib/storage/s3-provider.ts`) with the source's RAW content type — proven via a captured `PutObjectCommand` asserting both `ContentType` and the exact body bytes.
- `migrateBucket` sequences, per object: read source -> head destination -> compare -> (`match` -> `[MATCH]`, done) / (`verifyOnly` -> `[FAIL]` or `[WARN]`, `copyObject` never called) / (otherwise -> copy, re-head, re-compare -> `[COPIED]` only on a second match, `[FAIL]` otherwise) -> sweep `ListObjectsV2` for `[EXTRA]` destination-only keys.
- **Idempotency proven directly**: a second-pass scenario where all 3 objects already match asserts `s3Mock.commandCalls(PutObjectCommand)` has length exactly 0, alongside a mixed scenario (2 match + 1 absent) asserting exactly 1 `PutObjectCommand` call, for the absent key only.
- **Corruption drill proven through `main()` itself, not just the library functions** — three separate scenarios (HeadObject `NotFound` / a destination 1 byte off / a destination reporting `application/octet-stream` against a source `image/jpeg`, the extensionless-key case) each assert `exitCode === 1`, zero `PutObjectCommand` calls, and the `[FAIL]` label appearing in the printed report; a fourth scenario where everything matches asserts `exitCode === 0` and the text ending with `ALL OBJECTS VERIFIED`.
- `parseArgs` rejects an unrecognized flag and a `--bucket` value outside the five provisioned buckets by throwing (never silently ignoring), and `main()` prints the report before calling `process.exit` (proven via a call-order assertion, not just documented).
- `npm run migrate:r2` / `npm run migrate:r2 -- --verify-only` added next to the existing `verify:r2` entry — no other `package.json` change.
- 56/56 tests pass in `tests/unit/storage/r2-migrate.test.ts` (31 from Plan 01 + 25 new), zero real credentials, zero network calls.

## Task Commits

1. **Tasks 1 + 2 (combined, single pass): destination layer + idempotent copy + CLI + exit-code contract** - `a4dbc3ea` (feat)

Both tasks touch the same file pair (`scripts/r2-migrate.ts`, `tests/unit/storage/r2-migrate.test.ts`) plus `package.json`, and were built and tested together in one TDD cycle — same combined-commit rationale 191-01 used for its own two tasks.

## Files Modified

- `scripts/r2-migrate.ts` — added `MigrationDeps`, `MigrationOptions`, `headDestinationObject`, `listDestinationKeys`, `copyObject`, `migrateBucket`, `runMigration`, `parseArgs`, `main`, and the direct-execution guard. Rewrote the file's top docblock to cover MIG-01/MIG-02, the never-deletes guarantee, the `--` requirement for `npm run migrate:r2 -- --verify-only`, the flag surface, and the report row vocabulary.
- `tests/unit/storage/r2-migrate.test.ts` — added `aws-sdk-client-mock` fixtures (`FAKE_ENV`, `config`, `s3Mock`, `sourceStorageWithObjects`, `buildDeps`) and 25 new tests across `headDestinationObject`, `copyObject`, `migrateBucket`/`runMigration`, `parseArgs`, and `main()` (missing config + the four-scenario corruption drill + print-before-exit ordering).
- `package.json` — added `"migrate:r2": "npx tsx scripts/r2-migrate.ts"` immediately after the existing `"verify:r2"` entry. No other line changed.

## CLI Surface (for Plan 03's runbook — quote verbatim)

```
npm run migrate:r2                                # full write pass, all 5 buckets
npm run migrate:r2 -- --verify-only                # zero writes, report-only
npm run migrate:r2 -- --bucket photos              # restrict to one bucket
npm run migrate:r2 -- --verify-only --bucket logos # combine both
```

- The `--` before any flag is LOAD-BEARING: `npm run migrate:r2 --verify-only` (no `--`) silently swallows the flag as an npm option and runs a full WRITE pass instead.
- `--bucket` accepts exactly one of the five migration buckets (`audio`, `photos`, `pdfs`, `logos`, `platform-brand`); any other value throws, naming the five valid buckets. `--bucket` is not repeatable — pass it once.
- Any unrecognized flag (e.g. a typo'd `--delete-extra`) throws rather than being ignored.
- Exit code: `0` when every row is non-`FAIL` (an `[EXTRA]` or `[WARN]` row does NOT cause a non-zero exit); `1` when `s3ConfigFromEnv()` returns `null` (missing/empty S3_* config) OR when any row is `[FAIL]`.
- The report is always printed to stdout BEFORE the process exits, so a failing run is diagnosable from the terminal without re-running.

## Report Row Vocabulary (verbatim from Plan 01 + this plan)

- `[MATCH]` — source and destination already agree on size + content type. No write.
- `[COPIED]` — the object was written this run, and the post-write re-read confirmed it landed correctly. Never emitted in `--verify-only`.
- `[WARN]` — `unknown-source-content-type`: the source object never recorded a content type AND the destination's content type is the generic `application/octet-stream` fallback. Not fatal.
- `[EXTRA]` — a destination key with no source counterpart (a `ListObjectsV2` sweep result). Not fatal — expected once Phase 188/189 route writes directly to R2, and it is the rollback copy-back list.
- `[FAIL]` — anything else: `missing` (destination absent), `size-mismatch`, `content-type-mismatch`, OR a `--write-mode` copy whose post-copy re-read does not match. Any `[FAIL]` row flips `allPassed` to `false` and the process exit code to `1`.

## Decisions Made

See `key-decisions` in frontmatter. The one worth flagging beyond the list: the plan's own grep invariant (`grep -c "S3_ACCESS_KEY_ID" scripts/r2-migrate.ts` must be `0`) caught a line that had been sitting in the file's docblock since Plan 01 (`S3_ACCESS_KEY_ID=<key-id>` in the usage example) — Plan 01's own verification didn't include this specific grep, so it went unnoticed until Plan 02's gate ran against it. Reworded the usage example to describe the two credential vars by role (pointing at `lib/storage/s3-config.ts` for exact names) instead of spelling the literal identifier, preserving the operator-facing information without tripping the discipline gate.

## Deviations from Plan

**1. [Rule 3 - blocking issue] `main()`'s `argv` parameter made optional/injectable rather than reading `process.argv` internally.**
- **Found during:** Task 2, writing `main()`'s tests.
- **Issue:** The plan's action block shows `main(): Promise<void>` calling `parseArgs(process.argv.slice(2))` internally. Under `vitest`, `process.argv` contains the test runner's own arguments (e.g. the test file path), so `parseArgs` would throw on every `main()` call in a test — including the plan's own required "s3ConfigFromEnv() returning null -> exits 1" test.
- **Fix:** `main(argv: string[] = process.argv.slice(2))` — the default preserves real CLI behavior exactly; tests call `main(['--verify-only', ...])` explicitly. Documented in the function's own docblock comment.
- **Files modified:** `scripts/r2-migrate.ts`
- **Commit:** `a4dbc3ea`

**2. [Rule 3 - blocking issue] Fixed a pre-existing `S3_ACCESS_KEY_ID` literal in the file's usage-example docblock (carried over from Plan 01) that violated this plan's own grep invariant.**
- **Found during:** Running this plan's mandated verification step 4 (invariants).
- **Issue:** `grep -c "S3_ACCESS_KEY_ID" scripts/r2-migrate.ts` returned `1`, not the required `0` — the hit was in the Plan-01-authored usage example, not in any code I added.
- **Fix:** Reworded the usage example to reference the two credential vars by role, pointing at `lib/storage/s3-config.ts` for the exact names, instead of spelling the literal env var identifier.
- **Files modified:** `scripts/r2-migrate.ts`
- **Commit:** `a4dbc3ea`

**3. [Rule 3 - blocking issue] `vi.resetModules()` + fresh `@aws-sdk/client-s3` re-import required for the `main()`-level corruption-drill tests.**
- **Found during:** Task 2, first attempt at testing `main()`'s corruption drill via `vi.doMock('@/lib/storage', ...)`.
- **Issue:** `vi.doMock` on an already-cached dependency (`@/lib/storage`, already imported by earlier tests in the same file) requires `vi.resetModules()` to take effect on the next dynamic import. But `vi.resetModules()` also busts the cached `@aws-sdk/client-s3` module, so the file-level `s3Mock` (patched onto the pre-reset `S3Client` class) stopped intercepting calls made by the freshly re-imported `scripts/r2-migrate.ts` — all four corruption-drill tests initially failed with "process.exit: 0 calls" even though `main()` was completing normally.
- **Fix:** After `vi.resetModules()`, import `@aws-sdk/client-s3` fresh (via `await import(...)`) and build a NEW `mockClient()` on THAT instance, before dynamically importing `scripts/r2-migrate.ts` — guaranteeing both reference the same `S3Client` class. Documented as a reusable pattern in `key-decisions`.
- **Files modified:** `tests/unit/storage/r2-migrate.test.ts`
- **Commit:** `a4dbc3ea`

**4. [Rule 3 - blocking issue] `vi.spyOn(...).mockRestore()` was clearing spy call history before assertions ran.**
- **Found during:** Same debugging session as deviation 3, after fixing the module-registry issue — the corruption-drill tests still failed with "0 calls" even after the fix above.
- **Issue:** The test helper called `exitSpy.mockRestore()` before returning the spy object to the calling test for assertion; `mockRestore()` both restores the original implementation AND clears the mock's recorded call history, so `expect(exitSpy).toHaveBeenCalledWith(1)` always saw zero calls regardless of what actually happened.
- **Fix:** Capture the needed value (`exitSpy.mock.calls[0]?.[0]`) into a plain `exitCode` variable BEFORE calling `mockRestore()`, and assert on that plain value instead of the (by-then-restored) spy.
- **Files modified:** `tests/unit/storage/r2-migrate.test.ts`
- **Commit:** `a4dbc3ea`

All four deviations are test-infrastructure/documentation fixes; none touch `lib/storage/s3-provider.ts`, `index.ts`, or `asset-source.ts`, and none change the shipped script's runtime behavior beyond the `argv` parameter default (which is behavior-preserving for real CLI invocations).

## Issues Encountered

**Full-suite gate (`npx vitest run tests/unit tests/eval`, 5418 tests, 215s):** 2 failed, 5396 passed, 20 todo. Both failures are the documented pre-existing Windows/CRLF migration-shape failures (`tests/unit/sign-estimate-atomic-migration.test.ts`, `tests/unit/signature-evidence-retention-migration.test.ts`) — environmental, not caused by this plan. Zero failures named `r2-migrate`. The `mcp-route-contract.test.ts` fork-pool-contention flake noted in 191-01's summary did NOT reproduce on this run.

**Bare `npx tsc --noEmit` (full, unscoped):** 15 pre-existing errors, all in `scripts/upload-ticket-smoke.ts`, `tests/unit/storage/browser-credential-gate.test.ts`, and `tests/unit/storage/upload-ticket.test.ts` — the concurrently-executing sibling plan (189-04)'s in-progress edits in the same working tree (confirmed via `git status`: those files show as modified/untracked and are not part of this plan's diff). Zero errors named `r2-migrate.ts`. The scoped CI gate `npx tsc -p tsconfig.ci.json --noEmit` was clean.

## Known Stubs

None. `main()` is fully wired: `parseArgs` -> `s3ConfigFromEnv()` -> build `deps` -> `runMigration` -> print -> exit. No placeholder branches, no hardcoded empty values reaching the report.

## User Setup Required

None for this plan. `npm run migrate:r2` and `npm run migrate:r2 -- --verify-only` require the operator's scoped R2 credential supplied inline on the command line at RUN time (Plan 03's operator step) — nothing in this plan reads or requires any env var to be present in `.env.local`, Coolify, or anywhere else in the repo.

## Next Phase Readiness

- Plan 03 (the operator runbook, `docs/STORAGE-MIGRATION.md`) can now document the exact CLI surface, flag semantics, and report row vocabulary directly from this summary — both are stated verbatim above specifically so the doc and the script cannot drift silently.
- No blockers for 191-03 from this plan. `lib/storage/s3-provider.ts` is byte-identical to its pre-phase state (`git diff --stat` empty), confirmed both before and after the docblock fix.

---
*Phase: 191-object-migration-verification*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: scripts/r2-migrate.ts (headDestinationObject/listDestinationKeys/copyObject/migrateBucket/runMigration/parseArgs/main all present)
- FOUND: tests/unit/storage/r2-migrate.test.ts (56/56 passing)
- FOUND: package.json migrate:r2 entry
- FOUND: commit a4dbc3ea
