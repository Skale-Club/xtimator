# Phase 75: Tour & Tooltip QA - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Auto-generated (skip_discuss=true; spec authored in ROADMAP entry)

<domain>
## Phase Boundary

Fix the post-onboarding tour and ContextualTooltip system shipped in Phase 74 so behavior matches the design intent. Owner reports tooltips popping up unprompted (e.g., the LanguageToggle tooltip floating on dashboard load), positioning regressions, and "meio bugado" overall feel.

**In scope:**
- Every `ContextualTooltip` mount point in the codebase (sidebar, topbar, capture, workspace, etc.)
- Every `TourStep` in the spotlight tour state machine
- Persistence layer for "seen / dismissed" flags
- Reduced-motion + reduced-transparency + ESC handling
- Auto-flip viewport-aware positioning
- Unit tests for state machine + persistence
- Manual UAT in EN/PT/ES

**Out of scope:**
- Adding NEW tour steps or tooltips (this is QA, not feature work)
- Onboarding wizard changes
- Phase 74 architectural rework — only fix-forward on the shipped components

</domain>

<decisions>
## Implementation Decisions (locked)

### Bug classes to address (from owner report + audit)
- **Unprompted appearance** — tooltips render on page load without their documented trigger firing (suspected: `defaultOpen={true}` somewhere, or "first-mount" effect running before persistence check resolves)
- **Position regression** — tooltips drift away from anchor element or get clipped by sticky topbar / hero gradient
- **Persistence flakiness** — dismissed tooltips reappear after refresh in some flows

### Persistence layer
- **Primary:** `localStorage` (per-browser, no DB round-trip, instant)
- **Key namespace:** `xtimator:tour:v1:{tooltipKey}` and `xtimator:tour:v1:spotlight:{stepId}`
- **Schema:** `{ seen: boolean; dismissedAt: ISOString }`
- **Restart flow:** `TourHelpButton` clears `xtimator:tour:v1:*` keys → all reappear on next mount
- **NOT in DB** for v1 — cross-device persistence is overkill for tour-only signals (future seed if anyone asks)

### Positioning
- Use `@floating-ui/react` middleware: `flip` (auto-switch sides), `shift` (keep in viewport), `offset` (gap from anchor)
- Hard rule: never render below sticky topbar (z-index conflict) — `flip` with `padding: { top: 64 }` to avoid

### Animations + a11y
- All animations wrapped in `prefers-reduced-motion: no-preference` media query (CSS) OR `useReducedMotion()` (framer-motion)
- Spotlight backdrop blur disabled if `prefers-reduced-transparency: reduce` (fallback to solid black/60% opacity)
- ESC key dismisses spotlight (TourSpotlight component captures keydown)
- Focus trap released when spotlight closes (use `react-focus-lock` if already installed, else manual)

### Tests
- Unit tests: `tests/unit/tour/tour-state-machine.test.ts` (8+ cases) + `tests/unit/tour/tooltip-persistence.test.ts` (6+ cases)
- E2E: `tests/e2e/tour-flow.spec.ts` — Playwright walks the spotlight tour end-to-end and asserts tooltips don't appear unprompted

### Claude's discretion
- Whether to introduce `@floating-ui/react` (likely already installed via shadcn's tooltip primitive — check) or stick with current implementation if it's already using it
- Whether persistence layer migrates from existing implementation in-place (more risk) or replaces it (cleaner but more code touch)
- Exact alias map for sidebar/topbar/capture tooltip mount points — depends on what RESEARCH finds

</decisions>

<code_context>
## Existing Code Insights (to be confirmed by RESEARCH)

### Reusable Assets
- `components/tour/contextual-tooltip.tsx` — ContextualTooltip wrapper with `tooltipKey` + `text` + `side` props
- `components/tour/tour-provider.tsx` — context provider, likely holds state
- `components/tour/tour-spotlight.tsx` — spotlight overlay component
- `components/tour/tour-step.tsx` — individual step renderer
- `components/tour/tour-help-button.tsx` — restart-tour entry
- `components/tour/welcome-modal.tsx` — onboarding modal
- `components/tour/use-tour.ts` — hook to read/write tour state
- `lib/i18n/use-translation.ts` — `t()` for translating tooltip strings
- `app/(app)/layout.tsx` — app shell wraps children; TourProvider likely mounted here

### Established Patterns
- `'use client'` for any component using hooks
- Tooltip strings passed as plain English props (translated via `t()` inside ContextualTooltip per Phase 74 sweep — needs verification)
- TOUR_TARGET map in sidebar.tsx mapping href → data-tour attribute
- TOOLTIP_KEYS const exports defining all known tooltip mount points

### Integration Points
- App shell (sidebar + topbar) is where most tooltips live
- Capture screens may host tour steps for first-time recording flow
- Welcome modal triggers on first authenticated visit

</code_context>

<specifics>
## Specific Ideas

**The 7 success criteria from the ROADMAP entry are authoritative.** Plans should target each one:

1. **TOUR-FIX-01:** Audit doc `tests/visual/tour-inventory.md` listing every mount point + trigger + dismiss + side
2. **TOUR-FIX-02:** Zero unprompted popups on load/refresh/nav — Playwright spec opens every page and asserts no tooltip visible by default
3. **TOUR-FIX-03:** Positioning with auto-flip via `@floating-ui/react` middleware; padding around sticky topbar
4. **TOUR-FIX-04:** Dismissal persists per-user via localStorage; key namespace `xtimator:tour:v1:*`; only restart via `TourHelpButton` clears
5. **TOUR-FIX-05:** All animations gated by `prefers-reduced-motion`; backdrop blur by `prefers-reduced-transparency`; ESC dismisses; focus trap released on close
6. **TOUR-FIX-06:** Unit tests — state machine (8+) + persistence (6+) — minimum 14 cases total passing
7. **TOUR-FIX-07:** Manual UAT in EN/PT/ES across every tooltip surface; findings → `.planning/known-issues.md` if any

**Plan structure (estimated 4 plans):**
- 75-01: Audit doc + Wave 0 RED tests + persistence layer rewrite (localStorage keys + helpers)
- 75-02: Positioning fix (Floating UI middleware) + reduced-motion/transparency gates + ESC handler
- 75-03: Trigger condition audit + first-show logic fix (no unprompted popups) + Playwright spec
- 75-04: i18n verification pass + UAT runbook + summary

</specifics>

<deferred>
## Deferred Ideas

- Cross-device tour state sync via DB — out of scope (localStorage sufficient for v1)
- Adding new tour steps for unrelated features — separate feature work, not QA
- Tour analytics (which steps users complete vs skip) — future seed if PM wants
- Multi-language tour copy editorial pass — translation of existing copy is in scope; rewriting copy is not

</deferred>
