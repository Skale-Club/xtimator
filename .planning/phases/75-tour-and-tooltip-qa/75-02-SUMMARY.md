---
phase: 75
plan: 02
subsystem: tour
tags: [tour, tooltip, radix, persistence, qa, wave-2]
requires:
  - "75-01 (lib/tour/persistence.ts + RED state machine suite)"
provides:
  - "ContextualTooltip as hover/focus-only Radix wrapper (TOUR-FIX-02)"
  - "Radix collisionPadding auto-flip dodging sticky topbar (TOUR-FIX-03)"
  - "useTour() backed by xtimator:tour:v1:* namespace (TOUR-FIX-04)"
  - "Global TooltipProvider + one-shot legacy migration on TourProvider mount"
affects:
  - "75-03 (TourSpotlight rewrite — can rely on namespaced persistence + migration)"
  - "75-04 (UAT — runbook now verifies hover-only tooltip semantics)"
tech-stack:
  added: []
  patterns:
    - "Thin shadcn Tooltip wrapper — back-compat prop surface, behavior fully delegated to Radix"
    - "Mount-time idempotent migration of pre-Phase-75 flat localStorage keys"
    - "TooltipProvider mounted once in TourProvider (shared delayDuration across all ContextualTooltip instances)"
key-files:
  created: []
  modified:
    - "components/tour/contextual-tooltip.tsx"
    - "components/tour/use-tour.ts"
    - "components/tour/tour-provider.tsx"
    - "tests/unit/tour/tour-state-machine.test.ts"
decisions:
  - "Locked: hover/focus on anchor is the sole trigger for ContextualTooltip — no auto-show, no first-visit special case, no timer-based reveal (resolves RESEARCH Open Question #1)"
  - "Locked: TOOLTIP_KEYS values flipped from legacy long form (\"tooltip_seen_*\") to short suffixes (\"price_book\", \"clients\", ...) — back-compat preserved because the prop is now ignored at runtime"
  - "Locked: startTour() always resets the completed flag — restart paths (welcome modal + TourHelpButton) get a true replay"
  - "Test bug discovered in 75-01: tour-state-machine.test.ts:53 (\"clearSpotlightPending leaves completed untouched\") was self-contradicting with the next test — fixed inline (Rule 1)"
requirements:
  - TOUR-FIX-02
  - TOUR-FIX-03
  - TOUR-FIX-04
metrics:
  duration_seconds: 270
  completed_at: "2026-05-20T03:32:23Z"
  tasks: 3
  files_created: 0
  files_modified: 4
  commits: 3
---

# Phase 75 Plan 02: ContextualTooltip Rewrite + useTour Migration Summary

Killed the unprompted-tooltip bug at its root by rewriting `ContextualTooltip`
as a thin shadcn Radix Tooltip wrapper (hover/focus only — no mount-time
auto-show), migrating `useTour()` to the namespaced `xtimator:tour:v1:*`
persistence layer from 75-01, and mounting `TooltipProvider` +
`migrateLegacyKeys()` once at the TourProvider root. All RED state-machine
tests from 75-01 are now GREEN.

## What Shipped

### 1. `components/tour/contextual-tooltip.tsx` (rewritten, 75 lines)

The bug at `contextual-tooltip.tsx:38-44` (mount-time `setVisible(true)` with
no user interaction — RESEARCH "Trace of the LanguageToggle bug") is gone.
Replaced with a thin `<Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger>
<TooltipContent ...>{t(text)}</TooltipContent></Tooltip>` wrapper. Hover or
keyboard focus on the child is now the sole trigger.

What was deleted:
- `useState(visible)` + `useState(mounted)` pair
- `useEffect` that read `localStorage.getItem(tooltipKey)` on mount and
  unconditionally called `setVisible(true)` if no "seen" flag existed
- Hand-rolled Tailwind position classes (`positionClasses` record)
- Dismiss button + `localStorage.setItem` write

What was added:
- `collisionPadding={{ top: 64, bottom: 16, left: 16, right: 16 }}` on
  `TooltipContent` so Radix auto-flips/shifts to dodge the sticky topbar
  (TOUR-FIX-03)
- `sideOffset={8}` for breathing room
- Defensive `if (!children) return null` guard

Back-compat preserved: `TOOLTIP_KEYS`, `TooltipKey`, and `ContextualTooltip`
exports keep their names. `tooltipKey` prop is still accepted (typed as
`TooltipKey | string`) but intentionally ignored at runtime — all 4
consumer files (`topbar.tsx`, `sidebar.tsx`, `estimate-totals.tsx`,
`plain-text-card.tsx`) compile and render unchanged.

### 2. `components/tour/use-tour.ts` (rewritten, 51 lines)

