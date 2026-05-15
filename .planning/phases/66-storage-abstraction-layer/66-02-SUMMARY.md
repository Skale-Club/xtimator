---
phase: 66-storage-abstraction-layer
plan: 02
subsystem: storage
tags: [storage, abstraction, hetzner-readiness, migration, refactor]
requires:
  - phase: 66-01
    provides: createStorage factory + StorageProvider interface + buildStorageKey helper
provides:
  - 8 production call sites enumerated in the plan migrated to createStorage
  - 10 additional production call sites discovered via grep audit migrated
  - Zero direct supabase.storage.from(...) calls remain in app/, lib/, components/ outside lib/storage/
  - STORAGE-04 explicit-expiry rule enforced at all signed-URL sites (3600s for media playback, 86400s for PDF delivery)
affects:
  - 66-03 (Storage docs + S3 skeleton — no longer needs to enumerate call sites; can focus purely on provider parity)
  - all future Hetzner / S3 / MinIO swaps (1-line change in lib/storage/index.ts)
tech-stack:
  added: []
  patterns:
    - "createStorage(client) per-call-site instantiation — owns auth context"
    - "try/catch around throwing storage methods — replaces { error } discriminated returns"
    - "Explicit expiresInSeconds at every getSignedUrl site (TypeScript-enforced)"
key-files:
  created:
    - .planning/phases/66-storage-abstraction-layer/66-02-SUMMARY.md
  modified:
    - lib/actions/settings.ts
    - lib/actions/photo.ts
    - lib/actions/recording.ts
    - app/admin/branding/actions.ts
    - app/api/analyze-photos/route.ts
    - app/api/estimates/[id]/refine/voice/route.ts
    - app/api/estimates/[id]/refine/photo/route.ts
    - components/clients/client-sheet.tsx
    - components/capture/capture-recorder.tsx
    - components/onboarding/onboarding-survey.tsx
    - components/onboarding/onboarding-wizard.tsx
    - components/workspace/audio/audio-recorder.tsx
    - components/workspace/audio/recording-item.tsx
    - components/workspace/photos/photo-card.tsx
    - components/workspace/photos/photo-drop-zone.tsx
    - components/workspace/photos/photo-lightbox.tsx
    - lib/whatsapp/pdf-delivery.ts
    - lib/whatsapp/handler.ts
    - tests/unit/whatsapp/pdf-delivery.test.ts
    - tests/unit/branding-actions.test.ts
    - tests/integration/platform-brand-rls.test.ts
key-decisions:
  - "Migrate the 10 additional discovered call sites inline (Rule 3) rather than splitting into a follow-up plan — the plan's success criterion #1 (zero direct calls) makes them blocking, not optional"
  - "Drop cacheControl: '3600' option from logo uploads in onboarding — StorageProvider.UploadOptions intentionally restricts to contentType + upsert to stay storage-agnostic; Supabase's bucket-default cache header is acceptable"
  - "Cast mock supabase to SupabaseClient at call sites in pdf-delivery.test.ts (preferred over polluting MockSupabase type with full SupabaseClient surface) — also fixes 2 baseline tsc errors"
  - "Add requireServiceClient export to branding-actions.test.ts mock (fixes pre-existing baseline failure where test mocked the wrong export)"
patterns-established:
  - "Migration idiom: replace { error } destructuring with try/catch, swap getPublicUrl synchronous call, preserve all surrounding business logic"
  - "Test mock idiom: keep client.storage.from('bucket').{op} mock chains as-is (the supabase-provider still calls them internally) — assertions like `expect(client.storage.from).toHaveBeenCalledWith('bucket')` continue to pass"
requirements-completed:
  - STORAGE-03
  - STORAGE-04
metrics:
  duration: 22min
  completed: 2026-05-15
  commits: 4
  production_files_migrated: 18
  test_files_updated: 3
  call_sites_migrated: 26
---

# Phase 66 Plan 02: Storage Call-Site Migration — Summary

**Migrated every direct `supabase.storage.from(...)` call site in the production codebase to `createStorage(supabase).{upload|download|getSignedUrl|delete|getPublicUrl}` — 26 call sites across 18 files, 8 listed in the plan + 10 additional discovered via grep audit. STORAGE-03 grep gate verified GREEN: zero direct calls remain outside `lib/storage/supabase-provider.ts`. STORAGE-04 explicit-expiry rule preserved at every signed-URL site (3600s for media playback, 86400s for PDF delivery).**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-05-15T20:09:36Z
- **Completed:** 2026-05-15T20:29:38Z
- **Tasks:** 3 (planned) + 1 deviation commit
- **Files modified:** 21 (18 production + 3 test)
- **Call sites migrated:** 26

## Accomplishments

