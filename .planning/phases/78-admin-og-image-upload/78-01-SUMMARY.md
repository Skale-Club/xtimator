---
phase: 78-admin-og-image-upload
plan: 01
subsystem: ui
tags: [admin, seo, og-image, file-upload, react-hook-form, vitest]

# Dependency graph
requires:
  - phase: 05-onboarding
    provides: LogoUploader pattern (mirrored by OgImageUploader)
  - phase: branding
    provides: platform-brand bucket conventions + lifted-state file upload pattern
provides:
  - OgImageUploader client component (1200x630 frame, dimension validation, format/size gating)
  - SeoEditor refactored to use uploader instead of bare URL input
  - Backward-compat heuristic for external (non-managed) OG image URLs
  - FormData wiring contract (`ogImageFile`, `ogImageRemoved`) for server-side handoff
affects: [78-02, admin-seo, social-sharing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lifted state for file uploads: parent owns File + preview + removed flag; RHF source-of-truth for non-file fields"
    - "Managed-storage heuristic by URL substring (/platform-brand/og-images/ or /branding-assets/og-images/)"

key-files:
  created:
    - components/admin/og-image-uploader.tsx
    - tests/unit/admin/og-image-uploader.test.tsx
    - tests/unit/admin/seo-editor.test.tsx
  modified:
    - app/admin/seo/seo-editor.tsx

key-decisions:
  - "Mirror LogoUploader pattern (button + hidden file input + toast errors) for visual + behavioral consistency"
  - "Use file-presence (ogImageFile != null) rather than a sentinel string to signal pending upload in 78-02"
  - "Accept both /platform-brand/og-images/ and /branding-assets/og-images/ as 'managed' paths — future-proofs against bucket rename"
  - "Remove button calls onRemove() directly in this plan; AlertDialog confirmation wraps in 78-02 (TODO comment marks the spot)"

patterns-established:
  - "Aspect-ratio dropzone via tailwind aspect-[1200/630] w-full max-w-md"
  - "Dimension detection via <img onLoad> + naturalWidth/naturalHeight stored in component state, with non-blocking red warning below the preview"

requirements-completed: [OG-IMG-01, OG-IMG-02, OG-IMG-05]

# Metrics
duration: 5min
completed: 2026-05-20
---

# Phase 78 Plan 01: OG Image Uploader Component + SEO Form Integration Summary

**1200x630 aspect-ratio dropzone replaces the bare URL input on /admin/seo, with PNG/JPG validation, dimension warnings, and backward-compat for existing external URLs.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-20T12:41:53Z
- **Completed:** 2026-05-20T12:46:35Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 1

## Accomplishments
- New `OgImageUploader` client component mirrors the existing `LogoUploader` pattern but with a 1200:630 preview frame, dimension detection, and red warning for sub-recommended dimensions (<600x315)
- Client-side validation: PNG/JPG only, max 2MB, toast errors on rejection
- Backward-compat banner shown when `currentUrl` is an external URL (not in `/platform-brand/og-images/` or `/branding-assets/og-images/`)
- `SeoEditor` now uses the uploader inside a `FormItem` (uploader owns its own state); `ogImageFile` + `ogImageRemoved` flow into the existing `saveSeo` FormData submission as the wiring contract for Plan 78-02
- 12 unit tests across 2 files, all passing

## Task Commits

1. **Task 1 RED: failing tests for OgImageUploader** - `2531458` (test)
2. **Task 1 GREEN: implement OgImageUploader** - `77310df` (feat)
3. **Task 2: wire into SeoEditor** - `602452f` (feat)

## Files Created/Modified
- `components/admin/og-image-uploader.tsx` - New client component. 1200x630 dropzone, file validation, dimension detection, external-URL hint, Change/Remove controls
- `app/admin/seo/seo-editor.tsx` - Replaced `<FormField name="ogImageUrl">` (bare URL input) with a `<FormItem>` containing `<OgImageUploader>` driven by lifted state (`ogImageFile`, `ogImagePreview`, `ogImageRemoved`)
- `tests/unit/admin/og-image-uploader.test.tsx` - 10 cases: empty state, current-URL preview, valid PNG selection, format rejection, size rejection, dimension warning, ideal-dimensions no-warning, Remove callback, external-URL banner, managed-URL no-banner
- `tests/unit/admin/seo-editor.test.tsx` - 2 cases: uploader renders (no URL input), initial URL hydrates preview

## Decisions Made
- **File-presence signal over sentinel string:** parent checks `ogImageFile != null` at submit time rather than embedding a `__PENDING_UPLOAD__` marker. Cleaner contract for the 78-02 server action.
- **Both managed paths accepted:** the external-URL heuristic accepts `/platform-brand/og-images/` AND `/branding-assets/og-images/` so a future bucket rename or pre-existing historic uploads don't trip the migration banner.
- **No `@testing-library/jest-dom`:** the project doesn't use it; assertions use plain `expect(el).toBeTruthy()` / `.toBeNull()` to match codebase convention.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial test pass used `toBeInTheDocument` (jest-dom matcher not installed) and got 1200 x 630 text collision with the always-shown helper "Ideal: 1200 x 630..." — adjusted assertions to plain truthy/null checks and used `getAllByText` for the colliding helper line. Resolved before final commit.
- `@ts-expect-error` directives over `global.URL.createObjectURL` assignment were unused (DOM lib already types it as writable); removed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for **Plan 78-02**:
- Wrap Remove button in `<AlertDialog>` (TODO comment marks the location in `og-image-uploader.tsx` `handleRemove`)
- Extend `saveSeo` server action to consume `ogImageFile` (upload to `platform-brand/og-images/{ts}-{name}` then set `og_image_url`) and `ogImageRemoved === 'true'` (clear `og_image_url`, best-effort delete storage object)
- Server-side mirror of size/type validation
- E2E smoke covering upload + remove + external-URL migration

No blockers.

---
*Phase: 78-admin-og-image-upload*
*Completed: 2026-05-20*

## Self-Check: PASSED

All declared files exist on disk. All task commits present in git history.
