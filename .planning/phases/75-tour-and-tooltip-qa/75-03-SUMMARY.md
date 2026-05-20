---
phase: 75
plan: 03
subsystem: tour
tags: [tour, spotlight, a11y, playwright, e2e, wave-3]
requires:
  - "75-02 (useTour migrated to xtimator:tour:v1:* + resetAllTourState exposed)"
provides:
  - "TourSpotlight a11y bundle — ESC dismiss, focus restore, reduced-motion + reduced-transparency gates (TOUR-FIX-05)"
  - "findVisibleTarget() helper resolving the dual-mount language-toggle bug on mobile"
  - "TourHelpButton full-restart wiring (clears xtimator:tour:v1:*, re-arms spotlight)"
  - "tests/e2e/tour-flow.spec.ts — discoverable Playwright coverage for TOUR-FIX-02 + TOUR-FIX-05"
affects:
  - "75-04 (UAT — runbook can lean on the spec for ESC + reduced-motion regression checks once auth fixture exists)"
tech-stack:
  added: []
  patterns:
    - "findVisibleTarget(selector) — offsetParent + getBoundingClientRect filter for picking the visible match among duplicate data-tour mounts"
    - "useReducedMotion() from framer-motion to gate CSS transitions"
    - "window.matchMedia('(prefers-reduced-transparency: reduce)') sampled per render to swap glass-strong → solid surface"
    - "previousFocusRef capture-on-open / restore-on-close for spotlight focus return (lighter than a full focus trap)"
    - "Playwright addInitScript wiping xtimator:tour:v1:* + legacy keys in beforeEach"
key-files:
  created:
    - "tests/e2e/tour-flow.spec.ts"
  modified:
    - "components/tour/tour-spotlight.tsx"
    - "components/tour/tour-help-button.tsx"
decisions:
  - "Spotlight focus management: capture-and-restore via previousFocusRef rather than a full focus trap — CONTEXT.md asks for 'focus trap released on close', which boils down to 'don't leave focus on an unmounted element'. Zero new deps, no risk of trap-leak edge cases."
  - "Card surface fallback under prefers-reduced-transparency: 'bg-background border border-border shadow-xl' — solid token surface that matches the rest of the design system rather than inventing a new opaque variant."
  - "findVisibleTarget falls back to candidates[0] if no candidate passes visibility checks — keeps the spotlight from disappearing during a transient layout glitch rather than going null and confusing the rAF loop."
  - "Playwright spec uses requireDashboard(page) skip-with-reason pattern instead of failing when auth is missing — keeps the spec compiling and discoverable in the suite until a shared auth fixture lands. 75-04 UAT covers the authenticated path manually."
requirements:
  - TOUR-FIX-02
  - TOUR-FIX-05
metrics:
  duration_seconds: 227
  completed_at: "2026-05-20T03:39:33Z"
  tasks: 3
  files_created: 1
  files_modified: 2
  commits: 3
---

# Phase 75 Plan 03: TourSpotlight a11y + TourHelpButton Restart + Playwright Spec Summary

Closed the spotlight a11y bundle (ESC dismiss, focus restore, reduced-motion
and reduced-transparency gates), fixed the dual-mount mobile bug at
`[data-tour="language-toggle"]` by replacing the bare `document.querySelector`
with a visibility-filtered helper, wired `TourHelpButton` to perform a true
restart-from-scratch via `resetAllTourState() + startTour()`, and shipped
the Playwright spec covering TOUR-FIX-02 + TOUR-FIX-05. All 16 unit tests
from 75-01/02 are still GREEN, typecheck is clean, no new deps.

## What Shipped

### 1. `components/tour/tour-spotlight.tsx` (89-line diff, surgical)

The bug at line 38 (`document.querySelector(currentStep.target)` returning
the first DOM match regardless of CSS visibility) is gone. New helper near
the top of the module:

```ts
function findVisibleTarget(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
  for (const el of candidates) {
    if (el.offsetParent === null) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    return el
  }
  return candidates[0] ?? null
}
```

`offsetParent === null` catches `display:none` chains, the zero-size rect
catches `visibility:hidden` and collapsed elements. The rAF loop calls
`findVisibleTarget` every frame so a viewport breakpoint change
(topbar hidden at the `md` breakpoint on mobile) re-picks the visible
bottom-nav anchor automatically.

Four other surgical changes:

- **ESC handler** — a `useEffect` keyed on `showSpotlight` registers a
  `keydown` listener on `document` that calls `handleClose()` on
  `Escape`. Lives in its own effect (separate from the rAF effect) so
  it tears down cleanly on close.
- **Focus restore** — same effect captures `document.activeElement` at
  open and calls `.focus?.()` on cleanup. Not a full focus trap — just
  prevents focus from landing on a now-unmounted element.
- **Reduced-motion gate** — `useReducedMotion()` from framer-motion drives
  `spotlightTransition` (`'none'` when the user opted out, otherwise the
  original `top/left/width/height 0.2s ease` chain). framer-motion was
  already in deps via Phase 74 — zero churn.
- **Reduced-transparency gate** — `window.matchMedia('(prefers-reduced-transparency:
  reduce)').matches` sampled per render swaps `cardSurfaceClass` from
  `glass-strong border border-[var(--glass-border)] shadow-glass` (which
  uses `backdrop-filter: blur(...)` per `app/globals.css:388`) to
  `bg-background border border-border shadow-xl`.

What was preserved: the rAF loop, the `boxShadow: 0 0 0 9999px` spotlight
technique, the Math.max/min card-position clamp, `role="dialog"` +
`aria-label`. RESEARCH suggested moving to an SVG mask and Floating UI,
both explicitly out of scope per the plan.

### 2. `components/tour/tour-help-button.tsx` (11-line addition)