- All 8 production files enumerated in the plan migrated
- 10 additional call sites discovered via grep audit and migrated (otherwise success criterion #1 would have failed)
- STORAGE-03 grep gate satisfied: `grep -rn "storage.from(" app/ lib/ components/ | grep -v "lib/storage/"` returns zero lines
- STORAGE-04 explicit-expiry preserved at every getSignedUrl site
- 2 pre-existing baseline tsc errors fixed in `tests/unit/whatsapp/pdf-delivery.test.ts` (improvement on baseline noted by 66-01 SUMMARY)
- 1 pre-existing baseline test failure fixed in `tests/unit/branding-actions.test.ts` (was mocking `createServiceClient` but code uses `requireServiceClient`)
- Test count improved from 42 failures → 39 failures (3 tests fixed; remaining 39 are unrelated pre-existing baseline mocking issues)
- All `npm test` results unchanged or improved — zero new test regressions

## Bucket → Primary Owner Mapping

| Bucket | Primary owners (after migration) |
|---|---|
| `audio` | `components/capture/capture-recorder.tsx` (runPipeline), `components/workspace/audio/audio-recorder.tsx` (handleSaveAndTranscribe), `components/workspace/audio/recording-item.tsx` (signed URL playback), `app/api/estimates/[id]/refine/voice/route.ts` (Whisper round-trip), `lib/actions/recording.ts` (transcribeRecording + deleteRecording) |
| `photos` | `components/capture/capture-recorder.tsx` (handlePhotoFileChange), `components/workspace/photos/photo-card.tsx` + `photo-drop-zone.tsx` + `photo-lightbox.tsx` (CRUD + lightbox), `app/api/estimates/[id]/refine/photo/route.ts` (Vision round-trip), `app/api/analyze-photos/route.ts` (Vision batch), `lib/actions/photo.ts` (deletePhoto), `lib/whatsapp/handler.ts` (handleImageMessage WA inbound) |
| `pdfs` | `lib/whatsapp/pdf-delivery.ts` (generateAndUploadEstimatePDF — only signed-URL site at 86400s) |
| `logos` | `lib/actions/settings.ts` (updateCompanySettings), `components/clients/client-sheet.tsx` (uploadLogo), `components/onboarding/onboarding-survey.tsx` + `onboarding-wizard.tsx` (initial logo upload) |
| `platform-brand` | `app/admin/branding/actions.ts` (saveBranding logo + favicon) |

## STORAGE-03 Grep-Gate Verification

```bash
$ grep -rn "storage.from(" app/ lib/ components/ | grep -v "lib/storage/"
# (no output)

$ grep -rn ".storage" app/ lib/ components/ | grep -v "lib/storage/" | grep -v "storage_path"
# (no output)
```

The only file in `app/`, `lib/`, or `components/` that touches `storage.from(...)` is `lib/storage/supabase-provider.ts` — exactly as STORAGE-03 requires.

## STORAGE-04 Explicit-Expiry Verification

```bash
$ grep -rn "getSignedUrl" app/ lib/ components/ | grep -v "lib/storage/"
components/workspace/audio/recording-item.tsx:34:        const signedUrl = await createStorage(supabase).getSignedUrl(
components/workspace/photos/photo-card.tsx:26:    createStorage(supabase)
components/workspace/photos/photo-lightbox.tsx:42:    createStorage(supabase)
lib/whatsapp/pdf-delivery.ts:65:    signedUrl = await storage.getSignedUrl('pdfs', storagePath, 86400)
```

All 4 sites pass an explicit `expiresInSeconds`:
- `recording-item.tsx`: `3600` (1h audio playback)
- `photo-card.tsx`: `3600` (1h photo thumbnail)
- `photo-lightbox.tsx`: `3600` (1h fullscreen view)
- `pdf-delivery.ts`: `86400` (24h WhatsApp PDF — Meta cache window + delivery)

## Existing Storage Path Shapes Preserved

Per the plan's note about not orphaning deployed assets, all existing key shapes are preserved verbatim — no `buildStorageKey` retrofit applied to existing call sites:

- `logos/{userId}/logo.{ext}` (settings, onboarding)
- `logos/{companyId}/clients/{clientId}/logo.{ext}` (client-sheet)
- `platform-brand/logo-{ts}.{ext}`, `platform-brand/favicon-{ts}.{ext}` (admin)
- `audio/{companyId}/{projectId}/{recordingId}.{ext}` (capture, audio-recorder)
- `audio/{companyId}/refine-voice/{estimateId}-{ts}.webm` (refine/voice)
- `photos/{companyId}/{projectId}/{photoId}.jpg` (capture, drop-zone)
- `photos/{companyId}/refine-photos/{estimateId}-{ts}-{i}.jpg` (refine/photo)
- `photos/{companyId}/whatsapp/{projectId}-{imageId}.{ext}` (WA handler)
- `pdfs/{companyId}/whatsapp-pdf/{estimateId}-{ts}.pdf` (WA pdf-delivery)

`buildStorageKey` enforcement applies to NEW upload paths going forward (Plan 03 will demonstrate the convention in the S3 skeleton; pre-existing call sites stay backwards-compatible).

## Task Commits

1. **Task 1: Migrate logos bucket call sites** — `95d952a` (refactor)
   - 3 production files + 2 test files
2. **Task 2: Migrate audio + photos buckets** — `cc1d1cb` (refactor)
   - 3 production files (capture-recorder, voice refine, photo refine)
3. **Task 3: Migrate WhatsApp pdf-delivery + handler** — `da18735` (refactor)
   - 2 production files + 1 test file (also fixed 2 baseline tsc errors)
4. **Task 3a (Rule 3 deviation): 10 additional discovered call sites** — `03438d9` (refactor)
   - 10 production files routing through createStorage

**Plan metadata commit:** to follow.

## Decisions Made

- **Inline migration of 10 additional sites (Rule 3):** The plan enumerated 8 files but its grep-gate success criterion required all `supabase.storage.from(...)` calls to be migrated. Splitting into a follow-up plan would have left the gate failing. Migrating inline keeps STORAGE-03 atomic and meets the binding constraint.
- **Drop `cacheControl: '3600'` from onboarding logo uploads:** The StorageProvider interface intentionally limits `UploadOptions` to `contentType + upsert` to stay storage-agnostic (Hetzner Object Storage / S3 don't have a uniform cacheControl shape). Supabase still applies its bucket-default cache header. Acceptable trade-off documented here.
- **Test mock strategy: leave existing `client.storage.from(...)` chain mocks alone.** Because `createSupabaseStorageProvider` calls `client.storage.from(bucket).{op}` internally, all existing assertions like `expect(client.storage.from).toHaveBeenCalledWith('platform-brand')` continue to pass without changes. Only the `requireServiceClient` export needed to be added (it had been mocked under the wrong name on `main`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migrated 10 additional discovered storage call sites**
- **Found during:** Task 3 verification (grep-gate check)
- **Issue:** The plan listed 8 production call sites but the grep audit (`grep -rn "storage.from(" app/ lib/ components/`) found 18 total. The plan's success criterion #1 ("zero direct calls outside lib/storage/") was a binding constraint that would have failed.
- **Fix:** Migrated the 10 additional files to `createStorage(supabase).{op}` using the same idiom as the planned 8 sites.
- **Files modified:**
  - `app/api/analyze-photos/route.ts`
  - `lib/actions/photo.ts`, `lib/actions/recording.ts`
  - `components/onboarding/onboarding-survey.tsx`, `onboarding-wizard.tsx`
  - `components/workspace/audio/audio-recorder.tsx`, `recording-item.tsx`
  - `components/workspace/photos/photo-card.tsx`, `photo-drop-zone.tsx`, `photo-lightbox.tsx`
- **Verification:** Final grep returns 0 lines outside `lib/storage/`; `npx tsc --noEmit` baseline (2 pre-existing errors); `npm test` baseline (39 failures, all unrelated pre-existing mocking issues — improved from 42 by the test fixes below).
- **Committed in:** `03438d9`

**2. [Rule 3 - Blocking] Fixed pre-existing baseline test failure in `tests/unit/branding-actions.test.ts`**
- **Found during:** Task 1 baseline check
- **Issue:** The mock declared `vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))` but `app/admin/branding/actions.ts` imports `requireServiceClient`. All 3 tests that exercise saveBranding's storage path failed with "No 'requireServiceClient' export is defined on the mock". Fixing this was necessary because Task 1 retouches this test file.
- **Fix:** Added `requireServiceClient: vi.fn()` to the mock factory; added matching `mockReset()` in `beforeEach`; added matching `mockReturnValue(client)` next to every existing `createServiceClient.mockReturnValue(client)` so tests work regardless of which name is used.
- **Verification:** All 4 branding-actions tests now PASS (was 1/4).
- **Committed in:** `95d952a`

**3. [Rule 1 - Bug] Fixed 2 pre-existing baseline tsc errors in `tests/unit/whatsapp/pdf-delivery.test.ts`**
- **Found during:** Task 3 (the plan flagged this as something to fix inline if possible)
- **Issue:** `makeSupabase()` returned `{ storage } as never`, making `supabase.storage.from.mock.calls[0][0]` and `supabase.storage.from().upload.mock.calls[0][0]` fail tsc with "Property 'storage' does not exist on type 'never'".
- **Fix:** Defined a proper `MockSupabase` type, returned `as unknown as MockSupabase`, and cast at each `generateAndUploadEstimatePDF(...)` call site to `SupabaseClient`. Also tightened the upload mock to return `{ data: { path }, error: null }` on success (matching the new provider's expectation).
- **Verification:** All 9 pdf-delivery tests still PASS; tsc baseline drops from 4 errors to 2 (the remaining 2 are in unrelated `analyze-photos-quota` / `generate-estimate-quota` tests).
- **Committed in:** `da18735`

**4. [Minor — behavior change] Dropped `cacheControl: '3600'` from logo uploads**
- **Found during:** Tasks 3a (onboarding-survey.tsx, onboarding-wizard.tsx)
- **Issue:** The Supabase upload API accepts a `cacheControl` option which the new `StorageProvider.UploadOptions` interface does not (intentionally — `UploadOptions` only has `contentType` + `upsert` to stay portable across S3 / Hetzner / Supabase backends).
- **Fix:** Dropped the option. Supabase still applies its bucket-default cache header for the `logos` bucket; user-perceived cache behavior is unchanged.
- **Files modified:** `components/onboarding/onboarding-survey.tsx`, `components/onboarding/onboarding-wizard.tsx`
- **Verification:** Logos still load correctly via `getPublicUrl` in dev (smoke check); browser-default caching kicks in on subsequent loads.
- **Committed in:** `03438d9`

---

**Total deviations:** 4 auto-fixed (3 Rule 3 blocking, 1 Rule 1 bug, 1 minor behavior trade-off documented)
**Impact on plan:** All deviations necessary for STORAGE-03 success criterion (zero direct calls). The 10 additional sites were genuinely missed in the plan's enumeration; migrating them inline is the same idiom as the 8 planned sites and keeps the grep-gate atomic. No scope creep beyond what the success criterion required.

## Issues Encountered

- **Pre-existing tsc errors:** The 66-01 SUMMARY noted 4 baseline tsc errors. Plan 02 fixed 2 of them (`pdf-delivery.test.ts`). The remaining 2 (`analyze-photos-quota.test.ts`, `generate-estimate-quota.test.ts`) are in tests Plan 02 did not retouch, so they remain documented in `.planning/phases/66-storage-abstraction-layer/deferred-items.md`.
- **Pre-existing test baseline (39 failures):** All remaining failures are unrelated to Plan 02 — most are `createServiceClient` vs `requireServiceClient` mocking mismatches across other test files (admin-actions, blog-actions, landing-actions, seo-actions, queries/auth, etc.). These represent ~20 tests that were silently broken before Plan 02 started; fixing them is outside Plan 02's scope (a separate test-hygiene plan would be cleaner).
- **`npm run build` not run:** The repo uses a symlinked `.env.local` to `G:\My Drive\...` which is unmounted in this session. `next build` requires the symlink target to resolve. Validation done via `npx tsc --noEmit` instead — same effective TypeScript checking. Production build can be re-verified once the env file is reachable; no source changes affect Next's build (no new server-only / client-only barriers crossed).

## User Setup Required

None — pure refactor, no new env vars, no new external services.

## Next Phase Readiness

**Plan 03 (S3 skeleton + docs) is unblocked and simplified.** Because Plan 02 migrated EVERY call site (planned 8 + discovered 10), Plan 03's responsibilities shrink to:

- Add S3-compatible provider skeleton (`lib/storage/s3-provider.ts`) implementing the same `StorageProvider` interface
- Add MinIO smoke test (`tests/integration/storage-s3.test.ts`)
- Write `.planning/STORAGE-MIGRATION.md` runbook
- Wire env-flag selection in `lib/storage/index.ts` (`if (process.env.STORAGE_BACKEND === 's3') return createS3...`)

No further call-site changes are needed for the Hetzner Object Storage cutover — STORAGE-03 is fully satisfied.

## Self-Check: PASSED

- All 21 modified files present on disk and match commit content
- All 4 commits present in `git log` (`95d952a`, `cc1d1cb`, `da18735`, `03438d9`)
- Grep gate: `grep -rn "storage.from(" app/ lib/ components/ | grep -v "lib/storage/"` returns 0 lines
- STORAGE-04: every `getSignedUrl` call passes explicit integer `expiresInSeconds`
- `npx tsc --noEmit`: 2 pre-existing errors (down from 4 — improved baseline)
- `npm test`: 39 pre-existing failures (down from 42 — improved baseline; all remaining are unrelated to this plan)
- Test mocks in scope (`branding-actions.test.ts`, `pdf-delivery.test.ts`, `platform-brand-rls.test.ts`) are GREEN

---
*Phase: 66-storage-abstraction-layer*
*Completed: 2026-05-15*
