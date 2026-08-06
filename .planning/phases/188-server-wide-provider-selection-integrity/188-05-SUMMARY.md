---
phase: 188-server-wide-provider-selection-integrity
plan: 05
subsystem: testing
tags: [storage, r2, s3, supabase, whatsapp, vitest, provider-selection, regression-proof]

requires:
  - phase: 188-server-wide-provider-selection-integrity
    provides: "lib/storage/server.ts (Plan 01) — the single server-wide storage seam; the ~19 remaining server call sites repointed to it (Plans 02/03)"
provides:
  - "tests/unit/storage/whatsapp-media-single-backend.test.ts — end-to-end proof that with R2 configured, an inbound WhatsApp image/audio message is written to R2 by the adapter and read back from R2 (the exact same key) by the admin inbox reader, with Supabase Storage categorically unreachable on that path (a poisoned .storage getter throws if anything escapes to it)"
  - "The same proof for the reversibility leg: with S3_* removed, the identical write/read path resolves Supabase, the fake R2 store stays empty, and the AWS SDK presigner is never called"
  - "A static pin of the 3 estimate-pipeline photo readers (admin-whatsapp.ts, render-estimate-pdf.ts, share.ts) to '@/lib/storage/server', asserting none call createStorage( directly"
affects: []

tech-stack:
  added: []
  patterns:
    - "Anti-silent-pass test mechanism: a mocked Supabase client whose `.storage` property is a GETTER that throws a distinctive error the instant it is read, so a regression that quietly falls back to Supabase produces a loud, named failure instead of a merely-different (but still plausible) result"
    - "Test-only bypass for the lib/storage/server.ts __internal require() seam (see Plan 01) via vi.spyOn, returning the REAL createS3StorageProvider (imported normally, so it runs against the mocked AWS SDK) and the mocked requireServiceClient — established precedent from tests/unit/storage/server-provider.test.ts, reused here rather than reinvented"

key-files:
  created:
    - tests/unit/storage/whatsapp-media-single-backend.test.ts
  modified: []

key-decisions:
  - "Drove the REAL makeWhatsAppAdapter(...).ingest(state) and the REAL loadAdminConversationThread(...) — not hand-rolled fakes of either. Only the AWS SDK (@aws-sdk/client-s3, @aws-sdk/s3-request-presigner), the WhatsApp Cloud API client (@/lib/whatsapp/client), the AI primitives (@/lib/ai/openrouter-client), the admin gate (@/lib/auth/admin-context), and the Supabase service client (@/lib/supabase/service) are mocked — lib/storage/server.ts, lib/storage/s3-provider.ts, and lib/whatsapp/media.ts run unmodified."
  - "Used the Plan 01-established __internal test seam (vi.spyOn on loadS3Provider/loadServiceClient) to work around a pre-existing, Vitest-only Node-CJS limitation: require('./s3-provider') and require('@/lib/supabase/service') both throw 'Cannot find module' under Vitest's SSR require() shim, independent of vi.mock (proven with a scratch test before writing the real file — see Deviations). This is a TEST-ONLY workaround; loadS3Provider is pointed at the REAL createS3StorageProvider (a normal, working `import`), so the real s3-provider.ts code still runs, just against the mocked AWS SDK beneath it."
  - "Part B (the 3-reader pin) is deliberately static, not a third end-to-end drive — booting the @react-pdf render graph is not worth it to re-prove a property the R2-leg end-to-end test already guarantees, and Plan 04's storage-seam-census import-graph gate independently proves the full reader set is complete. Documented as a decision in the test file's own comment, not an omission."

patterns-established:
  - "A poisoned-property (throwing getter) test double is the pattern for proving 'code path X never reaches subsystem Y' — stronger than asserting the call count on Y's methods, because it also catches a bare property read with no method call."

requirements-completed: [PROV-03]

duration: ~90min
completed: 2026-08-06
---

# Phase 188 Plan 05: WhatsApp Inbound Media Single-Backend Proof Summary

