---
phase: 13-visual-identity-polish-robust-favicon-and-app-icons-across-all-surfaces
plan: "01"
subsystem: ui
tags: [nextjs, metadata, favicon, manifest, middleware, vitest]
dependency_graph:
  requires: [12-01, 12-05]
  provides: [canonical-app-icons, public-metadata-routes, icon-regression-suite]
  affects: [app/layout.tsx, proxy.ts, lib/supabase/proxy.ts, app/manifest.ts]
tech_stack:
  added: []
  patterns: [app-router-metadata-icons, file-read-regression-tests, explicit-metadata-route-bypass]
key_files:
  created:
    - app/icon.svg
    - app/icon.png
    - app/apple-icon.png
    - app/manifest.ts
    - tests/unit/app-icons.test.ts
  modified:
    - app/favicon.ico
    - proxy.ts
    - lib/supabase/proxy.ts
decisions:
  - Keep the icon set repo-owned under `app/` and rely on App Router metadata files instead of manual head tags.
  - Treat `/icon`, `/apple-icon`, and `/manifest.webmanifest` as explicit public metadata routes in both proxy layers.
  - Keep `app/manifest.ts` static for app naming to avoid build-time failure when platform branding env/config is unavailable.
metrics:
  duration: 6min
  completed: 2026-05-01
  tasks: 2
  files_modified: 8
---

# Phase 13 Plan 01: Canonical App Icons Summary

**App Router-owned favicon, SVG/PNG app icons, manifest metadata, and auth-safe metadata routes locked by a fast regression suite.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-01T20:43:00Z
- **Completed:** 2026-05-01T20:49:16Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added a Phase 13 regression suite that proves canonical icon file presence, manifest contract, no manual icon tags, no `public/` conflicts, and public metadata routing.
- Shipped the complete App Router icon set under `app/`: refreshed `favicon.ico`, new light/dark-aware `icon.svg`, install-safe `icon.png`, Apple touch icon, and `manifest.ts`.
- Updated both proxy layers so anonymous requests to `/icon`, `/apple-icon`, and `/manifest.webmanifest` never hit login redirects.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the icon metadata contract with a fast regression suite** - `ee4d521` (test)
2. **Task 2: Ship canonical icon assets, manifest metadata, and public-route wiring** - `5f11ba8` (feat)

## Files Created/Modified

- `tests/unit/app-icons.test.ts` - file-read regression coverage for icon ownership, manifest content, and middleware safety.
- `app/icon.svg` - visual master for the new monogram tile with explicit light/dark presentation.
- `app/icon.png` - 512x512 raster app icon for install surfaces.
- `app/apple-icon.png` - 180x180 opaque Apple touch icon.
- `app/favicon.ico` - legacy favicon refreshed to match the same monogram.
- `app/manifest.ts` - web manifest exposing `/favicon.ico`, `/icon`, and `/apple-icon` with install metadata.
- `lib/supabase/proxy.ts` - public-route allowlist extended for metadata endpoints.
- `proxy.ts` - middleware matcher updated to bypass metadata routes entirely.

## Decisions Made

- Used App Router metadata files as the only icon source to prevent drift between `app/` and `public/`.
- Kept the manifest app name static instead of calling `getBranding()` because build-time manifest prerendering must not depend on Supabase env/config availability.
- Matched route safety in both `isPublicRoute()` and the root matcher so tests can guard the contract even if one layer regresses later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed build-time branding dependency from `app/manifest.ts`**
- **Found during:** Task 2 (Ship canonical icon assets, manifest metadata, and public-route wiring)
- **Issue:** `npm run build` failed while prerendering `/manifest.webmanifest` because `getBranding()` required Supabase env/config at build time.
- **Fix:** Switched the manifest name/short name to a static `Xtimator` value so metadata generation stays build-safe while icon assets remain repo-controlled per phase scope.
- **Files modified:** `app/manifest.ts`
- **Verification:** `npm test -- --run tests/unit/app-icons.test.ts && npm run build`
- **Committed in:** `5f11ba8`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for correctness. Kept scope aligned with the phase's repo-owned icon boundary.

## Issues Encountered

- `next build` regenerated `next-env.d.ts` route import output; left uncommitted because it was generated noise unrelated to the plan deliverable.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 13 now has canonical icon assets and automated regression coverage.
- Plan 13-02 can focus on the smoke checklist and human verification checkpoint only.

## Known Stubs

None.

## Self-Check: PASSED

- `app/favicon.ico` - FOUND
- `app/icon.svg` - FOUND
- `app/icon.png` - FOUND
- `app/apple-icon.png` - FOUND
- `app/manifest.ts` - FOUND
- `tests/unit/app-icons.test.ts` - FOUND
- `ee4d521` - VERIFIED
- `5f11ba8` - VERIFIED
