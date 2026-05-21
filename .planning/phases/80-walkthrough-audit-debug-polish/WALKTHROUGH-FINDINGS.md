# Phase 80 — WALKTHROUGH-FINDINGS

**Date:** 2026-05-21
**Tester:** deferred
**Branch:** dev

## Status

Manual UAT deferred — proceeding with known risks from SEED-029 / Phase 75 research audit as the working assumption.

## Known Issues (from research — not yet browser-confirmed)

| # | Severity | Issue | Source |
|---|----------|-------|--------|
| 1 | High | Dual `[data-tour="language-toggle"]` selector — mobile may highlight hidden topbar element instead of visible bottom-nav | SEED-029 / 75-RESEARCH.md |
| 2 | Medium | rAF continuous loop (60fps) while spotlight open — jank on low-end mobile | tour-spotlight.tsx:73-94 |
| 3 | Medium | No `inert` on background during spotlight — Tab focus leaks to sidebar/topbar | tour-spotlight.tsx (missing) |
| 4 | Low | `prefers-reduced-transparency` gate missing from ContextualTooltip (present in TourSpotlight) | contextual-tooltip.tsx |
| 5 | Low | Help button z-50 may collide with Sonner toasts | tour-help-button.tsx:35 |

## Copy Audit

Tour step copy confirmed accurate against current UI (verified via code inspection in research phase).

## Runbook Completion

- [ ] Section A (no unprompted tooltips) — not run
- [ ] Section B (hover reveals) — not run
- [ ] Section C (spotlight walkthrough) — not run
- [ ] Section D (a11y preferences) — not run
- [ ] Section E (persistence) — not run

## Notes

Proceeding to Plans 02–04 based on research findings. Browser confirmation deferred to user testing session.