Today (post-75-02) the button set review mode + opened the welcome modal
but didn't actually clear any tour state — a "restart" would silently
inherit every dismissed tooltip. New onClick:

```tsx
function handleClick() {
  resetAllTourState()   // wipes every xtimator:tour:v1:* key
  startTour()           // resets completed=false + sets pending=true
  setIsReviewMode(true)
  setShowWelcome(true)
}
```

The `aria-label`, position classes, and visibility-during-spotlight gate
are untouched.

### 3. `tests/e2e/tour-flow.spec.ts` (NEW, 174 lines, 5 test cases)

| # | Test                                                        | Asserts                                                                                |
| - | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1 | TOUR-FIX-02: no tooltip visible on dashboard load           | `[role="tooltip"]` count = 0 after `networkidle`                                       |
| 2 | TOUR-FIX-02: hovering language toggle reveals its tooltip   | `[data-tour="language-toggle"]` hover → `[role="tooltip"]` visible within 2s           |
| 3 | TOUR-FIX-02: tooltip hides on hover-away                    | After hover-away (`mouse.move(0,0)`) tooltip count returns to 0                        |
| 4 | TOUR-FIX-05: ESC dismisses the spotlight                    | `[role="dialog"][aria-label]` visible, then `Escape` keypress, then count = 0          |
| 5 | TOUR-FIX-05: spotlight functions under prefers-reduced-motion | `emulateMedia({ reducedMotion: "reduce" })`; walk 5 steps; spotlight gone after Done |

`beforeEach` calls `page.addInitScript` to wipe both the new namespace
(`xtimator:tour:v1:*`) and the 7 legacy keys, so each test starts from a
clean state regardless of cached state.

`requireDashboard(page)` helper skips the test with a clear reason if the
unauthenticated dashboard redirects to `/login` — keeps the spec
compiling and discoverable in the suite. The day a shared auth fixture
lands, all 5 tests will actually run (currently they're discovered as
5 × 3 projects = 15 total by `playwright --list`).

## Verification

| Step                                              | Command                                                  | Result                                                                          |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Spotlight markers + typecheck                     | grep `findVisibleTarget`, `Escape`, `useReducedMotion`, `prefers-reduced-transparency`, `previousFocusRef` + `npx tsc --noEmit` | All tokens present, 0 errors |
| TourHelpButton markers + typecheck                | grep `resetAllTourState`, `startTour` + `npx tsc --noEmit` | OK + 0 errors |
| Spec length + markers                             | grep `TOUR-FIX-02`, `TOUR-FIX-05`, `role="tooltip"`, `Escape`, `reducedMotion`; length ≥ 2000 | OK, length = 6372 |
| Tour unit suite still GREEN                       | `npx vitest run tests/unit/tour/`                        | 16/16 pass (2 files, 2.22s) |
| Playwright discovery                              | `npx playwright test tests/e2e/tour-flow.spec.ts --list` | 15 tests (5 × chromium + mobile-safari + mobile-chrome)                         |
| No legacy keys in tour module                     | grep `tooltip_seen_` / `tour_completed` / `tour_spotlight_pending` in modified components | OK no legacy keys |
| No new npm deps                                   | `git diff HEAD package.json`                             | empty                                                                           |

## Deviations from Plan

None — plan executed exactly as written. The only adjustment was a
mechanical interpretation choice on the reduced-transparency fallback
class (`bg-background border border-border shadow-xl` rather than
inventing a new opaque variant) and explicitly using
`requireDashboard(page)` to short-circuit on auth-redirect rather than
hard-failing the test. Both choices match the plan guidance verbatim.

## Commits

| # | Hash      | Message                                                                                       |
| - | --------- | --------------------------------------------------------------------------------------------- |
| 1 | `9801c03` | feat(75-03): a11y spotlight — ESC, focus return, reduced-motion/transparency, visible-target  |
| 2 | `9b05de9` | feat(75-03): TourHelpButton restart clears all tour state                                     |
| 3 | `f1958a4` | test(75-03): playwright tour-flow spec covering TOUR-FIX-02 + TOUR-FIX-05                     |

All committed with `--no-verify` per orchestrator instruction.

## Handoff Notes for 75-04 (UAT)

- The Playwright spec is currently auth-gated and will `test.skip` on a
  dev box without authentication. UAT in 75-04 should manually walk:
  fresh session → dashboard → confirm no tooltips → hover language toggle
  → confirm tooltip appears → press ESC during spotlight → confirm dismiss
  → OS toggle "reduce motion" → restart tour → confirm no animation
  during transitions.
- `findVisibleTarget` covers the topbar/bottom-nav dual-mount on mobile,
  but UAT should verify visually on iPhone Safari + Android Chrome that
  the spotlight actually highlights the bottom-nav icon on mobile (not a
  ghost rect from a hidden topbar element).
- TourHelpButton now wipes every `xtimator:tour:v1:*` key — verify in
  DevTools > Application > Local Storage that after clicking the help
  button, no `xtimator:tour:v1:*` keys exist, and that dismissed
  tooltips re-appear on hover.

## Self-Check: PASSED

- components/tour/tour-spotlight.tsx — FOUND, contains findVisibleTarget + Escape + useReducedMotion + prefers-reduced-transparency + previousFocusRef
- components/tour/tour-help-button.tsx — FOUND, contains resetAllTourState + startTour calls
- tests/e2e/tour-flow.spec.ts — FOUND, 174 lines, 5 tests discovered by playwright --list
- Commit 9801c03 — present in git log
- Commit 9b05de9 — present in git log
- Commit f1958a4 — present in git log
- npx vitest run tests/unit/tour/ — 16/16 pass
- npx tsc --noEmit — 0 errors
- package.json unchanged
