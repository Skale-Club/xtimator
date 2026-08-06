---
phase: 188-server-wide-provider-selection-integrity
plan: 02
subsystem: storage
tags: [storage, r2, s3, supabase, vitest, provider-selection, admin-actions]

requires:
  - phase: 188-server-wide-provider-selection-integrity
    plan: 01
    provides: "lib/storage/server.ts: serverStorageBackend() / getServerStorage() / serverStorage(client) seam"
provides:
  - "13 tenant-facing storage call sites (10 files) in app/admin/*/actions.ts and lib/actions/* resolved through the server-wide provider selection"
  - "Per-site RLS-loss comment naming the real app-level authorization guard at each of the 10 user-scoped sites"
affects: [188-03-plan, 188-04-plan, 190, 191, 192]

tech-stack:
  added: []
  patterns:
    - "serverStorage(client) at every user-scoped call site, with an inline comment naming the guard that becomes the sole authorization gate once R2 activates"

key-files:
  created: []
  modified:
    - app/admin/branding/actions.ts
    - app/admin/landing/actions.ts
    - app/admin/seo/actions.ts
    - lib/actions/admin-company.ts
    - lib/actions/client.ts
    - lib/actions/company.ts
    - lib/actions/photo.ts
    - lib/actions/price-book.ts
    - lib/actions/recording.ts
    - lib/actions/settings.ts
    - tests/unit/admin/save-seo.test.ts
    - tests/unit/landing-actions.test.ts
    - tests/unit/actions/delete-photo-lock-guard.test.ts
    - tests/unit/demo/auth-action-boundaries.test.ts
    - tests/unit/branding-actions.test.ts
    - tests/unit/seo-actions.test.ts

key-decisions:
  - "All 10 user-scoped sites had a genuine app-level guard already in place (assertWritable(), requireAdmin(), or an authenticated-user check scoping the path to the caller's own id) — no STOP-CONDITION blocker found."
  - "[Rule 1 - Bug] Added @vitest-environment node to tests/unit/branding-actions.test.ts and tests/unit/seo-actions.test.ts (not in the plan's named test list) — lib/storage/server.ts's assertServer() throws whenever `window` is defined, true under Vitest's default jsdom environment regardless of mocking. These two pre-existing suites mock the Supabase client's storage.from() directly rather than the factory module, so converting their actions to serverStorage() broke them; the Node environment pragma (the same fix Plan 01 used in server-provider.test.ts) lets the real Supabase-mode delegation run as designed."

requirements-completed: [PROV-01]

duration: ~90min
completed: 2026-08-06
---

# Phase 188 Plan 02: Server-Wide Provider Selection Integrity (admin/action call sites) Summary

**Converted all 13 tenant-facing storage call sites across 10 `app/admin/*/actions.ts` / `lib/actions/*` files from `createStorage(client)` to `serverStorage(client)`, annotating every user-scoped site with the real app-level guard that becomes the sole authorization gate once R2 activates — zero STOP-CONDITION findings, zero behavior change with `S3_*` absent.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-08-06T17:45:00Z (approx, first file read)
- **Completed:** 2026-08-06T18:25:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 16 (10 source, 6 test)

## Accomplishments

- 3 service-role sites (`app/admin/branding/actions.ts`, `app/admin/landing/actions.ts`, `app/admin/seo/actions.ts`) — mechanical factory swap, no RLS to lose (service-role client bypasses RLS regardless of backend).
- 10 user-scoped sites across 7 `lib/actions/*` files — each converted to `serverStorage(supabase)` with an inline comment naming the real guard that governs it (table below).
- `lib/actions/price-book.ts` kept its `buildStorageKey` import from `@/lib/storage` unchanged, per the plan — only the factory moved.
- Zero `createStorage(` calls remain in any of the 10 converted files; all import `serverStorage` from `@/lib/storage/server`.

## Task Commits

1. **Task 1: Convert the 13 call sites onto serverStorage()** - `19921b09` (feat)
2. **Task 2: Repoint affected test mocks + fix a jsdom regression the conversion exposed** - `a826a19d` (test)

## Files Created/Modified

