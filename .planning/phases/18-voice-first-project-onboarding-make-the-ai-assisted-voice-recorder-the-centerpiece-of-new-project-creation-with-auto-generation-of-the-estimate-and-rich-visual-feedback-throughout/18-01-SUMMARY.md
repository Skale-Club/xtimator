---
phase: 18-voice-first-project-onboarding
plan: 01
subsystem: ui
tags: [next-app-router, route-groups, zod, react-hook-form, supabase, vitest, playwright]

requires:
  - phase: 17-navigation-performance
    provides: getCachedCompany with service client pattern + unstable_cache, sidebar revalidation wiring
  - phase: 04-project-creation-workspace
    provides: createProjectAction, projectSchema, NewProjectWizard, StepClientSelect components

provides:
  - 10 Wave 0 test scaffolds covering P18-01 through P18-09 (unit + e2e)
  - Reduced projectSchema to { clientId, clientName } only
  - PLACEHOLDER_PREFIX export for plan 18-03 name-patcher
  - createProjectAction with eager draft creation (status='draft', placeholder name)
  - 1-step NewProjectWizard that pushes to /projects/[id]/capture on submit
  - (capture) route group with full-screen layout escape (no sidebar/topbar)
  - /projects/[id]/capture server page + loading skeleton + minimal CaptureClient shell
  - Skip recording button routing to /projects/[id] workspace

affects:
  - 18-voice-first-project-onboarding (plans 18-02, 18-03 build on this foundation)

tech-stack:
  added: []
  patterns:
    - "(capture) route group pattern for full-screen layout escape from app shell"
    - "PLACEHOLDER_PREFIX export pattern for cross-plan prefix guard"
    - "Wave 0 scaffold pattern: vi.mock target module + expect.fail for Nyquist-compliant test scaffolds"

key-files:
  created:
    - tests/unit/wizard-client-only.test.ts
    - tests/unit/recorder-duration-cap.test.ts
    - tests/unit/recorder-warning-thresholds.test.ts
    - tests/unit/processing-stepper.test.tsx
    - tests/unit/transcript-reveal.test.tsx
    - tests/unit/api/generate-estimate-name-patch.test.ts
    - tests/e2e/capture-fullscreen-shell.spec.ts
    - tests/e2e/voice-first-flow.spec.ts
    - tests/e2e/skip-recording.spec.ts
    - tests/e2e/recorder-mobile.spec.ts
    - app/(capture)/layout.tsx
    - app/(capture)/projects/[id]/capture/page.tsx
    - app/(capture)/projects/[id]/capture/loading.tsx
    - app/(capture)/projects/[id]/capture/capture-client.tsx
  modified:
    - lib/schemas/project.ts
    - lib/actions/project.ts
    - components/projects/new-project-wizard.tsx
    - app/(app)/projects/new/page.tsx
    - components/projects/step-confirmation.tsx
    - components/projects/step-project-details.tsx

key-decisions:
  - "(capture) route group is a sibling to (app) — shares same /projects/[id]/capture URL but mounts own full-screen layout with no sidebar/topbar (confirmed by Next.js App Router docs pattern)"
  - "Orphaned step-confirmation.tsx and step-project-details.tsx retained but converted to any-typed to avoid TypeScript errors; both are dead code now that wizard is 1-step"
  - "Unit scaffold files use explicit vi import from vitest (not vi global) to pass TypeScript compilation"
  - "E2e scaffolds use test.skip(true, reason) so Playwright lists tests without running them until implementing plan"

requirements-completed:
  - P18-01
  - P18-02
  - P18-08

duration: 11min
completed: 2026-05-05
---

# Phase 18 Plan 01: Wave 0 scaffolds + 1-step wizard + eager project creation + (capture) route group

**Reduces the new-project wizard to a single client-select step with eager draft creation, adds a full-screen `/projects/[id]/capture` route group escaping the app shell, and scaffolds all 10 Phase 18 test files covering P18-01 through P18-09.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-05T14:24:02Z
- **Completed:** 2026-05-05T14:35:21Z
- **Tasks:** 3
- **Files modified:** 20

## Accomplishments

- All 10 Wave 0 test scaffolds exist and are committed — unit scaffolds fail predictably (RED); e2e scaffolds compile and list without errors (P18-01..P18-09 covered)
- projectSchema reduced from 6 fields to { clientId, clientName }; PLACEHOLDER_PREFIX exported for plan 18-03 name-patcher; wizard submits eagerly and redirects to /projects/[id]/capture
- (capture) route group created: full-screen layout with no app shell, server page fetching project via cached auth + RLS, minimal CaptureClient shell with working Skip recording button

## Task Commits

1. **Task 1: Wave 0 test scaffolds (10 files)** — `d2d35de` (test)
2. **Task 2: Reduce projectSchema + refactor wizard + eager createProjectAction** — `653d7e9` (feat)
3. **Task 3: Create (capture) route group + full-screen layout + capture page + minimal client shell** — `8dd0cda` (feat)

## Files Created/Modified

