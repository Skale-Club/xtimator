---
phase: 188-server-wide-provider-selection-integrity
plan: 01
subsystem: infra
tags: [storage, r2, s3, supabase, vitest, provider-selection]

requires:
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "s3ConfigFromEnv() (lib/storage/s3-config.ts), proven-against-R2 lib/storage/s3-provider.ts, the Supabase read-through fallback in lib/storage/asset-source.ts"
provides:
  - "lib/storage/server.ts: serverStorageBackend() / getServerStorage() / serverStorage(client) — the single server-wide storage provider seam"
  - "lib/storage/index.ts stripped to a pure, browser-safe Supabase factory (createStorage(client) only)"
  - "4 production call sites + 1 script repointed from @/lib/storage to @/lib/storage/server with zero behavior change"
affects: [188-02-plan, 188-03-plan, 188-04-plan, 190, 191, 192]

tech-stack:
  added: []
  patterns:
    - "Single provider-decision function (serverStorageBackend()) instead of scattering STORAGE_PROVIDER reads across call sites"
    - "Lazy require() behind an exported __internal test seam, so production keeps a real synchronous require() while tests use vi.spyOn instead of vi.mock (works around a Vitest-only limitation, documented below)"

key-files:
  created:
    - lib/storage/server.ts
    - tests/unit/storage/server-provider.test.ts
  modified:
    - lib/storage/index.ts
    - app/api/health/route.ts
    - lib/actions/admin-whatsapp.ts
    - lib/estimate/adapters/whatsapp.ts
    - scripts/storage-smoke.ts
    - tests/unit/api/health.test.ts
    - tests/unit/whatsapp/replay-safe-ttl.test.ts
    - tests/unit/whatsapp/never-reply-regression.test.ts
    - tests/unit/whatsapp/batch-reporting.test.ts

key-decisions:
  - "serverStorageBackend() selection matrix: unset/unrecognized STORAGE_PROVIDER decides by S3_* completeness (r2 if complete, supabase if not); STORAGE_PROVIDER='supabase' is an explicit kill switch that always wins; STORAGE_PROVIDER='s3' with incomplete S3_* throws naming the missing var(s) instead of silently falling back"
  - "lib/storage/index.ts no longer exports getServerStorage() at all (not even a re-export from ./server) — a re-export would drag the AWS SDK and the service-role client back into the client module graph, defeating the bundling-hazard fix"
  - "lib/storage/asset-source.ts was intentionally left untouched — it keeps importing createStorage from ./index directly for its Supabase read-through fallback, per the plan's reversibility constraint"
  - "Added a lib/storage/server.ts __internal test seam (loadS3Provider/loadServiceClient) so tests/unit/storage/server-provider.test.ts can vi.spyOn the two lazy require() targets, because Vitest's SSR require() shim cannot resolve an extensionless local .ts specifier (a pre-existing, Vitest-only Node-CJS limitation, independent of vi.mock, that predates this plan — the previous getServerStorage() in index.ts had the identical structure and was never unit-tested for its require() dispatch, only fully mocked at the @/lib/storage module boundary by every consumer test)"

patterns-established:
  - "Server code must import { serverStorage, getServerStorage } from '@/lib/storage/server', never re-derive provider selection locally"
  - "New server call sites using createStorage(client) directly are a Plan 04 census failure, not a style choice"

requirements-completed: [PROV-01]

duration: ~75min
completed: 2026-08-06
---

# Phase 188 Plan 01: Server-Wide Provider Selection Integrity (seam) Summary

**Built `lib/storage/server.ts` as the single server-wide storage-backend decision point and stripped the equivalent, half-applied logic out of the browser-reachable `lib/storage/index.ts`, with zero behavior change at the 4 existing call sites.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-08-06T16:29:00Z (approx, first file read)
- **Completed:** 2026-08-06T17:44:39Z
- **Tasks:** 2/2 completed
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments

- `serverStorageBackend()` implements the full PROV-01 selection matrix (`STORAGE_PROVIDER` x `S3_*` completeness), including a loud throw — naming the missing var(s) — when `STORAGE_PROVIDER=s3` but the S3_* config is incomplete, instead of silently falling back to Supabase.
- `getServerStorage()` / `serverStorage(client)` moved out of `lib/storage/index.ts` (a module six `'use client'` components import) into the new `lib/storage/server.ts`, which is never imported by browser code.
- `lib/storage/index.ts` is now provably free of `s3-provider`, `@/lib/supabase/service`, and any environment-variable read — enforced by a suite assertion (`readFileSync` + string checks), not a shell grep that could silently stop being run.
- All 4 production call sites (`app/api/health/route.ts`, `lib/actions/admin-whatsapp.ts`, `lib/estimate/adapters/whatsapp.ts` x2) and `scripts/storage-smoke.ts` repointed to `@/lib/storage/server` — import-path-only changes, behavior unchanged.
- `scripts/storage-smoke.ts` now prints the real resolved backend via `serverStorageBackend()` instead of the previous `process.env.STORAGE_PROVIDER ?? 'supabase'` line, which had started misreporting the backend as soon as `S3_*`-alone selection existed (Phase 187).
- 4 test files (`health.test.ts`, `replay-safe-ttl.test.ts`, `never-reply-regression.test.ts`, `batch-reporting.test.ts`) had their `vi.mock('@/lib/storage', …)` target moved to `@/lib/storage/server`.

## Task Commits

1. **Task 1: Build lib/storage/server.ts — the single server-side provider seam** - `1a95ce01` (feat)
2. **Task 2: Strip getServerStorage from index.ts and repoint every consumer** - `4d160ef9` (feat)

_No plan-metadata-only commit yet — this SUMMARY/STATE update is the next commit._

## Files Created/Modified

- `lib/storage/server.ts` — new. Exports `StorageBackend`, `serverStorageBackend()`, `getServerStorage()`, `serverStorage(client)`, and a documented `__internal` test seam. No `import 'server-only'` (so `scripts/storage-smoke.ts` keeps working under plain `tsx`); server-ness enforced at runtime via `assertServer()` in every exported function. No module-level singleton — every call constructs its provider fresh.
- `lib/storage/index.ts` — `getServerStorage()` and its private `requireEnv()` helper deleted; header docblock rewritten to correct the stale "1-line swap" claim and to direct server code at `@/lib/storage/server`. Remaining surface: the `StorageProvider` type/interface, `createStorage(client)`, and the `./keys` re-exports.
- `app/api/health/route.ts`, `lib/actions/admin-whatsapp.ts`, `lib/estimate/adapters/whatsapp.ts` — import path only (`@/lib/storage` → `@/lib/storage/server`), call sites unchanged.
- `scripts/storage-smoke.ts` — import path updated; `provider` variable now comes from `serverStorageBackend()`; docblock updated to state `S3_*` alone is sufficient and `STORAGE_PROVIDER=s3` is optional (only needed to make an incomplete config fail loudly).
- `tests/unit/api/health.test.ts`, `tests/unit/whatsapp/replay-safe-ttl.test.ts`, `tests/unit/whatsapp/never-reply-regression.test.ts`, `tests/unit/whatsapp/batch-reporting.test.ts` — `vi.mock` target moved from `@/lib/storage` to `@/lib/storage/server`; no other changes.
- `tests/unit/storage/server-provider.test.ts` — new, 17 tests: full selection matrix (9 cases including the throw), the browser guard (3 cases, all 3 exported functions), `serverStorage(client)`/`getServerStorage()` delegation behavior (4 cases), and the `lib/storage/index.ts` purity assertion.

## Decisions Made

