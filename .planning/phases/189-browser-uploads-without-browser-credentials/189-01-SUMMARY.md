---
phase: 189-browser-uploads-without-browser-credentials
plan: 01
subsystem: infra
tags: [storage, s3, r2, supabase-storage, presigned-url, upload-ticket, tenant-isolation]

# Dependency graph
requires:
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "s3ConfigFromEnv() (the single S3_* env mapping), verified R2 settings, PROXY-03 tenant-ownership gate pattern (assertKeyInTenant mirrors canReadPrivateKey's reject-never-repair posture)"
  - phase: 188-server-wide-provider-selection-integrity
    provides: "serverStorageBackend() — the ONE server-wide r2/supabase decision this module dispatches on"
provides:
  - "lib/storage/upload-ticket.ts: server-derived, tenant-confined storage key (deriveUploadKey/assertKeyInTenant) and dual-backend upload-ticket minting (mintUploadTicket) for both R2 (s3-presigned-put) and Supabase (supabase-signed-upload) backends"
  - "Confirmed 3-site browser upload census (all targeting the audio bucket), distinct from the 4 browser getSignedUrl READ sites that belong to Phase 190"
  - "Confirmed the exact frozen key literal `{companyId}/{projectId}/{uuid}.{ext}` matches all three production call sites byte-for-byte"
  - "Confirmed @supabase/storage-js's uploadToSignedUrl ignores its contentType option in its Blob/FormData branch — ticket's contentType field is not decoration, Plan 03 must re-stamp the Blob with it"
affects: [189-02-mint-route, 189-03-client-migration, 189-04-regression-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated-union upload ticket (s3-presigned-put | supabase-signed-upload) instead of one universal raw PUT, driven by a verified SDK content-type-handling difference between backends"
    - "signableHeaders override on @aws-sdk/s3-request-presigner's getSignedUrl to pin Content-Type into the R2 signature (the SDK excludes content-type from signing by default)"
    - "reject-never-repair key validation (assertKeyInTenant), mirroring Phase 187's canReadPrivateKey/normalizeProxyKey posture"

key-files:
  created:
    - lib/storage/upload-ticket.ts
    - tests/unit/storage/upload-ticket.test.ts
  modified:
    - tests/unit/storage/storage-seam-census.test.ts

key-decisions:
  - "Kept the frozen key shape {companyId}/{projectId}/{uuid}.{ext} byte-for-byte — verified against the literal expressions in all three call sites (capture-recorder.tsx:897, inline-audio-recorder.tsx:144, use-ai-input-submit.ts:112); no discrepancy found, so no STOP was needed"
  - "Used @aws-sdk/s3-request-presigner's `signableHeaders: new Set(['content-type'])` option to override the SDK's default exclusion of content-type from the signature — without it, Content-Type never appears in X-Amz-SignedHeaders and UPLOAD-03's content-type pin would be unenforced"
  - "Extended storage-seam-census.test.ts's EXEMPT set to include lib/storage/upload-ticket.ts's raw `supabase.storage.from(bucket).createSignedUploadUrl(key)` call — createSignedUploadUrl is not part of the StorageProvider interface, and the plan explicitly forbids widening that interface to add a write-presign method, so this raw call is the seam itself for signed-upload-URL minting, not an escape hatch"

requirements-completed: [UPLOAD-02, UPLOAD-03]

# Metrics
duration: ~35min
completed: 2026-08-06
---

# Phase 189 Plan 01: Server-Derived Tenant-Confined Upload Tickets Summary

**Server-only `lib/storage/upload-ticket.ts` deriving/validating the frozen `{companyId}/{projectId}/{uuid}.{ext}` audio key and minting dual-backend (R2 presigned-PUT / Supabase signed-upload) tickets with content type pinned into the signature — no route wiring yet.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files created:** 2 (upload-ticket.ts, upload-ticket.test.ts)
- **Files modified:** 1 (storage-seam-census.test.ts, deviation fix)

## Accomplishments

- `normalizeUploadContentType`, `deriveUploadKey`, `assertKeyInTenant` implemented and tested against every case in the plan's behavior spec, including CRLF header-injection, `..` traversal, cross-tenant rejection, backslashes, `%`-encoded traversal, NUL bytes, and the 200-char length cap.
- `mintUploadTicket` dispatches on `serverStorageBackend()` (never re-reads `STORAGE_PROVIDER`/`S3_*` itself), returns a correctly-shaped ticket for both backends, re-tickets a valid existing key on retry without minting a second object, and refuses (never repairs) a foreign-tenant key.
- Confirmed via direct AST/source read that `@aws-sdk/s3-request-presigner`'s `S3RequestPresigner.prepareRequest` always adds `content-type` to `unsignableHeaders` by default — discovered this while writing the R2-mode test (it failed first, as intended per the plan's "prove the gate can fail" instruction), then fixed by passing `signableHeaders: new Set(['content-type'])` to `getSignedUrl`'s options, which the SDK's `getCanonicalHeaders` explicitly allows to override the unsignable exclusion.
- Verified the frozen key literal against all three call sites' actual source (not assumed): all three build `${companyId}/${projectId}/${recordingId or fileNameId}.${ext}` identically — no discrepancy to report.

