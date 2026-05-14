---
phase: 57-enforcement-layer
plan: "01"
subsystem: quota-enforcement
tags: [quota, billing, api-routes, tdd]
dependency_graph:
  requires: [lib/quota.ts (Phase 56), lib/entitlements.ts (Phase 55)]
  provides: [QUOTA-03 enforcement on generate-estimate, QUOTA-04 enforcement on analyze-photos, QUOTA-06 consistent 402 body]
  affects: [app/api/generate-estimate/route.ts, app/api/analyze-photos/route.ts]
tech_stack:
  added: []
  patterns: [TDD RED-GREEN, crypto.randomUUID for idempotency keys, checkQuota-before-AI + recordUsage-after-success]
key_files:
  created:
    - tests/unit/api/generate-estimate-quota.test.ts
    - tests/unit/api/analyze-photos-quota.test.ts
  modified:
    - app/api/generate-estimate/route.ts
    - app/api/analyze-photos/route.ts
decisions:
  - requestId generated at handler top (before try or inside at top) so it is available in catch-free success path only
  - checkQuota placed after companyId resolved and before request.json() parse (generate-estimate) and before photos fetch (analyze-photos)
  - recordUsage placed strictly after AI call success — failed AI calls never consume quota
  - Authenticated supabase client (createClient) used for both quota functions in web routes; service role not needed since companyId from RLS-accessible companies table
  - vi.resetAllMocks() in beforeEach requires explicit re-application of rateLimit + getIntegrationKey mocks per test suite
metrics:
  duration: 8min
  completed: "2026-05-13"
  tasks: 3
  files: 4
---

# Phase 57 Plan 01: Quota Enforcement on AI Routes Summary

**One-liner:** Wire checkQuota-before-AI + recordUsage-after-success into generate-estimate and analyze-photos routes, returning HTTP 402 with plan_limit_reached body on quota exceeded.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — test stubs for quota enforcement (RED) | d33f276 | tests/unit/api/generate-estimate-quota.test.ts, tests/unit/api/analyze-photos-quota.test.ts |
| 2 | Enforce QUOTA-03 on generate-estimate route (GREEN) | f738baa | app/api/generate-estimate/route.ts, tests/unit/api/generate-estimate-quota.test.ts |
| 3 | Enforce QUOTA-04 on analyze-photos route (GREEN) | 20f29d5 | app/api/analyze-photos/route.ts, tests/unit/api/analyze-photos-quota.test.ts |

## Success Criteria Verified

1. POST /api/generate-estimate with allowed=false returns HTTP 402 + { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' } — proven by Test A
2. POST /api/analyze-photos with allowed=false returns the same 402 body — proven by Test A
3. generateEstimateForProject not called when quota exceeded — proven by Test B
4. recordUsage called after successful AI calls with correct args — proven by Test C (both routes)
5. recordUsage not called when AI call fails — proven by Test D (generate-estimate)
6. All pre-existing tests unaffected (16 pre-existing failures, unchanged)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.resetAllMocks() cleared rateLimit/getIntegrationKey mock implementations**
- **Found during:** Task 2 (generate-estimate) and Task 3 (analyze-photos)
- **Issue:** The plan's test pattern used vi.resetAllMocks() in beforeEach without re-applying module-level mock defaults. This caused rateLimit to return undefined, throwing inside the route handler before reaching checkQuota.
- **Fix:** Changed beforeEach to async; added `const { rateLimit } = await import('@/lib/ratelimit')` + `vi.mocked(rateLimit).mockResolvedValue(...)` after resetAllMocks. Same pattern applied to getIntegrationKey in analyze-photos test.
- **Files modified:** tests/unit/api/generate-estimate-quota.test.ts, tests/unit/api/analyze-photos-quota.test.ts
- **Commit:** f738baa, 20f29d5

## Known Stubs

None — both routes are fully wired. checkQuota and recordUsage are real calls to lib/quota.ts; no placeholder logic.

## Self-Check: PASSED

- app/api/generate-estimate/route.ts — FOUND
- app/api/analyze-photos/route.ts — FOUND
- tests/unit/api/generate-estimate-quota.test.ts — FOUND
- tests/unit/api/analyze-photos-quota.test.ts — FOUND
- Commit d33f276 — FOUND
- Commit f738baa — FOUND
- Commit 20f29d5 — FOUND