- **`getServerStorage()` is NOT re-exported from `lib/storage/index.ts`.** The plan explicitly forbids this (it would re-import the AWS SDK / service-role client into the client bundle graph), and the implementation follows that exactly — `index.ts` has zero references to `s3-provider`, `@/lib/supabase/service`, or any env read.
- **`lib/storage/asset-source.ts` was not touched.** Per the plan's hard constraint, it keeps calling `createStorage` from `./index` directly for its Supabase read-through fallback (PROXY-02) — this stays provider-unaware by design, preserving the milestone's reversibility guarantee.
- **`lib/storage/s3-provider.ts` was never opened for edit.** `git diff --stat lib/storage/s3-provider.ts` is empty at every checkpoint in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Vitest cannot resolve `require()` of an extensionless local `.ts` module — added an `__internal` test seam to `lib/storage/server.ts`**
- **Found during:** Task 1, first test run of the selection-matrix suite.
- **Issue:** The plan mandates lazy `require('./s3-provider')` / `require('@/lib/supabase/service')` (synchronous functions, AWS SDK off the cold path). Under Vitest, these calls throw `Cannot find module` — proven independent of `vi.mock` (a bare `require('./relative-path')` of a project `.ts` file fails identically from a plain test file with zero mocks in play; only an explicit `.ts` extension resolves, and Node has no path-alias awareness for `require()`). This is a pre-existing Vitest/Node-CJS limitation, not something this plan introduced: the previous `getServerStorage()` in `index.ts` had the exact same structure and was never unit-tested for its internal `require()` dispatch — every consumer test fully mocked `@/lib/storage` at the module boundary instead.
- **Fix:** Added a small, documented `__internal` object (`loadS3Provider` / `loadServiceClient`) that `buildS3Provider()` / `getServerStorage()` call instead of `require()` directly. Production behavior is byte-identical (still a real, synchronous, lazy `require()` at runtime, unchanged eslint-disable convention). Tests use `vi.spyOn(serverModule.__internal, 'loadS3Provider')` to intercept the dispatch without needing `require()` to resolve.
- **Files modified:** `lib/storage/server.ts`, `tests/unit/storage/server-provider.test.ts`.
- **Verification:** All 17 tests in `server-provider.test.ts` pass; `npx tsc -p tsconfig.ci.json --noEmit` and bare `npx tsc --noEmit` both report 0 errors.
- **Committed in:** `1a95ce01` (Task 1).

**2. [Rule 1 - Bug] `@vitest-environment node` pragma needed on the new test file**
- **Found during:** Task 1, first test run.
- **Issue:** The global Vitest config runs `jsdom`, where `window` is always defined — every call to `assertServer()`'s `typeof window !== 'undefined'` guard would spuriously throw in every test, not just the intended browser-guard tests.
- **Fix:** Added `// @vitest-environment node` at the top of `tests/unit/storage/server-provider.test.ts`; the browser-guard tests explicitly stub `globalThis.window` to simulate the browser case.
- **Files modified:** `tests/unit/storage/server-provider.test.ts`.
- **Verification:** All 17 tests pass with the correct guard behavior in both directions.
- **Committed in:** `1a95ce01` (Task 1).

**3. [Rule 1 - Bug] Purity-assertion docblock self-violation**
- **Found during:** Task 2, verify step.
- **Issue:** `lib/storage/index.ts`'s rewritten header docblock explained the removal of `getServerStorage()` using the literal substrings `STORAGE_PROVIDER`, `process.env`, and (later) `getServerStorage` in prose — tripping the file's own purity assertion and the plan's `<done>` grep check (`grep -rn "getServerStorage" lib/storage/index.ts` must return nothing).
- **Fix:** Reworded the docblock to describe the same facts without using the forbidden literal substrings (e.g. "the legacy provider-select env flag" instead of `STORAGE_PROVIDER`, "any environment-variable read" instead of `process.env`, "a default-provider factory" instead of naming `getServerStorage` in prose).
- **Files modified:** `lib/storage/index.ts`.
- **Verification:** `grep -n "getServerStorage" lib/storage/index.ts` returns nothing; `grep -n "s3-provider\|@/lib/supabase/service\|process\.env\|STORAGE_PROVIDER" lib/storage/index.ts` returns nothing; the purity-assertion test passes.
- **Committed in:** `4d160ef9` (Task 2).

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking-issue fixes, 1 Rule 1 bug fix — all test-infrastructure or documentation, zero production-behavior changes beyond what the plan specified).
**Impact on plan:** No scope creep. All three fixes were necessary to make the plan's own verification steps pass honestly; none touch `lib/storage/s3-provider.ts` or change runtime behavior at any of the 4 existing call sites.

## Issues Encountered