## Task Commits

**No commits were made.** Per this plan's own `<verification>` section: "Do not commit — sibling agents are executing concurrently in this worktree and a commit here would race theirs." This project runs GSD executors in-place (no git worktree isolation on Windows — see project memory `project_gsd_worktree_pathlen`), so multiple Task agents may be writing to this same repo concurrently. All work is present in the working tree, uncommitted, for the phase orchestrator to commit once all wave-1 sibling plans are done.

## Files Created/Modified

- `lib/storage/upload-ticket.ts` (372 lines) — `UPLOAD_TICKET_BUCKETS`, `normalizeUploadContentType`, `deriveUploadKey`, `assertKeyInTenant`, `mintUploadTicket`, `UploadTicket` discriminated union. `import 'server-only'` at the top (safe here — nothing imports this module under bare `tsx`, unlike `server.ts`/`s3-config.ts`).
- `tests/unit/storage/upload-ticket.test.ts` (515 lines, 45 tests) — full coverage of both tasks' behavior specs, zero real credentials/network calls (presigning is pure crypto; Supabase mode uses a hand-rolled fake client).
- `tests/unit/storage/storage-seam-census.test.ts` — one-line `EXEMPT` set addition + comment (deviation, see below).

## Decisions Made

- Content-type pin required overriding the AWS SDK's default `signableHeaders` behavior — documented inline in `upload-ticket.ts` with the exact mechanism (`S3RequestPresigner.prepareRequest` unconditionally excludes `content-type`; `signableHeaders` is the sanctioned override).
- `assertKeyInTenant` rejects any `%` in the last key segment outright rather than attempting selective decoding — matches the plan's explicit "decode-then-check is a trap" instruction and Phase 187's `normalizeProxyKey` precedent.
- 900-second ticket expiry reasoning (3-attempt retry ladder + mobile-network multi-minute upload, one-object blast radius) written into the code comment, not just the plan, per the plan's explicit instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `signableHeaders` override to the R2 presign call**
- **Found during:** Task 2, writing the R2-mode ticket test
- **Issue:** The plan's `<behavior>` requires "the URL contains ... `content-type` inside `X-Amz-SignedHeaders`". Without any extra option, `@aws-sdk/s3-request-presigner` always excludes `content-type` from the signature (verified by reading `S3RequestPresigner.prepareRequest` in `node_modules/@aws-sdk/s3-request-presigner`, which unconditionally calls `unsignableHeaders.add("content-type")`). The initial implementation's first test run failed exactly as expected, proving the test could fail on bad output.
- **Fix:** Passed `signableHeaders: new Set(['content-type'])` in the presign options — `@smithy/signature-v4`'s `getCanonicalHeaders` explicitly checks `signableHeaders` as an override for headers otherwise excluded, so this puts `content-type` into `X-Amz-SignedHeaders` and ties it into the signature, exactly satisfying UPLOAD-03 ("cannot be defeated by a client sending a different type").
- **Files modified:** `lib/storage/upload-ticket.ts`
- **Verification:** `tests/unit/storage/upload-ticket.test.ts`'s "returns a presigned PUT ticket with the content type pinned into the signature" test passes; asserts `X-Amz-SignedHeaders` contains `content-type` directly against a real (locally-computed, no network) presigned URL.

