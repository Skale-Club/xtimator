---
phase: 80-walkthrough-audit-debug-polish
plan: "03"
subsystem: tour
tags: [a11y, performance, inert, autoUpdate, floating-ui, reduced-transparency]
dependency_graph:
  requires: [80-02]
  provides: [TOUR-QA-03, TOUR-QA-04]
  affects: [app/(app)/layout.tsx, components/tour/tour-spotlight.tsx, components/tour/contextual-tooltip.tsx]
tech_stack:
  added: []
  patterns:
    - "HTML inert attribute for a11y focus containment during modal overlays"
    - "@floating-ui/dom autoUpdate (ResizeObserver + scroll listener, animationFrame: false) replacing continuous rAF loop"
    - "prefers-reduced-transparency matchMedia gate on client components"
key_files:
  created: []
  modified:
    - app/(app)/layout.tsx
    - components/tour/tour-spotlight.tsx
    - components/tour/contextual-tooltip.tsx
decisions:
  - "Inner wrapper approach chosen for data-tour-shell: Sidebar + flex-1 content + BottomNav wrapped in <div data-tour-shell='true'>, all overlays (TourSpotlight, TourHelpButton, WelcomeModal, UpgradeModal, etc.) moved outside so inert never affects the spotlight card itself"
  - "autoUpdate options: { animationFrame: false } — uses ResizeObserver + scroll listener only, no rAF; rect set immediately on mount to avoid blank first frame"
  - "ContextualTooltip reducedTransparency adds bg-popover + text-popover-foreground + border + shadow-md + backdrop-blur-none — backdrop-blur-none overrides any glass utility class a caller might pass via className"
metrics:
  duration_seconds: 174
  completed_date: "2026-05-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
requirements:
  - TOUR-QA-03
  - TOUR-QA-04
---

# Phase 80 Plan 03: A11y + Performance Hardening Summary

A11y + performance hardening for the tour system: Tab key containment via HTML `inert`, battery-efficient position tracking via `@floating-ui/dom` autoUpdate, and `prefers-reduced-transparency` parity in ContextualTooltip.

## What Was Built

### Task 1 — data-tour-shell wrapper + inert focus containment (TOUR-QA-03)

**app/(app)/layout.tsx — inert scoping approach:**
Used the dedicated inner wrapper approach from the plan. Wrapped only the interactive app shell (Sidebar + flex-1 content div + BottomNav) in a new `<div data-tour-shell="true" className="flex flex-1">`. All overlay components (TranslationLoadingOverlay, UpgradeModal, WelcomeModal, TourSpotlight, TourHelpButton, OfflineIndicator, InstallPrompt, SWRegister) moved outside the wrapper, inside the outer `div.flex.h-screen`.

This ensures `inert` on `[data-tour-shell]` locks out Tab/clicks on the sidebar, topbar, and main content without affecting the spotlight card, help button, or any other overlay.

**components/tour/tour-spotlight.tsx — inert useEffect:**
Added a new useEffect keyed on `showSpotlight` after the existing ESC/focus-restore effect:
```typescript
useEffect(() => {
  if (!showSpotlight) return
  const shell = document.querySelector('[data-tour-shell]') as HTMLElement | null
  if (shell) shell.inert = true
  return () => { if (shell) shell.inert = false }
}, [showSpotlight])
```
Cleanup restores inert=false when spotlight closes. The HTML `inert` attribute is baseline 2023 (Chrome 102+, Safari 15.5+, Firefox 112+).

### Task 2 — autoUpdate + prefers-reduced-transparency (TOUR-QA-04 + TOUR-QA-03)

**components/tour/tour-spotlight.tsx — autoUpdate integration:**
- Added `import { autoUpdate } from '@floating-ui/dom'` (transitive dep via @floating-ui/react-dom — no new install)
- Removed `frameRef` (useRef<number | null>(null)) entirely
- Added `spotlightRef = useRef<HTMLDivElement>(null)` attached to the spotlight hole div as the "floating" element required by autoUpdate
- Replaced the continuous rAF loop with:

```typescript
useEffect(() => {
  if (!showSpotlight || !spotlightRef.current) return
  const el = findVisibleTarget(currentStep.target)
  if (!el) { setRect(null); return }

  // Set rect immediately — no blank first frame
  const r = el.getBoundingClientRect()
  setRect({ top: r.top, left: r.left, width: r.width, height: r.height })

  // ResizeObserver + scroll listener only — no rAF polling (TOUR-QA-04)
  const cleanup = autoUpdate(el, spotlightRef.current!, () => {
    const r2 = el.getBoundingClientRect()
    setRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height })
  }, { animationFrame: false })
  return cleanup
}, [showSpotlight, currentStep.target])
```

Reference element: the tour target DOM element (e.g. `[data-tour="new-project"]`).
Floating element: `spotlightRef.current` — the spotlight hole div.
Options: `{ animationFrame: false }` — fires only on actual layout changes via ResizeObserver/scroll.

**components/tour/contextual-tooltip.tsx — prefers-reduced-transparency:**
Added inside the component function (before return):
```typescript
const reducedTransparency =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-transparency: reduce)').matches
```

Applied conditionally to TooltipContent className:
```tsx
className={cn(
  "max-w-xs text-pretty",
  reducedTransparency && "bg-popover text-popover-foreground border border-border shadow-md backdrop-blur-none",
  className
)}
```
`backdrop-blur-none` overrides any glass utility class a caller might pass via `className`.

## Test Status

16/16 tour unit tests passing (2 test files: tour-state-machine.test.ts + tooltip-persistence.test.ts).

TypeScript: clean — no source errors (pre-existing stale .next/dev/types cache errors in validator.ts are unrelated to these changes).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are complete and wired correctly.
