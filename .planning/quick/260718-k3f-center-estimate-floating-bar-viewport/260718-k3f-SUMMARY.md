---
phase: quick-260718-k3f
plan: 01
status: complete
subsystem: workspace-ui
tags: [estimate, floating-actions, css, positioning, viewport, sidebar]

# Dependency graph
requires:
  - phase: quick-260704-pcv
    provides: "The sticky containing-block + clearance-spacer pairing this change partially supersedes on desktop (mobile still relies on it)"
provides:
  - "Estimate floating action pill centered on the full viewport width on desktop (fixed inset-x-0), immune to sidebar collapse"
  - "Pill sits at bottom-2 (8px) on desktop instead of bottom-6 (24px)"
  - "Desktop clearance spacer md:h-16 so final content scrolls clear of the always-overlaying fixed pill"
affects: [estimate-page, project-workspace]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Viewport-true centering for floating overlays: `md:fixed md:inset-x-0` + flex justify-center instead of sticky-in-column, when the visual center must include the sidebar"

key-files:
  created:
    - .planning/quick/260718-k3f-center-estimate-floating-bar-viewport/260718-k3f-PLAN.md
    - .planning/quick/260718-k3f-center-estimate-floating-bar-viewport/260718-k3f-SUMMARY.md
  modified:
    - components/workspace/estimate/estimate-floating-actions.tsx
    - components/workspace/project-workspace.tsx
    - app/(app)/projects/[id]/page.tsx

key-decisions:
  - "`fixed` (viewport-based) over a translate-compensation hack: `-translate-x-[213px/2]` would break the moment the sidebar collapses to w-16; fixed positioning is structurally immune"
  - "Mobile stays sticky: the sidebar is hidden below md, so the content-column center already equals the viewport center — no change needed, no regression risk"
  - "Clearance spacer md:h-6 → md:h-16: a fixed pill overlays permanently (it never rests at its flow position like sticky did), so the last content needs ~54px+ of scroll clearance"
  - "Skeleton pill mirror updated in the same commit — positioning parity between skeleton and hydrated pill is an existing invariant of this page (no jump on hydration)"

patterns-established:
  - "When a floating overlay must read as centered on the SCREEN (not the content), position it fixed to the viewport and accept that it may overlap the sidebar at narrow desktop widths (z-order keeps it on top)"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-07-18
---

# Quick 260718-k3f: Center estimate floating bar on full viewport Summary

**The estimate page's floating action pill (Settings / Link Client / Refine with AI / Photos / Send) is now horizontally centered on the full screen width — sidebar included — and sits 8px above the bottom edge on desktop, matching the user's screenshot annotation. Mobile is untouched.**

## Accomplishments

- **Pill wrapper** (`estimate-floating-actions.tsx`): `sticky bottom-3 md:bottom-6` → `sticky bottom-3 md:fixed md:inset-x-0 md:bottom-2`. On md+ the containing block is now the viewport, so `flex justify-center` centers on true screen center (previously it centered on the content column, landing ~106px right of screen center with the 213px sidebar expanded). Centering is unaffected by sidebar collapse (w-[213px] ↔ w-16) — no width math anywhere.
- **Clearance spacer** (`project-workspace.tsx`): `md:h-6` → `md:h-16`. A fixed pill overlays the content permanently, so the estimate's totals need enough end-of-scroll clearance to clear the ~46px pill + 8px offset.
- **Skeleton parity** (`app/(app)/projects/[id]/page.tsx`): the ProjectWorkspaceSkeleton's pill mirror moved to the same `fixed inset-x-0 bottom-2` so the pill doesn't jump when the streamed content hydrates.

## Task Commits

1. **Task 1+2: Reposition pill, resize spacer, sync skeleton** — `d0d0a7d1` (fix)

## Verification (actual observed output)

| Check | Expected | Actual |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.ci.json` | 0 errors | exit 0, no output (after `npm install` — the pull had added deps: `ai`, `@langfuse/*`, `nucleo-flags`, etc.) |
| `npx vitest run tests/unit/components/estimate-floating-actions.test.tsx` | all pass | **6 passed (6)** |
| Code commit scope | exactly 3 files | 3 files, +17/−7 |
| Live visual check | pill viewport-centered, bottom-2 | **Blocked on auth** — no session in the preview pane or Chrome (`GET /projects 307` auth redirect); credential entry is out of scope for the agent. Change is CSS-classes-only on a component whose behavior tests stay green. Dev server left running on :9633 for a quick eyeball after login. |

## Decisions Made

See frontmatter `key-decisions`. Notable: the alternative "keep sticky, shift left by half the sidebar width" was rejected because the sidebar has two widths (collapsible) and the offset would be wrong in one of them.

## Deviations from Plan

None — plan executed as written. Tasks 1 and 2's code portion collapsed into one commit (same files, same region).

## Known Tradeoff (accepted, documented in plan)

At narrow desktop widths (~768–900px), a true-viewport-centered pill can visually overlap the sidebar's bottom area (company switcher). z-40 keeps the pill on top and clickable; the wrapper is pointer-events-none outside the pill itself so the sidebar stays interactive around it. This is inherent to "center on the full screen width" and matches the explicit request.

## Next Phase Readiness

- Commits are LOCAL on `dev` — not pushed, per standing convention (pushes require explicit user approval).
- Visual confirmation pending a logged-in session; the dev server on :9633 was left running for that.
