---
phase: quick
plan: 260623-gbr
subsystem: tests
tags: [typescript, test-mocks, branding, xphere]
dependency_graph:
  requires: []
  provides: [GBR-01, GBR-02]
  affects: [tests/unit/notifications/account-emails.test.ts, tests/unit/xphere-client.test.ts]
tech_stack:
  added: []
  patterns: [additive mock field expansion]
key_files:
  modified:
    - tests/unit/notifications/account-emails.test.ts
    - tests/unit/xphere-client.test.ts
  created: []
decisions:
  - "source: 'xtimator' auto-added to makePayload() — tsc revealed it was also missing from XphereSyncPayload alongside pipeline (Rule 1 auto-fix)"
metrics:
  duration: "3 minutes"
  completed: "2026-06-23"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260623-gbr: Fix TypeScript Errors in Test Mocks Summary

**One-liner:** Added 5 missing `Branding` fields to 4 mock locations in account-emails.test.ts and added `pipeline` + `source` to the `XphereSyncPayload` mock in xphere-client.test.ts so `tsc --noEmit` and both test suites pass clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add missing Branding fields to account-emails.test.ts mocks | 5d9c3279 | tests/unit/notifications/account-emails.test.ts |
| 2 | Add missing pipeline field to xphere-client.test.ts opportunity mock | 5d9c3279 | tests/unit/xphere-client.test.ts |

## What Was Done

**Task 1 — account-emails.test.ts:**
Four locations in the file returned `Branding`-shaped objects missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl` (all added as `null`). The top-level `vi.mock` factory at lines 4–13 was also missing `landingContent` (added as `{} as never`). All four locations updated.

**Task 2 — xphere-client.test.ts:**
The `makePayload()` function's `opportunity` object was missing the `pipeline: string` field added in commit `a78848eb`. Added `pipeline: 'Xtimator Lifecycle'`. TypeScript then revealed that `source: 'xtimator'` (a required top-level field on `XphereSyncPayload`) was also absent — added as a Rule 1 auto-fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `source` field in xphere-client.test.ts makePayload()**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** After adding `pipeline`, tsc still reported `Property 'source' is missing` — the `source: 'xtimator'` top-level field on `XphereSyncPayload` was absent from `makePayload()`. The plan only called out `pipeline` because the tsc error message only mentioned it, but `source` was equally missing.
- **Fix:** Added `source: 'xtimator'` as the first field in the return object of `makePayload()`.
- **Files modified:** tests/unit/xphere-client.test.ts
- **Commit:** 5d9c3279

## Verification Results

```
npx tsc --noEmit --project tsconfig.json | grep -E "account-emails|xphere-client"
→ NO_ERRORS_IN_THESE_FILES

npx vitest run tests/unit/notifications/account-emails.test.ts tests/unit/xphere-client.test.ts
→ Test Files  2 passed (2)
→ Tests  30 passed (30)
```

## Known Stubs

None — both files are test-only mock fixes with no production data paths.

## Threat Flags

None — test-only files; no production surface introduced.

## Self-Check: PASSED

- [x] tests/unit/notifications/account-emails.test.ts — modified, commit 5d9c3279
- [x] tests/unit/xphere-client.test.ts — modified, commit 5d9c3279
- [x] Both commits verified: `git log --oneline | grep 5d9c3279` ✓