- `app/admin/branding/actions.ts`, `app/admin/landing/actions.ts`, `app/admin/seo/actions.ts` — import + call site swapped to `serverStorage`. Service-role client; no RLS-loss comment needed (service role already bypasses RLS).
- `lib/actions/admin-company.ts`, `client.ts`, `company.ts`, `photo.ts`, `price-book.ts`, `recording.ts`, `settings.ts` — 10 user-scoped call sites converted, each with the RLS-loss comment.
- `tests/unit/admin/save-seo.test.ts`, `landing-actions.test.ts`, `actions/delete-photo-lock-guard.test.ts` — `vi.mock('@/lib/storage', ...)` repointed to `vi.mock('@/lib/storage/server', ...)`, `createStorage` → `serverStorage`.
- `tests/unit/demo/auth-action-boundaries.test.ts` — mock repointed to `@/lib/storage/server`/`serverStorage`; the SAFE-02 source-text regex updated from `/createStorage\s*\(|auth\.updateUser\s*\(/` to `/serverStorage\s*\(|auth\.updateUser\s*\(/` and proven to still match (evidence below).
- `tests/unit/branding-actions.test.ts`, `tests/unit/seo-actions.test.ts` — `// @vitest-environment node` pragma added (deviation, see below).

## Guard Table (STOP-CONDITION check — all 10 user-scoped sites)

| File | Function | Guard relied upon once R2 is active |
|---|---|---|
| `lib/actions/admin-company.ts` | `createAdminCompany` | `requireAdmin()` at the top of the action |
| `lib/actions/client.ts` | `uploadClientLogoAction` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/company.ts` | `uploadOnboardingLogoAction` | authenticated-user check (`supabase.auth.getUser()`) + `assertWritable()`; storage path is scoped to `userData.user.id` |
| `lib/actions/photo.ts` | `uploadProjectPhoto` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/photo.ts` | `deletePhoto` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/price-book.ts` | `createPriceBookItem` | explicit `assertWritable()` call in the action body |
| `lib/actions/price-book.ts` | `updatePriceBookItem` | explicit `assertWritable()` call in the action body |
| `lib/actions/recording.ts` | `deleteRecording` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/settings.ts` | `updateCompanySettings` | `getAuthContext()`'s `assertWritable()` + `getActiveCompanyId()` company-membership validation |
| `lib/actions/settings.ts` | `updateProfile` | explicit `assertWritable()` call in the action body |

**STOP-CONDITION blocker: none found.** Every one of the 10 user-scoped sites already had a genuine app-level authorization guard preceding the storage effect — confirmed by reading each function body, not assumed. No tenant-isolation hole to flag for the phase verifier.

## `auth-action-boundaries` regex evidence

After renaming the SAFE-02 source-text regex from `/createStorage\s*\(|auth\.updateUser\s*\(/` to `/serverStorage\s*\(|auth\.updateUser\s*\(/`, ran it against `updateProfile`'s function body extracted from the live `lib/actions/settings.ts` source:

```
matches: [ 'serverStorage(', 'serverStorage(', 'auth.updateUser(' ]
count: 3
```

(One match is the RLS-loss doc comment's own prose mention of `serverStorage()`, one is the real call site, one is the pre-existing `auth.updateUser(` alternative — all after the `assertWritable()` guard, preserving the guard-before-effect contract.) The regex is confirmed non-vacuous; the test suite (`tests/unit/demo/auth-action-boundaries.test.ts`) passes with it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tests/unit/branding-actions.test.ts` and `tests/unit/seo-actions.test.ts` broke — added `@vitest-environment node`**
- **Found during:** Task 2, full-suite verification run.
- **Issue:** `lib/storage/server.ts`'s `assertServer()` throws unconditionally when `typeof window !== 'undefined'` — true under Vitest's default `jsdom` test environment regardless of any `vi.mock`. These two pre-existing test suites (predating this plan; `branding-actions.test.ts` was explicitly flagged by the plan itself as "run it; only touch it if it fails") mock the Supabase service client's `storage.from()` directly rather than mocking `@/lib/storage` or `@/lib/storage/server` at the module boundary — they exercise the real Supabase-mode delegation. Converting `app/admin/branding/actions.ts` and `app/admin/seo/actions.ts` to call `serverStorage()` made every test in both suites throw at the `assertServer()` guard before ever reaching the mocked client.
- **Fix:** Added `// @vitest-environment node` at the top of both files — the same fix Plan 01 applied to `tests/unit/storage/server-provider.test.ts` for the identical reason. This lets the real `serverStorage()` → `serverStorageBackend()` → `createStorage(client)` delegation run exactly as the plan intended ("with S3_* absent, serverStorage(svc) delegates to that same client, so it should pass unchanged").
- **Files modified:** `tests/unit/branding-actions.test.ts`, `tests/unit/seo-actions.test.ts`.
- **Verification:** Both suites pass in isolation and in the full run; no other assertions changed.
- **Committed in:** `a826a19d` (Task 2).

**Total deviations:** 1 auto-fixed (test-infrastructure only; zero production-behavior change). `tests/unit/seo-actions.test.ts` was not in the plan's named Task 2 file list — it is a second, older test suite for `app/admin/seo/actions.ts` (parallel to `tests/unit/admin/save-seo.test.ts`) discovered only because it broke; fixing it follows the "sweep for any other test coupled to a converted module" instruction and Rule 1 (auto-fix bugs directly caused by this task's changes).

