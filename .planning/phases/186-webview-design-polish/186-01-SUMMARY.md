---
phase: 186-webview-design-polish
plan: 01
subsystem: ui
tags: [tailwind, react, estimate-document, webview-polish, typography]

# Dependency graph
requires:
  - phase: 182-shared-document-engine
    provides: brandText/brandOnFill tokens and shared DocumentTotals/section-header structure this plan restyles
provides:
  - Desktop-only zebra-contrast bump (bg-muted/20 -> bg-muted/40) on Classic's two desktop table row sites
  - Mobile-EDIT list zebra fully removed (item-card-mobile.tsx) per the "cards win, mobile drops zebra" decision
  - Classic grand-total visual emphasis (text-3xl font-extrabold + brand-colored top rule)
  - Unified tracking-wide/tracking-widest letter-spacing across Classic's title band + both section-header variants + Modern's section header
affects: [186-webview-design-polish (Plan 02 — mobile-VIEW card treatment, remaining POLISH-01 closure)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zebra striping is a desktop-table-only pattern going forward; every mobile item list drops it in favor of card-like separation (border-b only, no tint)"
    - "Classic's grand-total divider ties to brand identity (borderTopColor: brandText) instead of a neutral border-foreground rule, matching the value span's existing brand-tinted color"

key-files:
  created: []
  modified:
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/estimate/item-card-mobile.tsx
    - components/share/estimate-document-modern.tsx
    - tests/unit/estimate/mobile-line-item.test.tsx
    - tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap

key-decisions:
  - "Zebra stays desktop-table-only; mobile-EDIT list (this plan) and mobile-VIEW list (Plan 186-02 Task 2) both drop the stripe-zebra entirely in favor of a card-like border-only separation (plan-checker Blocker 5, decided)"
  - "Spacing audit (Task 3): SECTION_PX (px-6 sm:px-10) and the py-6/py-6 sm:py-8 vertical rhythm were already uniformly applied across info-grid/totals/terms/photos before this plan — no defect found, no change made"

patterns-established:
  - "Desktop table zebra: even:bg-muted/40 (edit mode, CSS pseudo-class) and idx%2 ternary 'bg-muted/40' (read-only mode) — the two desktop-only zebra call sites"

requirements-completed: []  # POLISH-01 stays open — Phase 186 also has Plan 02 (mobile-VIEW card treatment) still pending; requirement is phase-scoped in REQUIREMENTS.md, not marked complete until the whole phase ships.

# Metrics
duration: 15min
completed: 2026-07-28
---

# Phase 186 Plan 01: Classic Zebra/Totals/Typography Polish Summary

**Desktop-only zebra contrast bump, brand-tied grand-total emphasis (text-3xl font-extrabold), and unified tracking-wide/tracking-widest letter-spacing across both templates' title/section headers — mobile drops zebra entirely.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-28T13:35:00-04:00 (approx.)
- **Completed:** 2026-07-28T13:45:18-04:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Desktop table zebra rows (Classic, both edit-mode `<tr>` and read-only `<tr>`) bumped from `bg-muted/20` to `bg-muted/40` for clearer alternating contrast — zebra is now a desktop-table-only pattern
- `item-card-mobile.tsx`'s mobile-EDIT list lost its `even:bg-muted/20` zebra entirely (no replacement decoration), while its pre-existing "no Card wrapper / no rounded-lg / no glass" contract (Phase 162-05/DOCUX-06) stayed provably intact (verified: `mobile-line-item.test.tsx` lines 39-63 unmodified and green)
- Classic's grand total bumped from `text-2xl font-bold` to `text-3xl font-extrabold`, with its top divider switched from a neutral `border-foreground` rule to a brand-colored rule (`borderTopColor: brandText`) — the total is now unambiguously the most emphasized number on the document
- Classic's ESTIMATE title band (`tracking-wide` → `tracking-widest`) and BOTH section-header title variants (editable `<input>` + read-only `<span>`, both gained `tracking-wide`) now share one consistent letter-spacing scale; Modern's section header gained the matching `tracking-wide` tier

## Task Commits

Each task was committed atomically:

1. **Task 1: Zebra-row contrast — desktop bump, mobile-EDIT-list zebra removal** - `684f4cd7` (feat)
2. **Task 2: Classic grand-total visual emphasis** - `9f4a5c25` (feat)
3. **Task 3: Title-band and section-header letter-spacing consistency (both templates)** - `5fad931b` (feat)

_Note: no separate plan-metadata commit yet — this SUMMARY/STATE/ROADMAP commit follows below._

## Files Created/Modified
- `components/workspace/estimate/estimate-document.tsx` - Desktop zebra bump (2 sites), grand-total size/weight/border-color, title-band tracking-widest, both section-header variants gain tracking-wide
- `components/workspace/estimate/item-card-mobile.tsx` - `even:bg-muted/20` removed entirely from the mobile-EDIT row wrapper
- `components/share/estimate-document-modern.tsx` - Section-header title gains `tracking-wide`
- `tests/unit/estimate/mobile-line-item.test.tsx` - Row-structure test retitled and reassigned to assert zebra absence (`not.toMatch(/bg-muted/)`)
- `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` - Reviewed, intentional updates for grand-total classes/border-color (Task 2) and tracking classes (Task 3); Task 1 produced no snapshot diff because the fixture's single-item section never exercises the idx-based desktop read-only zebra branch (idx 0 is even, ternary yields no class either before or after the bump) — documented here rather than treated as a defect.

## Decisions Made
- Zebra is now explicitly a desktop-table-only pattern; every mobile list drops it (this plan removes it from the workspace-editor mobile-EDIT list; the customer-facing mobile-VIEW list gets a matching card treatment in Plan 186-02 Task 2, not a stripe-zebra bump)
- Grand total's divider is brand-tied (`borderTopColor: brandText`) rather than neutral-black, consistent with the value span's existing brand color — deliberately kept as a single-line inline-flex row, not restructured into Modern's stacked hero-total treatment
- Spacing audit (Task 3) found no defect: `SECTION_PX`/vertical-rhythm tokens were already uniform pre-plan; no change made, recorded per plan's explicit ask

## Deviations from Plan

None - plan executed exactly as written. All grep-verify counts (even:bg-muted/40 = 1, bg-muted/40 = 2, even:bg-muted/20 = 1 [line 565, intentionally deferred], hover:bg-muted/20 = 5 in estimate-document.tsx and 2 in item-card-mobile.tsx, even:bg-muted = 0 in item-card-mobile.tsx) matched the plan's expected values exactly on first attempt.

## Issues Encountered
- Task 1's `-u` snapshot run produced zero diff for the desktop-zebra changes because `document-alignment.test.tsx`'s fixture renders exactly one section item (idx 0, an even index) in `mode="view"` only — the idx-based ternary at line ~641 never applied `bg-muted/20` even before this plan's edit, and the edit-mode `even:bg-muted/40` CSS pseudo-class site isn't exercised by this view-mode-only snapshot test. Not a defect in this plan's change; documented rather than "fixed" (fixture expansion would be out of scope / a test-authoring change unrelated to this plan's visual-polish objective).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 186-02 (mobile-VIEW card treatment for the read-only mobile row at estimate-document.tsx:565, plus remaining webview polish) is next and will close out POLISH-01 for the phase
- POLISH-01 requirement intentionally left unchecked in REQUIREMENTS.md — it's phase-scoped, not plan-scoped, and Phase 186 isn't complete until Plan 02 also ships
- No blockers for Plan 02

---
*Phase: 186-webview-design-polish*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 4 modified source files, the SUMMARY.md, and all 3 task commits (684f4cd7, 9f4a5c25, 5fad931b) verified present on disk / in git log.