**One new test file (`tests/unit/storage/whatsapp-media-single-backend.test.ts`, 12 tests) drives the real WhatsApp adapter and the real admin-inbox reader end-to-end against a mocked AWS SDK + poisoned Supabase client, proving R2-configured writes and reads land on the identical key and Supabase Storage is never touched — then proves the reversibility twin and pins the 3 estimate-pipeline photo readers to the seam.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 2/2 completed
- **Files modified:** 1 created (test-only; no production code changed)

## Accomplishments

- **The concrete split-brain case is now covered by a test that fails when it recurs.** With `S3_*` stubbed to fake values, `makeWhatsAppAdapter(...).ingest(state)` writes an inbound image to `photos/{companyId}/whatsapp/{projectId}-{mediaId}.{ext}` and an inbound audio to `audio/{companyId}/whatsapp/{msgId}.{ext}` in the in-memory R2 store; `loadAdminConversationThread(...)` signs URLs for rows whose `media_url` holds those exact keys, and the captured `PutObjectCommand.Key` is asserted equal to the key embedded in the presigned URL — "the reader looks where the writer wrote," not merely "both used R2."
- **The anti-silent-pass mechanism is real and was proven to fire.** The mocked Supabase service client's `.storage` property is a getter that throws `'Supabase Storage reached while R2 is configured'` the instant it's read. A dedicated test reads it directly to prove the mechanism itself works, then the R2-leg tests reaching completion without that error is the proof no call escaped to Supabase.
- **The reversibility twin is executable, not editorial.** With all four `S3_*` vars stubbed to `''`, `serverStorageBackend()` returns `'supabase'`, the identical adapter `ingest` call uploads through a captured Supabase Storage stub (the fake R2 store stays empty, 0 `PutObjectCommand`s), and the reader mints its signed URL via `createSignedUrl` on the same stub — the presigner mock (`@aws-sdk/s3-request-presigner`) is never invoked.
- **All 3 estimate-pipeline photo readers are pinned to the seam** (`lib/actions/admin-whatsapp.ts`, `lib/pdf/render-estimate-pdf.ts`, `lib/queries/share.ts`) via a static source-scan asserting each imports from `'@/lib/storage/server'` and none call `createStorage(` directly.
- **The Part C sabotage proved the test can fail.** Temporarily reverting `lib/actions/admin-whatsapp.ts`'s reader to the exact pre-188 shape (`createStorage(requireServiceClient())` instead of `getServerStorage()`) turned 3 of the 12 tests RED — reverted immediately, `git diff` on that file confirmed clean afterward.

## Task Commits