The whole hook now delegates to `lib/tour/persistence` (from 75-01). The
contradictory `startTour() → completeTour()` chain (RESEARCH gotcha #2) is
fixed:

- `startTour()` — resets completed THEN sets pending. A restart from a
  completed state now replays correctly.
- `completeTour()` — marks completed AND clears pending in one call.
- `isTourCompleted()`, `isSpotlightPending()`, `clearSpotlightPending()` —
  pass-through wrappers over the namespaced helpers.
- `resetAllTourState()` — new method exposed for 75-04's TourHelpButton
  full-restart path.

`TOUR_KEYS` constants retained (back-compat) but now point at
`xtimator:tour:v1:spotlight:completed` / `:pending`. No legacy key
(`tour_completed`, `tour_spotlight_pending`) is ever written by this hook
again — locked by state-machine case 8.

### 3. `components/tour/tour-provider.tsx` (surgical edits)

Two changes only — context shape and welcome/spotlight gating logic
untouched:

- Added imports for `TooltipProvider` and `migrateLegacyKeys`.
- Mount `useEffect` now calls `migrateLegacyKeys()` as its FIRST
  statement, before the cookie / pending reads. Existing users with the
  flat pre-Phase-75 keys silently transition; no tooltip resurrection.
- JSX `return` now wraps `{children}` in `<TooltipProvider delayDuration={200}>`
  so every `ContextualTooltip` inherits a shared Provider — avoids
  per-tooltip Provider mounts and the Radix "missing Provider" warning.

The cookie-read logic, dev-only Strict Mode papercut (RESEARCH gotcha #3),
and `useTourContext()` consumer surface are all unchanged.

### 4. `tests/unit/tour/tour-state-machine.test.ts` (1 test setup corrected)

The 75-01 RED suite contained an internally inconsistent test:

```
it("clearSpotlightPending() leaves completed untouched", () => {
  t.completeTour()
  t.startTour()                  // ← per locked spec, this resets completed
  t.clearSpotlightPending()
  expect(t.isTourCompleted()).toBe(true)   // ← but expects it still true
})
```

This directly contradicts the very next test which asserts that
`completeTour() → startTour()` resets completed to `false`. The test name
("clearSpotlightPending leaves completed untouched") makes the actual
intent clear: prove that `clearSpotlightPending` alone doesn't wipe
completed. Fixed the setup to arm pending via the persistence helper
directly (`setSpotlightPending()`) instead of going through `startTour()`.

Tracked as Rule 1 deviation (test bug fix). No production code change.

## Verification

| Step | Command | Result |
|------|---------|--------|
| Tour unit suite (state machine + persistence) | `npx vitest run tests/unit/tour/` | 16/16 pass (was 9 pass + 6 RED in 75-01) |
| TypeScript clean | `npx tsc --noEmit` | 0 errors |
| TourProvider markers | grep for `TooltipProvider`, `migrateLegacyKeys()`, both new imports | OK |
| No legacy keys in tour module | grep `tooltip_seen_` / `tour_completed` / `tour_spotlight_pending` across all 3 files | OK no legacy keys |
| Consumer compile | `npx tsc --noEmit` covers `topbar.tsx`, `sidebar.tsx`, `estimate-totals.tsx`, `plain-text-card.tsx` | All clean — same `<ContextualTooltip text="..." side="...">` API |
| No new deps | `git diff HEAD package.json` | empty — no churn |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Fixed self-contradicting test in tests/unit/tour/tour-state-machine.test.ts**
- **Found during:** Task 2 (state machine run after use-tour.ts migration)
- **Issue:** Two adjacent tests in the 75-01 RED suite required mutually exclusive `completed` flag values after the same `completeTour() → startTour()` sequence. Per the locked spec (and the very next test "re-startTour after completion re-arms pending and resets completed"), `startTour()` MUST reset completed. The other test ("clearSpotlightPending leaves completed untouched") expected completed to remain `true`, making both cases impossible to pass.
- **Fix:** Rewrote the test setup to arm pending directly via `setSpotlightPending()` (the persistence helper) rather than `startTour()`. This matches the test's stated intent ("clearSpotlightPending leaves completed untouched") without touching the disputed startTour behavior.
- **Files modified:** `tests/unit/tour/tour-state-machine.test.ts`
- **Commit:** `ec36604` (folded into the Task 2 commit since the fix is what made the suite go fully GREEN)

No other deviations — plan executed as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `e99a82c` | feat(75-02): rewrite ContextualTooltip as Radix hover/focus wrapper |
| 2 | `ec36604` | feat(75-02): migrate useTour to namespaced persistence |
| 3 | `c035410` | feat(75-02): mount TooltipProvider + run legacy migration in TourProvider |

All committed with `--no-verify` per orchestrator instruction.

## Handoff Notes for 75-03

- `clearAllTourState()` and `migrateLegacyKeys()` are stable and tested —
  TourSpotlight rewrite can rely on them.
- `useTour().resetAllTourState()` is the path TourHelpButton should call
  for a full restart-from-scratch (75-04 wiring).
- `TooltipProvider` is now mounted globally — TourSpotlight should NOT
  mount its own Provider for the spotlight card.
- All hover tooltips work; positioning auto-flips via `collisionPadding`.
  The spotlight card (separate component) still needs the same treatment
  in 75-03 (Floating UI `flip` + `shift` + `offset` middleware).

## Self-Check: PASSED

- components/tour/contextual-tooltip.tsx — FOUND, no useEffect/setVisible/localStorage
- components/tour/use-tour.ts — FOUND, imports from @/lib/tour/persistence
- components/tour/tour-provider.tsx — FOUND, contains TooltipProvider + migrateLegacyKeys()
- tests/unit/tour/tour-state-machine.test.ts — FOUND, 9/9 GREEN
- Commit e99a82c — present in git log
- Commit ec36604 — present in git log
- Commit c035410 — present in git log
