---
phase: 74-post-onboarding-app-feature-tour
plan: 03
subsystem: ui
tags: [tour, tooltips, localStorage, contextual-discovery, i18n, client-component]

# Dependency graph
requires:
  - phase: 74-01
    provides: useTour hook + TourProvider foundation (TOUR_KEYS, localStorage patterns)
  - phase: 12-i18n-translation-system
    provides: useTranslation() hook and t() for multi-language support

provides:
  - ContextualTooltip generic component keyed by localStorage (components/tour/contextual-tooltip.tsx)
  - TOOLTIP_KEYS constants for all 5 surfaces
  - 5 tooltip placements: sidebar Price Book, sidebar Clients, topbar Language Toggle, Estimate Totals Grand Total, Plain Text Card title

affects:
  - 74-04 (any downstream tour surfaces can reuse ContextualTooltip + TOOLTIP_KEYS)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "localStorage key-per-surface pattern: each tooltip stores 'seen' independently via TOOLTIP_KEYS"
    - "SSR-safe mounted guard: useState(false) + useEffect sets mounted=true before reading localStorage"
    - "Wrapper pattern: ContextualTooltip wraps children in relative inline-flex span; absolute-positioned tooltip bubble floats outside"
    - "TOOLTIP_MAP inside map(): inline Record keyed by href, avoids module-level state"

key-files:
  created:
    - components/tour/contextual-tooltip.tsx
  modified:
    - components/app-shell/sidebar.tsx
    - components/app-shell/topbar.tsx
    - components/workspace/estimate/estimate-totals.tsx
    - components/workspace/send/plain-text-card.tsx

key-decisions:
  - "TOOLTIP_MAP defined inside NAV_ITEMS.map() body — static constant, no closure cost, keeps tooltip config co-located with rendering logic"
  - "side prop defaults to 'right' matching most common sidebar use case; callers override for topbar (bottom) and estimate total (top)"
  - "ContextualTooltip renders children as React.Fragment when not visible — zero overhead when dismissed, no wrapper DOM node"
  - "Text passed as raw English string prop through t() inside component — callers don't need to call t() themselves"

requirements-completed: [TOUR-04]

# Metrics
duration: 4min
completed: 2026-05-19
---

# Phase 74 Plan 03: Post-Onboarding App Feature Tour — Contextual Tooltips Summary

**Generic localStorage-keyed ContextualTooltip component with 5 independent first-visit placements across sidebar, topbar, estimate editor, and send tab**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-19T11:19:11Z
- **Completed:** 2026-05-19T11:23:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `ContextualTooltip` is a fully generic `'use client'` component: reads its localStorage key on mount (SSR-safe via `mounted` guard), shows if not 'seen', dismisses via X button setting key to 'seen', and wraps optional children in `relative inline-flex` span with an absolute-positioned tooltip bubble
- `TOOLTIP_KEYS` exports all 5 localStorage key strings as `as const` object — single import for all consumers
- Sidebar gets 2 tooltips: `/clients` (right-side) and `/settings/price-book` (right-side) — implemented via `TOOLTIP_MAP` Record keyed by `item.href` inside the `NAV_ITEMS.map()` body
- Topbar Language Toggle wrapped in ContextualTooltip with `side="bottom"` + `<span data-tour="language-toggle">` inner wrapper
- Estimate Totals Grand Total label wrapped with `side="top"` so tooltip floats above the row
- Plain Text Card title wrapped with `side="bottom"` for the WhatsApp/SMS copy surface

## Task Commits

1. **Task 1: ContextualTooltip component + TOOLTIP_KEYS** - `911831f` (feat)
2. **Task 2: Place 5 contextual tooltips at target surfaces** - `fadb5f1` (feat)

## Files Created/Modified

- `components/tour/contextual-tooltip.tsx` — ContextualTooltip + TOOLTIP_KEYS (created)
- `components/app-shell/sidebar.tsx` — TOOLTIP_MAP + ContextualTooltip wrapping for clients + price-book links
- `components/app-shell/topbar.tsx` — ContextualTooltip wrapping LanguageToggle
- `components/workspace/estimate/estimate-totals.tsx` — ContextualTooltip on Grand Total label
- `components/workspace/send/plain-text-card.tsx` — ContextualTooltip on Plain Text CardTitle

## Decisions Made

- `TOOLTIP_MAP` inline in map body: static Record keyed by `item.href`, keeps tooltip config co-located with link rendering — no module-level state needed
- `side` prop defaults to `'right'` for sidebar use, callers specify `bottom`/`top` for topbar and estimate surfaces
- `ContextualTooltip` renders `<>{children}</>` when not visible — zero wrapper DOM overhead after dismissal
- English text passed as raw string prop; `t()` called inside component — callers don't pre-translate

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all 5 tooltips are wired to real surfaces with real text.

## Self-Check: PASSED

- `components/tour/contextual-tooltip.tsx` — FOUND
- `components/app-shell/sidebar.tsx` has TOOLTIP_KEYS.clients + TOOLTIP_KEYS.priceBook — FOUND
- `components/app-shell/topbar.tsx` has TOOLTIP_KEYS.languageToggle — FOUND
- `components/workspace/estimate/estimate-totals.tsx` has TOOLTIP_KEYS.estimateTotal — FOUND
- `components/workspace/send/plain-text-card.tsx` has TOOLTIP_KEYS.whatsapp — FOUND
- Commit 911831f (Task 1) — FOUND
- Commit fadb5f1 (Task 2) — FOUND

---
*Phase: 74-post-onboarding-app-feature-tour*
*Completed: 2026-05-19*
