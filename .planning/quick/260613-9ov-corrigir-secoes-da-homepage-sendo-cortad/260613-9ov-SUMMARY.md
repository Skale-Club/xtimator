---
phase: quick-260613-9ov
plan: 01
subsystem: ui
tags: [landing-page, tailwind, layout, responsive, dvh, overflow]

# Dependency graph
requires:
  - phase: 11-marketing-landing-page
    provides: components/landing snap-page scroller + section components
provides:
  - Homepage snap-page wrappers grow with content instead of clipping at short viewport heights
affects: [landing-page, marketing, homepage-layout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snap-page sections use min-h-[100dvh] (full-screen feel + growable) rather than fixed h-[100dvh]; the single outer overflow-y-scroll container owns scrolling, child wrappers never clip"

key-files:
  created: []
  modified:
    - components/landing/landing-page.tsx

key-decisions:
  - "Used npx tsc --noEmit for the typecheck gate instead of npm run build: the production build has pre-existing unrelated failures and is slow; a pure Tailwind class change cannot affect types"

patterns-established:
  - "Clipping responsibility lives only on the outer scroll container; section wrappers use min-h + no overflow so tall content stays reachable across viewport heights"

requirements-completed: [FIX-HOMEPAGE-CLIP-01]

# Metrics
duration: 3min
completed: 2026-06-13
---

# Phase quick-260613-9ov: Fix Homepage Sections Being Clipped Summary

**Converted the four homepage snap-page wrappers from fixed `h-[100dvh]` + `overflow-hidden` to growable `min-h-[100dvh]`, so tall sections (How it works, Features, Final CTA + Footer) are fully reachable at short laptop/landscape heights without breaking the full-screen feel or introducing a horizontal scrollbar.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-13T11:06:12Z
- **Completed:** 2026-06-13T11:08:53Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Each of the four landing snap-page wrapper divs now uses `min-h-[100dvh]` (at least one screen tall, but grows when content is taller) and no longer carries its own `overflow-hidden`, so content that exceeds the dynamic viewport is reachable via the existing outer `overflow-y-scroll` container instead of being clipped.
- Page 3 (Features, `justify-center`) and Page 2 (How it works) no longer clip top/bottom at short heights; Page 4 footer bottom is no longer cut off.
- Outer scroll container (line 46, keeps `h-[100dvh] overflow-y-scroll overflow-x-hidden`) and every section component (`hero-section.tsx` and its intentional internal `overflow-hidden`, `how-it-works-section.tsx`, `features-section.tsx`, `final-cta-section.tsx`, `trust-bar.tsx`, `landing-footer.tsx`) were left untouched, preserving the hero image clip and the no-horizontal-scroll behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert the four snap-page wrappers from fixed-height clipping to min-height growable** - `0eaf535` (fix)

## Files Created/Modified
- `components/landing/landing-page.tsx` - Four snap-page wrapper divs: `h-[100dvh]` -> `min-h-[100dvh]` and removed each wrapper's own `overflow-hidden`. All other classes (`pt-16`, `justify-center` on Page 3, `relative` + `sm:pb-0` on Page 4) preserved verbatim. Line 46 outer scroller unchanged.

## Decisions Made
- **Typecheck gate via `npx tsc --noEmit` instead of `npm run build`:** the plan's primary verify was `npm run build`, but the constraints permit preferring `tsc --noEmit` when the full build is slow or has pre-existing unrelated failures. A pure Tailwind class string change cannot affect TypeScript types, and `tsc` confirmed 0 new type errors. Reported exactly what was run below.

## Deviations from Plan

None - plan executed exactly as written. The four wrapper edits match the plan's `<interfaces>` block before/after exactly.

## Issues Encountered

**Pre-existing lint and typecheck errors (out of scope — not introduced by this change):**

- `npm run lint` exits non-zero, but the only error in the edited file (`components/landing/landing-page.tsx:29`, `react-hooks/set-state-in-effect` inside the untouched `useEffect`) is identical on the baseline. Confirmed by stashing the change and re-linting the file: same `1 problem (1 error, 0 warnings)` before and after. The rule fires codebase-wide (bottom-nav, language-toggle, estimate-creation-popup, etc.); none of these is caused by the Tailwind class change, which touched only JSX wrapper class strings at lines 53/67/72/77.
- `npx tsc --noEmit` reports 5 errors total, all in unrelated files (`app/admin/integrations/actions.ts` + `lib/billing/stripe-client.ts` Stripe API-version string mismatch; `tests/unit/notifications/account-emails.test.ts` Branding type missing fields). 0 errors in any landing file. Confirmed identical count (5) on baseline by stashing the change and re-running.

These are tracked as pre-existing; per the deviation scope boundary they were not fixed (they are unrelated to this task's changes).

## Verification

- **Diff confined to scope:** `git diff components/landing/landing-page.tsx` shows exactly four changed wrapper lines, each `h-[100dvh]` -> `min-h-[100dvh]` with `overflow-hidden` removed. Line 46 (outer scroller) unchanged. No section component files touched.
- **Lint:** ran `npx eslint components/landing/landing-page.tsx` — 1 pre-existing error (line 29, untouched `useEffect`), 0 new errors vs. baseline (verified via stash/re-lint).
- **Typecheck:** ran `npx tsc --noEmit` — 5 pre-existing unrelated errors, 0 in landing files, 0 new vs. baseline (verified via stash/re-run). Used in place of `npm run build` per constraints (build slow + pre-existing failures; pure CSS-class change cannot affect types).
- **Browser visual verification:** deferred to the orchestrator per task constraints (short laptop ~1280x720 / ~1366x650, normal desktop, landscape phone ~844x390).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Change is committed (`0eaf535`) on `dev`. Ready for the orchestrator's browser-based visual verification across viewport heights.
- No blockers. No follow-up required for this fix.

## Known Stubs

None - no stubs introduced; this is a layout-only CSS class change.

## Self-Check: PASSED

- FOUND: `components/landing/landing-page.tsx` (all four wrappers use `min-h-[100dvh]`, no wrapper-level `overflow-hidden`)
- FOUND commit: `0eaf535`
- FOUND: `.planning/quick/260613-9ov-corrigir-secoes-da-homepage-sendo-cortad/260613-9ov-SUMMARY.md`

---
*Phase: quick-260613-9ov*
*Completed: 2026-06-13*
