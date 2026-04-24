---
phase: 11-marketing-landing-page
plan: 02
subsystem: landing
tags: [landing, mobile, responsive, playwright, visual-polish, dark-mode]
dependency_graph:
  requires:
    - 11-01-SUMMARY.md
  provides:
    - Mobile Playwright projects (iOS Safari + Android Chrome)
    - Mobile and brand-palette E2E assertions
    - Production-grade landing components matching UI-SPEC palette contract
  affects:
    - tests/e2e/landing-page.spec.ts
    - components/landing/*
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN for mobile E2E assertions
    - async server component for footer (getBranding() integration)
    - Inline literal colors matching UI-SPEC palette (#13131A, #406EF1, #7FA4F4)
key_files:
  created: []
  modified:
    - playwright.config.ts (already had mobile projects from 11-01)
    - tests/e2e/landing-page.spec.ts
    - components/landing/hero-section.tsx
    - components/landing/how-it-works-section.tsx
    - components/landing/features-section.tsx
    - components/landing/final-cta-section.tsx
    - components/landing/landing-footer.tsx
decisions:
  - Hero workflow panel hidden on xs breakpoint (sm:hidden) to guarantee CTAs above fold on 390px viewports
  - Hero headline updated to D-05 locked copy ('Professional estimates in 5 minutes.')
  - Footer converted to async server component to consume getBranding().appName
  - Card/CardContent dependency removed from FeaturesSection (plain divs with explicit palette tokens)
  - Mobile hero test uses bounding box check against window.innerHeight for above-fold assertion
metrics:
  duration: 6min
  completed: "2026-04-24"
  tasks: 2
  files: 6
---

# Phase 11 Plan 02: Mobile Responsiveness and Visual Polish Summary

**One-liner:** Mobile E2E coverage (no overflow, above-fold CTAs, brand palette assertions) plus production-grade dark-mode landing aligned to `#13131A`/`#406EF1`/`#7FA4F4` UI-SPEC contract.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing mobile and brand palette assertions | cd90bf0 | tests/e2e/landing-page.spec.ts |
| 1 (GREEN) | Update hero assertion to match D-05 locked headline | 04c5990 | tests/e2e/landing-page.spec.ts |
| 2 | Raise landing page to Phase 11 visual contract | 633dbb1 | 5 landing components |

## Decisions Made

1. **Hero side panel hidden on mobile (`sm:hidden`)** — The workflow panel on the right side of the hero was hidden on xs screens. This ensures the headline + CTAs render above the fold at 390px viewport height without any scroll. The panel shows from `sm` breakpoint (640px+) where there is sufficient vertical space.

2. **D-05 locked headline applied** — Updated `hero-section.tsx` from the long walkthrough copy to `"Professional estimates / in 5 minutes."` per CONTEXT.md decision D-05. The E2E test was updated to use a `containsText(/professional estimates/i)` pattern for resilience.

3. **Footer async server component** — `LandingFooter` was converted from a sync function to an `async function` to call `getBranding()` and render `branding.appName` dynamically instead of the hardcoded string "Xtimator".

4. **Plain div cards instead of Card/CardContent** — `FeaturesSection` was rewritten using plain `div` elements with explicit palette values (`bg-[#13131A]`, `border-[rgba(127,164,244,0.14)]`). This avoids the shadcn Card's default border/surface tokens that don't resolve correctly in the dark landing context.

5. **Focus-visible ring-offset colors** — All CTA buttons and links explicitly set `ring-offset-[#0a0a0f]` / `ring-offset-[#13131A]` so the focus ring is visually crisp against dark backgrounds, meeting AA accessibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added D-05 headline to hero and updated test**
- **Found during:** Task 2 (important_context in execution prompt)
- **Issue:** Hero used old copy; CONTEXT.md D-05 locks "Professional estimates in 5 minutes." as the headline. The existing E2E test also hardcoded the old heading text.
- **Fix:** Rewrote headline; updated test `hero` assertion to use regex match on `h1` by level.
- **Files modified:** `hero-section.tsx`, `tests/e2e/landing-page.spec.ts`
- **Commits:** 04c5990, 633dbb1

**2. [Rule 2 - Missing Critical Functionality] Footer hardcoded app name replaced with getBranding()**
- **Found during:** Task 2 (important_context: "App name must come from getBranding().appName")
- **Issue:** LandingFooter had hardcoded `"Xtimator"` string.
- **Fix:** Converted to `async` server component calling `getBranding()`.
- **Files modified:** `components/landing/landing-footer.tsx`
- **Commit:** 633dbb1

### Pre-existing Test Failures (Out of Scope)

6 test files with 33 failing tests were pre-existing before this plan (server-only import errors in admin-gate/admin-test-button, platform-brand-rls integration, missing-key-ux). These exist identically on the baseline before this plan's changes. Logged to `deferred-items.md` per scope boundary rules.

## Known Stubs

None — all data sources are wired (`getBranding()` for footer app name, all section copy is production-ready).

## Self-Check: PASSED

- FOUND: components/landing/hero-section.tsx
- FOUND: components/landing/how-it-works-section.tsx
- FOUND: components/landing/features-section.tsx
- FOUND: components/landing/final-cta-section.tsx
- FOUND: components/landing/landing-footer.tsx
- FOUND: tests/e2e/landing-page.spec.ts
- FOUND commit cd90bf0 (RED test)
- FOUND commit 04c5990 (GREEN test update)
- FOUND commit 633dbb1 (visual polish)
