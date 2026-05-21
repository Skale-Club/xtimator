# Deferred Items — Phase 76.1 PWA Infrastructure

## Pre-existing test failure (out of scope for 76.1-01)

**Test:** `tests/unit/app-icons.test.ts > App Router icon contract (Phase 13) > defines the expected manifest contract`

**Failure:** Test expects `src: '/icon'` and `src: '/apple-icon'` (Next.js App Router dynamic icon routes) in manifest.ts. However, manifest.ts conditionally uses `/icons/icon-192.png` (static files under `public/icons/`) when no branding favicon/logo is set.

**Status:** Pre-existing — was failing before Phase 76.1 started (2 tests failed before; now 1 after fixing publicIconConflicts). Not caused by Phase 76.1 changes.

**Fix needed:** Update `app/manifest.ts` to include `/icon` and `/apple-icon` as additional static icon entries alongside the dynamic branding-based icons. This ensures the manifest always includes the App Router dynamic icon routes as reliable fallbacks.

**Deferred to:** A future cleanup phase or Phase 76.1-02.
