---
phase: 78-admin-og-image-upload
plan: 02
subsystem: admin
tags: [admin, seo, og-image, storage, server-action, alert-dialog, vitest, tdd]

# Dependency graph
requires:
  - phase: 78-01
    provides: OgImageUploader lifted-state + FormData wiring contract (ogImageFile, ogImageRemoved)
  - phase: storage
    provides: StorageProvider abstraction (createStorage), platform-brand public bucket
provides:
  - Server-side OG image upload pipeline (saveSeo extended with upload + delete + sanitization)
  - AlertDialog destructive confirmation around Remove (resolves Plan 01 TODO marker)
  - Defense-in-depth: server enforces 2MB max + PNG/JPG only via seoSchema refinement
  - Best-effort storage cleanup pattern (delete failures logged, never block DB update)
  - Phase 78 fully closed out — all 5 OG-IMG-* requirements Complete
affects: [admin-seo, social-sharing, branding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filename sanitization for storage keys: lowercase + non-alphanumerics collapsed to '-' + fallback to 'og-image'"
    - "Managed-URL detection by substring (/platform-brand/og-images/) + bucket-relative path extraction for delete"
    - "Server-side schema refinement mirrors client validation (defense in depth, not duplication)"

key-files:
  created:
    - tests/unit/admin/save-seo.test.ts
    - .planning/phases/78-admin-og-image-upload/78-02-SUMMARY.md
  modified:
    - app/admin/seo/actions.ts
    - app/admin/seo/seo-editor.tsx
    - components/admin/og-image-uploader.tsx
    - lib/schemas/admin.ts
    - tests/unit/admin/og-image-uploader.test.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Read existing og_image_url with a separate SELECT before upsert (only on remove path) — keeps the upload path zero-roundtrip-overhead and avoids depending on the upsert's returning clause"
  - "Sanitize at server, not client: client filename can be anything; the storage key must be safe regardless"
  - "Best-effort cleanup logs via console.warn but never surfaces a toast error — the user's intent (remove from UI/DB) is honored even if storage is flaky"
  - "Server-side defense-in-depth duplicates the client size/type checks via seoSchema.refine — client validation is UX, server validation is security"
  - "Post-submit reset of ogImageFile/ogImageRemoved in seo-editor prevents accidental re-upload or re-removal on a subsequent save"

patterns-established:
  - "AlertDialogTrigger asChild wrapping a styled <button> for destructive ops in admin (mirrors phase-76 destructive-action pattern)"
  - "Storage key shape: og-images/{Date.now()}-{sanitized-base}.{lowercased-ext}"

requirements-completed: [OG-IMG-03, OG-IMG-04]

# Metrics
duration: 6min
completed: 2026-05-20
---

# Phase 78 Plan 02: Server Upload + AlertDialog Remove + Phase Closeout Summary

**saveSeo now uploads OG images to platform-brand/og-images/ and persists the URL; Remove is wrapped in an AlertDialog with best-effort storage cleanup; all 5 OG-IMG-* requirements are Complete.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-20T08:50:00Z
- **Completed:** 2026-05-20T08:55:00Z
- **Tasks:** 2 (Task 1 TDD: RED then GREEN; Task 2: AlertDialog + closeout)
- **Files created:** 2
- **Files modified:** 6

## Accomplishments

- `saveSeo` server action accepts `ogImageFile` (File, optional) and `ogImageRemoved` (boolean) from FormData
- Valid uploads land at `platform-brand/og-images/{Date.now()}-{sanitized}.{ext}` via `storage.upload` with `upsert:true`; the public URL is then persisted to `platform_branding.og_image_url`
- Server-side defense-in-depth: `seoSchema` refines `ogImageFile` to ≤2MB and PNG/JPG only — independent of the client check in `OgImageUploader`
- Remove flow: when `ogImageRemoved=true` AND no new file, the action reads the current `og_image_url`, attempts `storage.delete` (only when the URL is managed — i.e. contains `/platform-brand/og-images/`), swallows any delete error via `console.warn`, then upserts `og_image_url=null`
- External URLs persist unchanged when neither uploading nor removing (OG-IMG-05 server-side guarantee)
- Audit log enriched with `og_image_uploaded` and `og_image_removed` booleans
- AlertDialog wraps the Remove button in `OgImageUploader` — clicking opens a confirmation; Cancel closes silently; the AlertDialogAction "Remove" fires `onRemove()`. Resolves the `// TODO(78-02)` left in Plan 01.
- `SeoEditor` resets `ogImageFile` + `ogImageRemoved` after a successful save so a subsequent submit-without-changes doesn't replay the upload/removal
- All 5 OG-IMG-* checkboxes flipped to `[x]` in `.planning/REQUIREMENTS.md`; traceability rows updated to `Complete`

## Task Commits

1. **Task 1 RED: failing saveSeo tests** — `1de0ff6` (test)
2. **Task 1 GREEN: extend saveSeo + seoSchema** — `d568ab9` (feat)
3. **Task 2 + docs commit (final):** see metadata commit below (covers AlertDialog wiring, editor reset, uploader tests, REQUIREMENTS closeout, this SUMMARY)

## Files Created/Modified

- `tests/unit/admin/save-seo.test.ts` — 7 cases covering no-op / upload / size reject / format reject / managed-remove-with-delete-throw / external-remove / filename sanitization
- `app/admin/seo/actions.ts` — Upload branch (`storage.upload` + `getPublicUrl`) and Remove branch (SELECT current URL → conditional `storage.delete` → `og_image_url=null`); `sanitizeBase()` helper; enriched audit metadata
- `lib/schemas/admin.ts` — `seoSchema` extended with optional `ogImageFile` (size/type refinements) and `ogImageRemoved` (default false)
- `components/admin/og-image-uploader.tsx` — Removed TODO(78-02) marker; wrapped Remove button in `<AlertDialog>` with Cancel/Remove footer
- `tests/unit/admin/og-image-uploader.test.tsx` — Replaced old test 8 with 8a (dialog opens on click), 8b (cancel = no onRemove), 8c (action fires onRemove once) — uses `data-slot="alert-dialog-action"` to disambiguate the dialog's Remove from the trigger
- `app/admin/seo/seo-editor.tsx` — Reset `ogImageFile`/`ogImageRemoved` after successful save
- `.planning/REQUIREMENTS.md` — OG-IMG-03 and OG-IMG-04 flipped from `[ ]` to `[x]`, traceability rows from `Pending` to `Complete`

## Decisions Made

- **Separate SELECT for current URL on remove:** rather than relying on a returning clause on the upsert or reading from RHF, fetch the truth from the DB at the moment we need to compute the storage key to delete. Avoids the risk of deleting the wrong object if the form state drifted.
- **Best-effort delete swallows errors:** the user's intent is "make this URL go away from the public site." A flaky storage layer should not block that intent — but we log the failure so it's visible in server logs for later cleanup.
- **AlertDialog Action uses default Button variant:** matches the existing destructive-confirm pattern in other admin flows (no separate red destructive variant required — the dialog title + description carry the destructive intent semantically).
- **Server validation duplicates client validation by design:** client validation is UX (instant feedback, no upload roundtrip); server validation is security (a hostile client could bypass the file picker). Both pass through identical thresholds (2MB / PNG-JPG).
- **`data-slot="alert-dialog-action"` query for test 8c:** the trigger and the action share the same accessible name ("Remove"). The `data-slot` attribute (already present in the shadcn primitive) gives a stable selector without needing a custom test id.

## Deviations from Plan

None — plan executed exactly as written. The only minor adjustment was the test 8c querying strategy (data-slot attribute instead of last-index of getAllByRole), which is documented above under Decisions.

## Issues Encountered

- Initial draft of `tests/unit/admin/save-seo.test.ts` had TypeScript errors on mock signatures (4-arg upload, 2-arg delete). Fixed by explicitly typing the `vi.fn` factories and the wrapping `createStorage` callbacks. `tsc --noEmit` now clean.
- Test 8c initially used `getAllByRole({ name: /^Remove$/ })` expecting 2 buttons (trigger + action). Only one matched after open — likely a Radix accessibility detail. Switched to `document.querySelector('[data-slot="alert-dialog-action"]')` which is stable and intent-revealing.

## User Setup Required

None — the `platform-brand` bucket already exists (used by branding flow). No new env vars, no new migrations, no new external services.

## Manual UAT (executor's discretion)

On `/admin/seo`:
1. Upload a 1200×630 PNG → click Save → toast "SEO settings saved." → refresh → preview shows the uploaded image, external-URL hint absent.
2. Click Remove → AlertDialog "Remove OG image?" appears → click Remove → preview clears → click Save → toast success → refresh → empty dropzone.
3. (Optional) Inspect Supabase Storage: a `platform-brand/og-images/{ts}-...` object existed after step 1 and is gone after step 2.

## Phase 78 Closeout

All 5 OG-IMG-* requirements Complete:
- OG-IMG-01 ✅ (Plan 01)
- OG-IMG-02 ✅ (Plan 01)
- OG-IMG-03 ✅ (Plan 02)
- OG-IMG-04 ✅ (Plan 02)
- OG-IMG-05 ✅ (Plan 01 client-side + Plan 02 server-side)

Phase 78 is ready to close.

## Next Phase Readiness

Nothing carried over from Phase 78 — fully self-contained closeout. The patterns established here (server-side upload via storage abstraction + AlertDialog destructive confirm + best-effort cleanup) are now templates other admin asset flows can mirror.

No blockers.

---
*Phase: 78-admin-og-image-upload*
*Completed: 2026-05-20*

## Self-Check: PASSED

All declared files exist on disk. All task commits present in git history (1de0ff6 RED, d568ab9 GREEN).
