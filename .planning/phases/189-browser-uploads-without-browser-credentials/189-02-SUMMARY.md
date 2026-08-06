---
phase: 189-browser-uploads-without-browser-credentials
plan: 02
subsystem: api
tags: [storage, upload-ticket, tenant-isolation, mutation-boundary-census, api-route]

# Dependency graph
requires:
  - phase: 189-01
    provides: "lib/storage/upload-ticket.ts — mintUploadTicket(), UPLOAD_TICKET_BUCKETS, normalizeUploadContentType(), the tenant-confined key module"
provides:
  - "POST /api/storage/upload-ticket — the caller-authorization half of UPLOAD-02: proves the caller (auth + active company + demo guard + project ownership) BEFORE Plan 01's key-confinement logic ever mints a ticket"
  - "Mutation-boundary census row for the new route, observed RED before being added"
affects: [189-03-client-migration, 189-04-regression-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-ordered route handler (400 shape -> 401 auth -> 403 demo -> 404 ownership -> 500 mint-throw), each gate cheaper/stricter than the next, mirroring app/storage/[bucket]/[...key]/route.ts's documented ordering"
    - "Cache-Control: private, no-store on every response including every refusal — a cached upload ticket is a reusable write authority"
    - "404-not-403 for cross-tenant project lookups (matches lib/storage/proxy-auth.ts's posture): the response never confirms the project exists"

key-files:
  created:
    - app/api/storage/upload-ticket/route.ts
    - tests/unit/storage/upload-ticket-route.test.ts
  modified:
    - tests/unit/demo/mutation-boundary-sweep.test.ts

key-decisions:
  - "companyId comes from getActiveCompanyId() exclusively — a body-supplied companyId field is never read anywhere in the route; a dedicated test asserts mintUploadTicket receives the auth-derived company even when the body carries a different tenant's UUID"
  - "Gate 1 (body shape) validates contentType via upload-ticket.ts's own normalizeUploadContentType() rather than letting an invalid type fall through to mintUploadTicket's internal throw — keeps the 400 path from ever reaching the mint call, and keeps the allowlist logic in exactly one place"
  - "No rate limiting / quota check on this route, documented as deliberate in the file header: a ticket costs one signature and no third-party call, and the write it authorizes is bounded to the single named key"
  - "Route test mocks lib/storage/upload-ticket wholesale (not vi.importActual) rather than importing the real module, so the suite never pulls in lib/storage/server.ts's assertServer() (which throws under jsdom's window) — sidesteps the need for a node environment override entirely"

requirements-completed: [UPLOAD-02]

# Metrics
duration: ~40min
completed: 2026-08-06
---

# Phase 189 Plan 02: The Upload-Ticket Route With Ordered Gates Summary

**`POST /api/storage/upload-ticket` — proves the caller (auth, active company, demo guard, project ownership) in cheapest-and-strictest-first order before Plan 01's tenant-confined key logic ever mints a ticket, registered in the mutation-boundary census as a guarded WRITE boundary after observing the census go RED without it.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2 completed
- **Files created:** 2 (route.ts, upload-ticket-route.test.ts)
- **Files modified:** 1 (mutation-boundary-sweep.test.ts, +1 manifest row)

## Accomplishments

- `app/api/storage/upload-ticket/route.ts` implements the exact 5-gate order from the plan: body shape (400) -> auth + active company (401) -> demo guard (403) -> project ownership under the RLS-bound client, 404-not-403 (404) -> mint, with any throw surfaced as a fixed 500 string and the real error only reaching `console.error`.
- 14 tests in `upload-ticket-route.test.ts` cover every refusal path with call-order proof, not just status codes: the demo-blocked case asserts `supabase.from` was never called (the project lookup never ran), every refusal case asserts `mintUploadTicket` was never called, the cross-tenant `companyId` body field is proven ignored by asserting what `mintUploadTicket` actually received, and the retry-key path is proven passed through unchanged.
- The mutation-boundary sweep was run BEFORE the manifest row was added and observed RED, with `app/api/storage/upload-ticket/route.ts#POST` appearing in `missing` (recorded below verbatim). After adding the row (alphabetically positioned among `app/api/...` entries — before the `stripe/` group, since `storage` < `stripe`), the sweep is green.
- Full `npx vitest run tests/unit tests/eval` run: exit code captured directly as `VITEST_EXIT=1` (never through a pipe) — the only two `FAIL` lines are the two known Windows/CRLF non-regressions this plan's instructions named in advance. `mcp-route-contract.test.ts` did not appear in the FAIL set this run (no flake observed), so no isolation re-run was needed.

## Task Commits

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | The upload-ticket route with ordered gates | `192dcb80` | `app/api/storage/upload-ticket/route.ts`, `tests/unit/storage/upload-ticket-route.test.ts` |
| 2 | Register the boundary and prove the census bites | `917454c7` | `tests/unit/demo/mutation-boundary-sweep.test.ts` |

The plan's own `<action>` for Task 2 said "Do not commit" (written for a scenario with concurrent sibling executors in this non-worktree-isolated repo). The orchestrator's spawn instructions for this run explicitly stated no sibling executor is currently active and directed an atomic commit per task, which takes precedence — both tasks are committed above.

## Observed RED Census Output (Part A)

Before the manifest row was added, running `npx vitest run tests/unit/demo/mutation-boundary-sweep.test.ts` against the newly created route produced:

```
 ❯ tests/unit/demo/mutation-boundary-sweep.test.ts (7 tests | 1 failed) 38ms
     × requires exact discovered-set equality with the explicit manifest 7ms

AssertionError: expected { duplicateManifestIds: [], ... } to deeply equal { duplicateManifestIds: [], ... }

  {
    "duplicateManifestIds": [],
-   "missing": [],
+   "missing": [
+     "app/api/storage/upload-ticket/route.ts#POST",
+   ],
    "stale": [],
  }

 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```

After adding the `guarded('app/api/storage/upload-ticket/route.ts', 'demoGuardResponse', ['POST'])` row: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

## Final Gate-Order Table

| Order | Gate | Trigger | Status | Body |
|---|---|---|---|---|
| 1 | Body parse + shape | missing/non-JSON body, `bucket` not in `UPLOAD_TICKET_BUCKETS`, non-UUID `projectId`, missing/unallowlisted `contentType`, non-string `key` | 400 | `{ error: '...' }` |
| 2 | Auth | no claims, or no active company | 401 | `{ error: 'Not authenticated' }` / `{ error: 'No company found' }` |
| 3 | Demo guard | caller is the demo principal | 403 | `{ error: 'demo_readonly', message }` (verbatim from `demoGuardResponse()`) |
| 4 | Project ownership | `projects` row not found for `(id, company_id)` under the RLS-bound client | 404 | `{ error: 'Not found' }` (never confirms existence) |
| 5 | Mint | `mintUploadTicket()` throws | 500 | `{ error: 'Could not issue upload ticket' }` (real error only `console.error`'d) |
| 5 | Mint | success | 200 | The exact `UploadTicket` object, verbatim |

Every response — success and every refusal — carries `Cache-Control: private, no-store`.

## Full-Suite Result (Part C)

```
VITEST_EXIT=1

 FAIL  tests/unit/sign-estimate-atomic-migration.test.ts > sign_estimate_atomic migration (S2) — shape > is SECURITY DEFINER (a documented departure from save_estimate_atomic INVOKER) with search_path pinned
 FAIL  tests/unit/signature-evidence-retention-migration.test.ts > fix-pack F2, finding #2 — erase_company_for_compliance (GoTrue hard-delete escape hatch) > is SECURITY DEFINER with search_path pinned

 Test Files  2 failed | 613 passed | 1 skipped (616)
      Tests  2 failed | 5217 passed | 20 todo (5239)
```

Both `FAIL` lines match exactly the two known Windows/CRLF non-regressions named in this plan's own instructions (they pass in CI). No other file failed. `mcp-route-contract.test.ts` did not appear in the FAIL set, so the documented fork-pool flake was not observed this run and no isolated re-run was required.

## Hard Constraints Verified

- `git diff --stat` against `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, `lib/storage/asset-source.ts`, and `lib/storage/upload-with-retry.ts` — all empty. None of the four protected files were touched.
- `grep -n "S3_" .env.local` — no matches. No `S3_*` values were added to `.env.local` (or, by construction, to Coolify — nothing in this plan's scope touches deploy config).
- The route authorizes the caller (auth + active company + demo guard + project ownership) before minting, and a client-supplied prior `key` is passed through to Plan 01's `mintUploadTicket`/`assertKeyInTenant` unchanged — validated there, never repaired or trusted by this route.

## Deviations from Plan

None — plan executed exactly as written, including the explicit RED-then-GREEN observation sequence for the census (Task 2 Part A/B) and the exact-string classification check (Task 2 Part C's third `<automated>` gate, run and passed).

## Issues Encountered

None. Both automated gates in Task 1 (`npx vitest run tests/unit/storage/upload-ticket-route.test.ts`, `npx tsc --noEmit -p tsconfig.ci.json`) passed on first attempt; Task 2's three automated gates (sweep, full-suite exit capture, classification check) all passed as designed.

## User Setup Required

None — no external service configuration required for this plan.

## Next Phase Readiness

- `POST /api/storage/upload-ticket` is live and fully gated; Plan 03 (client migration) can now call it from the three browser upload call sites (`capture-recorder.tsx`, `inline-audio-recorder.tsx`, `use-ai-input-submit.ts`) instead of each computing its own `storagePath` client-side.
- The mutation-boundary census now covers this endpoint explicitly (`guarded`/`demoGuardResponse`) and was proven to catch it going unguarded (the RED observation in Part A is the proof).
- `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, `lib/storage/asset-source.ts`, and `lib/storage/upload-with-retry.ts` remain exactly as Plan 01 left them — untouched, as required for Plan 03/04's own diff gates.

## Self-Check: PASSED

- FOUND: `app/api/storage/upload-ticket/route.ts`
- FOUND: `tests/unit/storage/upload-ticket-route.test.ts`
- FOUND: `guarded('app/api/storage/upload-ticket/route.ts', 'demoGuardResponse', ['POST'])` row in `tests/unit/demo/mutation-boundary-sweep.test.ts`
- FOUND commit `192dcb80` (`git log --oneline --all | grep 192dcb80`)
- FOUND commit `917454c7` (`git log --oneline --all | grep 917454c7`)

---
*Phase: 189-browser-uploads-without-browser-credentials*
*Completed: 2026-08-06*
