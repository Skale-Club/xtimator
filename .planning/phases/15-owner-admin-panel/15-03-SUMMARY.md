---
phase: 15-owner-admin-panel
plan: "03"
subsystem: admin-seo-branding
tags: [seo, favicon, branding, metadata, admin]
dependency_graph:
  requires: [15-01]
  provides: [seo-editor, favicon-upload, root-metadata-seo]
  affects: [app/layout.tsx, app/admin/branding, app/admin/seo]
tech_stack:
  added: []
  patterns: [server-action-upsert, file-upload-to-storage, dynamic-metadata]
key_files:
  created:
    - app/admin/seo/actions.ts
    - app/admin/seo/seo-editor.tsx
    - app/admin/seo/page.tsx
  modified:
    - app/admin/branding/actions.ts
    - app/admin/branding/branding-editor.tsx
    - app/admin/branding/page.tsx
    - app/layout.tsx
    - tests/unit/seo-actions.test.ts
    - tests/unit/app-icons.test.ts
decisions:
  - "saveSeo follows identical server action pattern as saveBranding: validate -> upload -> upsert -> invalidate -> revalidate"
  - "app-icons.test.ts updated to allow dynamic icons in generateMetadata while still forbidding hardcoded <link> tags"
  - "seo-actions.test.ts uses inline seoSchema mock for wave-order safety (same pattern as branding-actions.test.ts)"
metrics:
  duration: 13min
  completed: "2026-05-03"
  tasks: 2
  files: 8
---

# Phase 15 Plan 03: /admin/seo Editor, Favicon Upload, Root generateMetadata Summary

SEO management panel at /admin/seo with 4 fields (siteTitle, metaDescription, ogImageUrl, canonicalBaseUrl), favicon upload extension to /admin/branding, and root layout generateMetadata updated to use all new DB-backed SEO fields from platform_branding.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | /admin/seo — actions, editor, page + tests | 015c2cc | app/admin/seo/ (3 files), tests/unit/seo-actions.test.ts |
| 2 | Branding favicon upload + root generateMetadata | 4f2e922 | app/admin/branding/ (3 files), app/layout.tsx, tests/unit/app-icons.test.ts |

## What Was Built

### app/admin/seo/ (3 new files)

**actions.ts** — `saveSeo` server action: validates with `seoSchema`, upserts site_title, meta_description, og_image_url, canonical_base_url to platform_branding id=1, calls `invalidatePlatformConfig()` and `revalidatePath('/', 'layout')`.

**seo-editor.tsx** — Client form component with 4 fields (siteTitle Input, metaDescription Textarea, ogImageUrl Input, canonicalBaseUrl Input), each with a FormDescription explaining its effect. Uses useTransition for pending state, Loader2 spinner on submit.

**page.tsx** — Server page that calls `requireAdmin()`, reads branding from `getBranding()`, pre-populates the form.

### app/admin/branding/actions.ts

Favicon upload added after logo upload block: accepts `faviconFile` from FormData, normalises 0-byte Files to null, uploads to `platform-brand` bucket as `favicon-{Date.now()}.{ext}`, saves public URL to `favicon_url` in upsert payload.

### app/admin/branding/branding-editor.tsx

`EditorBranding` type extended with `faviconUrl: string | null`. Favicon file input added (`.ico,.png,.svg`), with current favicon preview link when set. File appended to FormData as `faviconFile` on submit.

### app/layout.tsx generateMetadata

Expanded to use all new Branding fields:
- `metadataBase` from `canonicalBaseUrl`
- `title.template` using `siteTitle ?? appName`
- `description` from `metaDescription` with fallback
- `openGraph` with OG image and siteName when `ogImageUrl` set
- `icons` with DB favicon when `faviconUrl` set

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale Phase 13 icon test to allow dynamic icons**
- **Found during:** Task 2 (adding `icons:` to generateMetadata)
- **Issue:** Phase 13 `app-icons.test.ts` test `keeps icon metadata out of app/layout.tsx` asserted `/icons\s*:/` must never appear in layout.tsx. Phase 15-03 plan explicitly requires adding `icons: b.faviconUrl ? { icon: b.faviconUrl } : undefined` to generateMetadata.
- **Fix:** Renamed test to `keeps hardcoded icon link tags out of app/layout.tsx`, removed the `/icons\s*:/` assertion, kept the `<link rel="icon">` assertion. Added comment explaining dynamic icons are allowed for DB-backed favicon (Phase 15-03).
- **Files modified:** tests/unit/app-icons.test.ts
- **Commit:** 4f2e922

## Verification Results

```
npm test -- tests/unit/seo-actions.test.ts
  5 passed (5)

npm test
  50 test files, 286 tests passed

npx tsc --noEmit --skipLibCheck
  (no errors)
```

## Known Stubs

None — all fields are wired to the DB via platform_branding id=1 through getBranding() and saveSeo/saveBranding actions.

## Self-Check: PASSED