**2. [Rule 1 - Bug/regression] Extended `storage-seam-census.test.ts`'s raw `.storage.from()` exemption set**
- **Found during:** running the full `npx vitest run tests/unit tests/eval` suite as instructed
- **Issue:** `tests/unit/storage/storage-seam-census.test.ts`'s "finds zero raw `.storage.from(` calls outside the one legitimate adapter holder" test flagged `lib/storage/upload-ticket.ts`'s `args.supabase.storage.from(bucket).createSignedUploadUrl(key)` call — a call the plan's own `<interfaces>`/`<action>` sections mandate. `createSignedUploadUrl` is not part of the `StorageProvider` interface (`createStorage()`/`serverStorage()` only expose `upload`/`download`/`getSignedUrl` (read)/`getPublicUrl`/`delete`/`list`), and the plan explicitly forbids widening that interface ("do not add a presign method to the StorageProvider interface"). This is therefore a second legitimate holder of the raw call, not an escape hatch bypassing the seam.
- **Fix:** Added `lib/storage/upload-ticket.ts` to the test's `EXEMPT` set with an inline comment explaining why, updated the assertion failure message accordingly.
- **Files modified:** `tests/unit/storage/storage-seam-census.test.ts`
- **Verification:** `npx vitest run tests/unit/storage/storage-seam-census.test.ts` — 8/8 tests pass. Full `tests/unit tests/eval` suite re-run afterward with only the two known Windows-CRLF non-regressions failing (see below).

---

**Total deviations:** 2 auto-fixed (1 blocking — Rule 3, 1 bug/regression — Rule 1)
**Impact on plan:** Both were necessary for the plan's own stated correctness requirements (UPLOAD-03's content-type pin; a passing full test suite). No scope creep — no other files touched, no architectural changes.

## Issues Encountered

- Full `npx vitest run tests/unit tests/eval` run (redirected to a file, exit code captured on the next line, never piped) showed 2 failing test files:
  - `tests/unit/sign-estimate-atomic-migration.test.ts` — known non-regression (CRLF; passes in CI per this plan's verification instructions).
  - `tests/unit/signature-evidence-retention-migration.test.ts` — known non-regression (same CRLF cause).
  Both were pre-existing and unrelated to this plan's changes; confirmed by name against the instructions' explicit allowlist. No other files failed.
- `tests/unit/mcp-route-contract.test.ts` re-run in isolation (`npx vitest run tests/unit/mcp-route-contract.test.ts`) to rule out the documented fork-pool flake: 8/8 passed, exit 0. Not a regression.
- Final full-suite result: 2 failed (both known non-regressions) | 612 passed | 1 skipped (615 files); 2 failed | 5203 passed | 20 todo (5225 tests). Exit code captured via `echo $? > file` on the line immediately after the redirected run, per instructions (never through a pipe).

## User Setup Required

None — no external service configuration required for this plan. (The R2 bucket CORS prerequisite documented in this phase's CONTEXT.md is an operator step for a later cutover plan in this phase, not something this plan's code touches.)

## Next Phase Readiness

- `lib/storage/upload-ticket.ts` exports exactly the interface Plan 02 needs (`mintUploadTicket`, `UPLOAD_TICKET_BUCKETS`, `UploadTicket` type) to wire a route handler that authorizes `projectId` against the caller's `companyId` before calling in.
- Confirmed unreferenced by any route or client module (`grep` across `app/` and `components/` found zero references) — satisfies this plan's own verification item 3 ahead of Plan 02/04.
- No commits made in this run (see Task Commits above) — the phase orchestrator or a subsequent step must commit `lib/storage/upload-ticket.ts`, `tests/unit/storage/upload-ticket.test.ts`, and the `storage-seam-census.test.ts` deviation together, alongside this SUMMARY, once concurrent sibling plans (189-02/03/04) are also ready.

## Self-Check: PASSED

- FOUND: `lib/storage/upload-ticket.ts`
- FOUND: `tests/unit/storage/upload-ticket.test.ts`
- FOUND: `UPLOAD_TICKET_BUCKETS` export in `lib/storage/upload-ticket.ts`
- FOUND: `mintUploadTicket` export in `lib/storage/upload-ticket.ts`
- FOUND: `lib/storage/upload-ticket.ts` exemption added to `tests/unit/storage/storage-seam-census.test.ts`
- No commit hashes to verify — no commits were made this run (see Task Commits section; this plan's own `<verification>` explicitly forbids committing due to concurrent sibling-plan execution in this non-worktree-isolated repo).

---
*Phase: 189-browser-uploads-without-browser-credentials*
*Completed: 2026-08-06*