**Observed, non-reproducible full-suite flake in `tests/unit/mcp-route-contract.test.ts` (unrelated to this plan).** Across 4 full `npx vitest run tests/unit tests/eval` runs during verification (2 with this plan's changes applied, 1 with them `git stash`'d to a pre-change baseline, 1 more with changes re-applied), the assertion `GET returns 405 Method Not Allowed with Allow: POST header` in `tests/unit/mcp-route-contract.test.ts` failed in 2 of the 4 runs — including the baseline-adjacent runs both with and without this plan's changes present. That file's own source comments document it as timeout-sensitive "under vitest fork-pool contention" (raises its own `testTimeout` to 15s for exactly this reason) and it has zero references to storage, `@/lib/storage`, or any file this plan touches. Run in isolation, and run alongside this plan's new/modified test files specifically, it passed every time. This is a pre-existing, load-dependent flake, not a regression from this plan — documented here per the "report honestly" instruction rather than silently ignored. The final full-suite run used for sign-off (see Verification below) shows the FAIL set as exactly the two known CRLF-only migration-shape tests.

## User Setup Required

None — no external service configuration required. R2 stays fully dormant: no `S3_*` value, real or placeholder, was added to `.env.local`, Coolify, or any committed env file (`git status` shows no `.env*` change throughout this plan).

## Verification Record

- **Selection matrix (final, as implemented in `lib/storage/server.ts`):**

  | `STORAGE_PROVIDER` | `S3_*` complete? | Result |
  |---|---|---|
  | unset / unrecognized | yes | `'r2'` |
  | unset / unrecognized | no | `'supabase'` |
  | `'supabase'` | yes | `'supabase'` (explicit kill switch wins) |
  | `'supabase'` | no | `'supabase'` |
  | `'s3'` | yes | `'r2'` |
  | `'s3'` | no | **throws**, naming the missing var(s) |

  Only the exact strings `'s3'` and `'supabase'` are recognized; anything else (unset, empty string, a typo like `'S3'`) falls through to the `S3_*`-presence check.

- **`npx tsc -p tsconfig.ci.json --noEmit`:** 0 errors.
- **`npx tsc --noEmit` (bare):** 0 errors.
- **`git diff --stat lib/storage/s3-provider.ts`:** empty at every checkpoint (confirmed 3 separate times across this plan's execution).
- **Full-suite `npx vitest run tests/unit tests/eval` (final sign-off run, exit code captured directly, not through a pipe):** `Tests 2 failed | 5134 passed | 20 todo (5156)`, `VITEST_EXIT=1`. The exact `FAIL` line set:
  - `tests/unit/sign-estimate-atomic-migration.test.ts > sign_estimate_atomic migration (S2) — shape > is SECURITY DEFINER (a documented departure from save_estimate_atomic INVOKER) with search_path pinned`
  - `tests/unit/signature-evidence-retention-migration.test.ts > fix-pack F2, finding #2 — erase_company_for_compliance (GoTrue hard-delete escape hatch) > is SECURITY DEFINER with search_path pinned`

  Both are the pre-documented Windows-CRLF-only failures (pass in CI) — not regressions from this plan. No third `FAIL` line in this sign-off run.
- **`grep -rn "getServerStorage" lib/storage/index.ts`:** returns nothing.
- **`git status` `.env*` check:** no changes to any `.env*` file throughout this plan.

## Next Phase Readiness

Plans 02 and 03 can now import `serverStorage` / `getServerStorage` from `@/lib/storage/server` to migrate the remaining ~19 `createStorage(client)` server call sites (currently untouched, still on Supabase unconditionally — safe, matches today's behavior). Plan 04's static import-graph gate has a clean baseline to enforce against: `lib/storage/index.ts` is verified free of S3/service-role/env references, and a new server-side `createStorage` call site (instead of `serverStorage`) is now explicitly documented as a census failure in that file's own header.

No blockers for Plan 02/03/04.

## Self-Check: PASSED

All 12 files created/modified verified present on disk; both task commits (`1a95ce01`, `4d160ef9`) verified present in `git log`.

---
*Phase: 188-server-wide-provider-selection-integrity*
*Completed: 2026-08-06*