- `tests/unit/wizard-client-only.test.ts` — Wave 0 scaffold; turns GREEN after Task 2 (P18-01)
- `tests/unit/recorder-duration-cap.test.ts` — Wave 0 scaffold; RED until plan 18-02 (P18-03)
- `tests/unit/recorder-warning-thresholds.test.ts` — Wave 0 scaffold; RED until plan 18-02 (P18-04)
- `tests/unit/processing-stepper.test.tsx` — Wave 0 scaffold; RED until plan 18-02 (P18-05)
- `tests/unit/transcript-reveal.test.tsx` — Wave 0 scaffold; RED until plan 18-02 (P18-06)
- `tests/unit/api/generate-estimate-name-patch.test.ts` — Wave 0 scaffold; RED until plan 18-03 (P18-07)
- `tests/e2e/capture-fullscreen-shell.spec.ts` — Wave 0 scaffold; skipped until plan 18-03 (P18-02)
- `tests/e2e/voice-first-flow.spec.ts` — Wave 0 scaffold; skipped until plan 18-03 (P18-07)
- `tests/e2e/skip-recording.spec.ts` — Wave 0 scaffold; skipped until plan 18-03 (P18-08)
- `tests/e2e/recorder-mobile.spec.ts` — Wave 0 scaffold; skipped until plan 18-03 (P18-09)
- `lib/schemas/project.ts` — Reduced to { clientId, clientName } + STEP_FIELDS: { 1: ['clientId'] }
- `lib/actions/project.ts` — PLACEHOLDER_PREFIX exported; createProjectAction uses placeholder name + status='draft'
- `components/projects/new-project-wizard.tsx` — 1-step wizard; single Continue to recorder button; pushes to /projects/[id]/capture
- `app/(app)/projects/new/page.tsx` — Removed projectTypes derivation and INDUSTRIES import
- `components/projects/step-confirmation.tsx` — Converted to any-typed (dead code; no longer imported)
- `components/projects/step-project-details.tsx` — Converted to any-typed (dead code; no longer imported)
- `app/(capture)/layout.tsx` — Full-screen layout; auth gate; no sidebar/topbar
- `app/(capture)/projects/[id]/capture/page.tsx` — Server page; getProjectById + notFound() guard
- `app/(capture)/projects/[id]/capture/loading.tsx` — Skeleton while project loads
- `app/(capture)/projects/[id]/capture/capture-client.tsx` — Minimal shell; Skip recording button with data-testid

## Decisions Made

- **Orphaned step components retained with `any` types:** step-confirmation.tsx and step-project-details.tsx are no longer imported by the wizard but were left on disk to avoid removing potentially reusable UI for the estimate editor (Phase 6). Using `any` type avoids TypeScript errors in dead code without a full rewrite.
- **Explicit `vi` import in scaffold files:** vitest's `vi` global isn't in the TypeScript types unless declared; importing explicitly avoids TS2304 errors while keeping the scaffolds TypeScript-clean.
- **E2e scaffolds use `test.skip(true, reason)`:** This makes Playwright list the tests (verifiable via `--list`) without running them, satisfying the Wave 0 "compile without errors" requirement while preventing false positives in CI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in orphaned wizard step components**
- **Found during:** Task 2 (schema reduction)
- **Issue:** Reducing projectSchema to { clientId, clientName } caused TypeScript type errors in step-confirmation.tsx and step-project-details.tsx which still referenced removed fields (name, projectType, targetBudget). `npx tsc --noEmit` failed with ~20 errors.
- **Fix:** Updated both components to use `any` type instead of `ProjectFormValues` since they are now dead code not imported by any active component.
- **Files modified:** components/projects/step-confirmation.tsx, components/projects/step-project-details.tsx
- **Verification:** `npx tsc --noEmit` passes clean (excluding pre-existing blog-content/react-markdown errors unrelated to Phase 18)
- **Committed in:** 653d7e9 (Task 2 commit)

**2. [Rule 1 - Bug] Added explicit vi import to unit scaffold files**
- **Found during:** Task 2 (post-Task 1 TypeScript check)
- **Issue:** Unit scaffold files used `vi.mock(...)` without importing `vi` from vitest. TypeScript reports TS2304: "Cannot find name 'vi'" during `npx tsc --noEmit`.
- **Fix:** Added `vi` to import from 'vitest' in all 5 affected scaffold files.
- **Files modified:** recorder-duration-cap.test.ts, recorder-warning-thresholds.test.ts, processing-stepper.test.tsx, transcript-reveal.test.tsx, generate-estimate-name-patch.test.ts
- **Verification:** `npx tsc --noEmit` passes; vitest run still shows tests as RED (correct)
- **Committed in:** 653d7e9 (Task 2 commit, staged alongside task files)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 - Bug)
**Impact on plan:** Both auto-fixes required for TypeScript compilation correctness. No scope creep.

## Issues Encountered

None — plan executed smoothly. The `--reporter=basic` flag is not a valid vitest CLI option; used command without the flag instead (minor).

## Known Stubs

- `app/(capture)/projects/[id]/capture/capture-client.tsx` — Body renders placeholder text "Recorder will appear here (plan 18-02)". This is intentional; plan 18-02 replaces the stub with the full recorder UI.

## Next Phase Readiness

- Plan 18-02 has a working `/projects/[id]/capture` route with auth gating to extend with the real recorder UI, duration cap, waveform, and multi-stage stepper.
- `PLACEHOLDER_PREFIX` is exported from `lib/actions/project.ts` for plan 18-03's name-patcher to import.
- All 10 Wave 0 test scaffolds are on disk and committed — future plans need only remove `expect.fail()` and `test.skip()` to activate them.
- TypeScript is clean; no build errors to carry forward.

---
*Phase: 18-voice-first-project-onboarding*
*Completed: 2026-05-05*