## Concurrent-execution note (not a deviation, not a regression)

A sibling agent executed Plan 188-03 (PDF/share/WhatsApp-delivery/Inngest call sites) in the same working tree at the same time. Two interim full-suite runs during this plan's Task 2 verification showed transient `FAIL` lines in files entirely within 188-03's scope (`lib/queries/share.ts`, `lib/pdf/render-estimate-pdf.ts`, `lib/whatsapp/pdf-delivery.ts` and their test files) — the same `assertServer()`-in-jsdom class of issue, but in files this plan's `files_modified` list does not include. Per the explicit instruction to touch only this plan's file set, these were left untouched. The sibling's Task 1 and Task 2 commits (`292685ff`, and subsequent test fixes) resolved them before this plan's final sign-off run — see below.

## Issues Encountered

**`tests/unit/mcp-route-contract.test.ts` flaked in the final full-suite run** (`GET returns 405 Method Not Allowed with Allow: POST header`), reproducing the exact non-reproducible fork-pool-contention flake documented in the 188-01 SUMMARY. Re-run in isolation (`npx vitest run tests/unit/mcp-route-contract.test.ts`): all 8 tests pass. Confirmed pre-existing and unrelated to this plan — the file has zero references to storage or any file this plan touches.

## User Setup Required

None. No `S3_*` value, real or placeholder, was added to `.env.local`, Coolify, or any committed env file (`git status -- '.env*'` clean throughout). `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, and `lib/storage/asset-source.ts` are all untouched (`git diff --stat` empty for all three).

## Verification Record

- **Task 1 node check** (`createStorage(` absent, `serverStorage(` present, `@/lib/storage/server` imported, in all 10 files): exits 0, "all 10 files converted".
- **`npx tsc -p tsconfig.ci.json --noEmit`:** 0 errors.
- **`npx tsc --noEmit` (bare):** 0 errors.
- **Final full-suite `npx vitest run tests/unit tests/eval` (sign-off run, exit code captured directly):** `Tests 3 failed | 5137 passed | 20 todo (5160)`, `VITEST_EXIT=1`. The `FAIL` line set:
  - `tests/unit/mcp-route-contract.test.ts` — confirmed pre-existing fork-pool-contention flake, passes in isolation (8/8), unrelated to this plan.
  - `tests/unit/sign-estimate-atomic-migration.test.ts` — pre-documented Windows-CRLF-only failure, passes in CI.
  - `tests/unit/signature-evidence-retention-migration.test.ts` — pre-documented Windows-CRLF-only failure, passes in CI.

  No FAIL line from any file in this plan's `files_modified` list.
- **`git status -- '.env*'`:** clean.
- **`git diff --stat lib/storage/s3-provider.ts lib/storage/index.ts lib/storage/asset-source.ts`:** empty for all three.

## Next Phase Readiness

Plans 03 (in progress, concurrent — PDF/share/WhatsApp-delivery/Inngest) and 04 (static import-graph gate) proceed unblocked. All 10 files this plan touched are on `serverStorage()`; the remaining ~6 call sites outside both plans' scope are 188-03's responsibility. No blockers raised.

## Self-Check: PASSED

All 16 files created/modified verified present on disk; both task commits (`19921b09`, `a826a19d`) verified present in `git log`. Re-verified explicitly after SUMMARY creation: all 17 paths (16 files + this SUMMARY) FOUND, both commit hashes FOUND.

---
*Phase: 188-server-wide-provider-selection-integrity*
*Completed: 2026-08-06*