1. **Task 1: Write→read on R2, with Supabase Storage poisoned** (plus Task 2's additions, committed together as the file was built incrementally against the full spec before the first commit) - `c7937e16` (test)

_No separate Task 2 commit — Task 2 added the reversibility-twin `describe` block and the static reader-pin `describe` block to the same file created in Task 1; both were present before the single commit was made (Part C's sabotage/revert produced no net diff to commit). Plan-metadata commit (this SUMMARY + STATE + ROADMAP) follows._

## Files Created/Modified

- `tests/unit/storage/whatsapp-media-single-backend.test.ts` — new, 12 tests across 3 `describe` blocks:
  - `WhatsApp inbound media — single-backend proof (R2 configured)` (6 tests): backend resolution, image write, audio write, reader-signs-same-keys, poison-getter-never-fires (+ mechanism self-check), Put-Key-equals-signed-URL-key.
  - `WhatsApp inbound media — reversibility twin (S3_* removed, Supabase)` (3 tests): backend resolution, writer uses Supabase (R2 store empty), reader uses Supabase (presigner never called).
  - `estimate-pipeline photo readers are pinned to the seam` (3 tests): one per reader file, static source-scan.

## Decisions Made

See `key-decisions` in frontmatter. Summarized: drove the real adapter/reader code (no hand-rolled fakes); reused the Plan 01 `__internal` test seam via `vi.spyOn` to work around a pre-existing Vitest-only `require()` limitation (not a new problem — same one Plan 01's own SUMMARY documented and worked around in `server-provider.test.ts`); kept the 3-reader pin static per the plan's own stated rationale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `lib/storage/server.ts`'s lazy `require()` calls don't resolve under Vitest — reused Plan 01's `__internal` test seam via `vi.spyOn`**
- **Found during:** Task 1, first attempt to drive `getServerStorage()` in both `'r2'` and `'supabase'` mode.
- **Issue:** `lib/storage/server.ts` calls `require('./s3-provider')` and `require('@/lib/supabase/service')` lazily (by design — keeps the AWS SDK off the cold path). Vitest's SSR `require()` shim cannot resolve either specifier — `Cannot find module './s3-provider'` / `Cannot find module '@/lib/supabase/service'` — independent of `vi.mock`, which only intercepts `import`/dynamic `import()`, never a literal `require()` call. This is the EXACT same limitation Plan 01's own SUMMARY documented (deviation #1) and worked around in `tests/unit/storage/server-provider.test.ts`, which is why `lib/storage/server.ts` exports a documented `__internal` object (`loadS3Provider` / `loadServiceClient`) specifically for `vi.spyOn` in tests. Proven with a throwaway scratch test file (`tests/unit/storage/_scratch-require-check.test.ts`, deleted before writing the real file) before committing to this approach.
- **Fix:** `vi.spyOn(storageServer.__internal, 'loadS3Provider').mockReturnValue({ createS3StorageProvider })` where `createS3StorageProvider` is imported via a normal, working `import { createS3StorageProvider } from '@/lib/storage/s3-provider'` — so the REAL `s3-provider.ts` code still runs, just against the mocked AWS SDK underneath it (which the plan already calls for). Same pattern for `loadServiceClient`, pointed at the already-mocked `requireServiceClient` from `@/lib/supabase/service`. Neither `lib/storage/server.ts` nor `lib/storage/s3-provider.ts` was edited.
- **Files modified:** `tests/unit/storage/whatsapp-media-single-backend.test.ts` only.
- **Verification:** All 12 tests pass; `git diff --stat lib/storage/s3-provider.ts` and `git diff --stat lib/storage/server.ts` both empty.
- **Committed in:** `c7937e16`.

**Impact on plan:** No scope creep, no production-code changes. The workaround is purely test infrastructure, reusing a seam Plan 01 built and documented for exactly this purpose.

## Part C — the sabotage RED output (verbatim, key lines)

Command: temporarily changed `lib/actions/admin-whatsapp.ts`'s import from `getServerStorage` (`@/lib/storage/server`) to `createStorage` (`@/lib/storage`) and its call site from `getServerStorage()` to `createStorage(requireServiceClient())` — the exact pre-188 split-brain shape — then ran this file alone.

```
 ❯ tests/unit/storage/whatsapp-media-single-backend.test.ts (12 tests | 3 failed) 57ms
     × loadAdminConversationThread signs URLs at the SAME keys the writer produced, from R2, never Supabase
     × the captured PutObjectCommand Key equals the key embedded in the presigned URL (reader looks where writer wrote)
     × lib/actions/admin-whatsapp.ts imports from @/lib/storage/server and never calls createStorage(

AssertionError: the given combination of arguments (null and string) is invalid for this assertion...
  expect(imgMsg.media_url).toContain(putImageKey)
  # imgMsg.media_url was null

AssertionError: expected undefined to be 'company-1/whatsapp/project-1-media-img-1.jpeg'
  # match on the presigned-URL regex was null — no R2 URL was ever produced

AssertionError: lib/actions/admin-whatsapp.ts must import serverStorage/getServerStorage from '@/lib/storage/server'...
  expected '\'use server\'\r\n\r\nimport { requir…' to contain 'from \'@/lib/storage/server\''

 Test Files  1 failed (1)
      Tests  3 failed | 9 passed (12)
```

Notable: the failure mode is `media_url: null`, not an uncaught `POISON_MESSAGE` exception — the reader's own `try { ... } catch { return { ...m, media_url: null } }` (line ~68 of `admin-whatsapp.ts`) swallows the poisoned getter's throw. This is itself informative: in the sabotaged (pre-188) shape, the split-brain bug doesn't crash — it silently nulls the media URL, which is exactly the "silent 404s on inbound media, no error anywhere" failure mode the field assessment named. The test still goes unambiguously RED (3 assertion failures), which is the required signal.

Reverted immediately after observing RED. `git diff lib/actions/admin-whatsapp.ts` confirmed empty (no residual change) before proceeding.

## Full-Suite Sign-Off

Two full runs were needed: the first (mid-execution) overlapped with a concurrently-executing sibling plan (188-04, `storage-seam-census.test.ts`) that was still uncommitted at that point and had its own manifest one entry short — that is 188-04's own file, never touched by this plan, and resolved itself once 188-04 landed its commit (`96bd625b`). Re-running after that commit gives the clean sign-off below.

`npx vitest run tests/unit tests/eval`, exit code captured directly (`echo "VITEST_EXIT=$?"` immediately after the command, never through a pipe): `VITEST_EXIT=1`, `Tests 2 failed | 5158 passed | 20 todo (5180)`.

Exact `FAIL` line set:
- `tests/unit/sign-estimate-atomic-migration.test.ts > sign_estimate_atomic migration (S2) — shape > is SECURITY DEFINER (a documented departure from save_estimate_atomic INVOKER) with search_path pinned`
- `tests/unit/signature-evidence-retention-migration.test.ts > fix-pack F2, finding #2 — erase_company_for_compliance (GoTrue hard-delete escape hatch) > is SECURITY DEFINER with search_path pinned`

Both are the pre-documented Windows-CRLF-only migration-shape failures (pass in CI) — not regressions from this plan. No third `FAIL` line in the sign-off run.

## Exact Keys Asserted

- Image leg: `photos/company-1/whatsapp/project-1-media-img-1.jpeg` (bucket `photos`, key `company-1/whatsapp/project-1-media-img-1.jpeg`).
- Audio leg: `audio/company-1/whatsapp/wamid.AUDIO1.ogg` (bucket `audio`, key `company-1/whatsapp/wamid.AUDIO1.ogg`).

Both derived from the real `deriveImageFormat`/`deriveAudioFormat` (`lib/whatsapp/media.ts`, unmocked) applied to the test's fixture MIME types (`image/jpeg`, `audio/ogg; codecs=opus`), matching the adapter's real key-construction expressions verbatim.

## Issues Encountered

None beyond the documented `__internal` seam deviation. The transient third `FAIL` line from the concurrently-executing 188-04 sibling's own uncommitted file was not an issue in this plan's scope — see "Full-Suite Sign-Off" above.

## User Setup Required

None. No `S3_*` value, real or placeholder, was added to `.env.local`, Coolify, or any committed env file — `git status` shows no `.env*` change throughout this plan. No production code was modified (the Part C sabotage was reverted; `git diff lib/actions/admin-whatsapp.ts` is empty).

## Verification Record

- `npx vitest run tests/unit/storage/whatsapp-media-single-backend.test.ts` — 12/12 passed.
- `git diff --stat lib/storage/s3-provider.ts` — empty (confirmed twice: after Task 1 and after the final full-suite run).
- `npx tsc --noEmit` — 0 errors (exit code 0, captured directly).
- `git status --porcelain` — clean of the Part C sabotage edit; only this plan's own test file (and this SUMMARY / STATE / ROADMAP) tracked as this plan's changes.
- Full `npx vitest run tests/unit tests/eval` — exit 1, `FAIL` set is exactly the 2 known CRLF-only migration-shape tests (see above).

## Next Phase Readiness

PROV-03 is complete. This closes out the concrete-proof requirement for the 188-server-wide-provider-selection-integrity milestone; Plan 04 (running concurrently, `storage-seam-census.test.ts`) independently closes the import-graph completeness gate. No blockers for downstream phases (189-192, already scaffolded in `.planning/phases/`).

## Self-Check: PASSED

`tests/unit/storage/whatsapp-media-single-backend.test.ts` confirmed present on disk; commit `c7937e16` confirmed present in `git log`.

---
*Phase: 188-server-wide-provider-selection-integrity*
*Completed: 2026-08-06*
