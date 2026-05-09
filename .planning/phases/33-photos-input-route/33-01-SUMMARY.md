---
phase: 33-photos-input-route
plan: "01"
subsystem: capture-routes
tags: [photos, capture, estimate-generation]
dependency_graph:
  requires:
    - Phase 28 (unified capture - photos-only support in generate-estimate API)
    - Phase 31 (wizard modality selection - routes to /photos-input)
  provides:
    - PHOTO-01: Direct photo upload route `/projects/[id]/photos-input`
    - PHOTO-02: PhotoDropZone reuse from workspace
    - PHOTO-03: Generate button visible when photos >= 1
    - PHOTO-04: API triggers estimate generation, lands in editor
tech_stack:
  added:
    - app/(capture)/projects/[id]/photos-input/page.tsx (server route shell)
    - app/(capture)/projects/[id]/photos-input/photos-input-client.tsx (client wrapper)
    - components/projects/photos-input.tsx (main component)
  patterns:
    - Route shell pattern: identical to describe/ route
    - PhotoDropZone reuse from @/components/workspace/photos/photo-drop-zone
    - generate-estimate API already supports photos-only (hasPhotos check)
key_files:
  created:
    - app/(capture)/projects/[id]/photos-input/page.tsx
    - app/(capture)/projects/[id]/photos-input/photos-input-client.tsx
    - components/projects/photos-input.tsx
decisions:
  - Route uses (capture) route group for full-screen layout consistency with capture/ and describe/
  - Photos state managed locally in PhotosInput; existing project photos not pre-loaded (dedicated upload surface)
  - generate-estimate API handles photos-only path automatically (no transcript required)
metrics:
  duration: ~1 min
  tasks: 3
  files: 3
  commit: 76b3835
---

# Phase 33 Plan 01: Photos Input Route

**One-liner:** Dedicated photo upload route with generate button using existing Claude Vision pipeline

## Completed Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Route shell (/projects/[id]/photos-input) | DONE | 76b3835 |
| 2 | PhotosInput component | DONE | 76b3835 |
| 3 | Build & verify | DONE | 76b3835 |

## Summary

Created the `/projects/[id]/photos-input` route for photo-only capture:

1. **Route Shell** — Server page fetches project + company, renders `PhotosInputClient` wrapper
2. **PhotosInput Component** — Reuses `PhotoDropZone` from workspace, shows photo thumbnails, "Generate from Photos" button enabled when photos >= 1
3. **API Integration** — Calls `/api/generate-estimate` which already supports photos-only path (Phase 28), navigates to estimate editor on success

## PHOTO Requirements Coverage

- **PHOTO-01**: Route exists at `/projects/[id]/photos-input` ✓
- **PHOTO-02**: PhotoDropZone reused from `@/components/workspace/photos/photo-drop-zone` ✓
- **PHOTO-03**: Generate button disabled at 0 photos, enabled with photos >= 1 ✓
- **PHOTO-04**: API call to `/api/generate-estimate`, lands in editor via `router.push` ✓

## Deviation Documentation

None — plan executed exactly as written.

## Self-Check

- [x] npm run build succeeds (photos-input appears in build output)
- [x] Route `/projects/[id]/photos-input` included in build
- [x] Files created: page.tsx, photos-input-client.tsx, photos-input.tsx
- [x] Commit: 76b3835