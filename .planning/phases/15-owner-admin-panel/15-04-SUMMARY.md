---
phase: 15-owner-admin-panel
plan: "04"
subsystem: landing-page-cms
tags: [landing-page, admin, content-management, props-driven, server-actions]
dependency_graph:
  requires: [15-01]
  provides: [landing-content-editor, props-driven-landing-sections]
  affects: [app/page.tsx, components/landing, app/admin/landing]
tech_stack:
  added: []
  patterns: [useFieldArray, ICON_MAP, BENTO_CLASSES, positional-icon-lookup, details-collapsible]
key_files:
  created:
    - app/admin/landing/actions.ts
    - app/admin/landing/landing-editor.tsx
    - app/admin/landing/page.tsx
  modified:
    - app/page.tsx
    - components/landing/landing-page.tsx
    - components/landing/hero-section.tsx
    - components/landing/how-it-works-section.tsx
    - components/landing/features-section.tsx
    - tests/unit/landing-actions.test.ts
    - tests/unit/components/landing-page.test.tsx
decisions:
  - "ICON_MAP pattern: icons stored as strings in DB, resolved at render via ICON_MAP[feature.icon] ?? BrainCircuit"
  - "BENTO_CLASSES positional array: bento grid classes are layout concerns fixed by position, not DB-editable"
  - "steps prop with STEP_ICONS by position: icons fixed in code, text editable from DB"
  - "Feature icon field rendered as disabled/readonly Input in LandingEditor (icon names are code constants)"
  - "details HTML element for collapsible editor sections (no JS dependency for expand/collapse)"
metrics:
  duration: "11min"
  completed_date: "2026-05-03"
  tasks_completed: 9
  files_modified: 10
---

# Phase 15 Plan 04: Props-driven Landing Sections + /admin/landing Content Editor Summary

Props-driven landing page refactor — HeroSection, HowItWorksSection, and FeaturesSection accept DB-sourced content as props, with getLandingContent() server fetch in app/page.tsx and a full /admin/landing CRUD editor with useFieldArray for steps and features.

## What Was Built

### Landing Section Refactor (Tasks 1-5)

`app/page.tsx` converted to an async server component that calls `getLandingContent()` and passes the result to `LandingPage`. `LandingPage` now accepts a `LandingContent` prop and passes typed slices to each section:

- **HeroSection**: receives `{ heroHeadline, heroSubheadline, ctaLabel }` as `HeroContent` type; renders DB values in h1, subheadline p, and CTA button text
- **HowItWorksSection**: receives `steps[]` prop; `STEP_ICONS = [Mic, Camera, FileText]` resolved by position; hardcoded `const steps` array removed
- **FeaturesSection**: receives `features[]` prop; `ICON_MAP: Record<string, LucideIcon>` for DB string → component resolution; `BENTO_CLASSES` positional lookup for grid layout; hardcoded `const features` array removed

All framer-motion variants and animation wrappers preserved exactly.

### Admin Landing Editor (Tasks 6-8)

- `app/admin/landing/actions.ts`: `saveLandingContent` server action with `requireAdmin()` guard, `landingContentSchema.safeParse()`, upsert to `platform_branding.landing_content`, `invalidatePlatformConfig()`, and `revalidatePath('/')` 
- `app/admin/landing/landing-editor.tsx`: `'use client'` with `useForm` + `zodResolver(landingContentSchema)`, `useFieldArray` for `howItWorksSteps` (3 blocks) and `features` (4 blocks), `<details>` HTML for collapsible sections, `toast.success/error` feedback
- `app/admin/landing/page.tsx`: `requireAdmin()` guard, `getLandingContent()` for initial values, passes `initial={content}` to `LandingEditor`, `force-dynamic`

### Tests (Task 9 + Deviation)

- `tests/unit/landing-actions.test.ts`: 6 passing tests covering JSONB field persistence, howItWorksSteps array, features array, `invalidatePlatformConfig` call count, `revalidatePath('/')`, and validation error for empty heroHeadline
- `tests/unit/components/landing-page.test.tsx`: Updated (Rule 1 - Bug) to pass required content props to the refactored component signatures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated landing-page.test.tsx for new prop signatures**
- **Found during:** Task 9 verification (TypeScript check)
- **Issue:** `tests/unit/components/landing-page.test.tsx` rendered `<HeroSection />`, `<HowItWorksSection />`, `<FeaturesSection />` without props — TS errors TS2741 (missing required props)
- **Fix:** Added `HERO_CONTENT`, `HOW_IT_WORKS_STEPS`, `FEATURES` constants with default content values and passed them as required props in all render calls
- **Files modified:** `tests/unit/components/landing-page.test.tsx`
- **Commit:** 6c5349b (included in main task commit)

## Verification Results

```
TypeScript: 0 errors (pre-existing admin-dashboard.test.ts ChainSpy errors excluded — out of scope)
landing-actions.test.ts: 6/6 tests passed
Full suite: 286/286 tests passed across 50 test files
```

## Known Stubs

None — all content props are wired through from DB via `getLandingContent()` with `DEFAULT_LANDING_CONTENT` as fallback.

## Self-Check: PASSED

- `app/page.tsx` exists with `getLandingContent` import: FOUND
- `app/admin/landing/actions.ts` exists with `invalidatePlatformConfig`: FOUND
- `app/admin/landing/landing-editor.tsx` exists with `useFieldArray`: FOUND
- `app/admin/landing/page.tsx` exists with `LandingEditor`: FOUND
- `components/landing/hero-section.tsx` contains `HeroContent`: FOUND
- `components/landing/features-section.tsx` contains `ICON_MAP`: FOUND
- Commit 6c5349b exists: FOUND
