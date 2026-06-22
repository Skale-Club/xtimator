---
phase: quick
plan: 260620-lia
subsystem: app-shell-navigation
tags: [ui, animation, tailwind, sidebar, settings]
requires: []
provides:
  - "Synchronized 200ms ease-in-out sidebar collapse animation (width + labels + branding)"
  - "Animatable label squeeze (max-w-0 <-> max-w-[160px]) replacing instant w-0 pop"
  - "Settings sub-nav left-offset transition synced to the primary sidebar slide"
affects:
  - components/app-shell/sidebar.tsx
  - app/(app)/settings/layout.tsx
tech-stack:
  added: []
  patterns:
    - "Animatable label collapse via max-w-0 <-> max-w-[160px] alongside opacity toggle (squeeze + fade)"
    - "Dependent fixed sub-nav consumes --app-sidebar-width with transition-[left] to slide in sync"
key-files:
  created: []
  modified:
    - components/app-shell/sidebar.tsx
    - app/(app)/settings/layout.tsx
decisions:
  - "Cap label max-w at 160px — comfortably exceeds every expanded English nav/branding label at the 213px sidebar width; truncate retained as graceful fallback for long translated labels"
  - "Kept opacity toggle on labels and added animatable max-w alongside it (squeeze + fade together) rather than replacing opacity"
metrics:
  duration: "~4m"
  tasks: 2
  files: 2
  completed: "2026-06-20"
---

# Phase quick Plan 260620-lia: Sidebar Collapse Animation Polish Summary

CSS/Tailwind-only polish that unifies the desktop sidebar collapse/expand motion to a single 200ms ease-in-out cadence — width, branding label, nav labels, and the dependent settings sub-nav now move together, and labels squeeze + fade (animatable `max-w`) instead of popping to zero width.

## What Was Built

### Task 1 — Standardize sidebar collapse transitions + animatable label widths (`components/app-shell/sidebar.tsx`)

Four className-only changes:

1. `<aside>` width transition: `transition-[width] duration-200` -> `transition-[width] duration-200 ease-in-out` (was browser-default easing).
2. Branding `<span>`: base now `transition-all duration-200 ease-in-out overflow-hidden whitespace-nowrap` (kept `truncate text-lg font-bold tracking-tight`); collapsed `opacity-0 max-w-0 pointer-events-none`; expanded `opacity-100 max-w-[160px]`.
3. Nav item `baseLayout`: `transition-all duration-150` -> `transition-all duration-200 ease-in-out`.
4. All three structurally identical nav label spans (modal `<button>` branch, `<Link>` branch, offline disabled `<button>` branch): base `truncate transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden`; collapsed `opacity-0 max-w-0`; expanded `opacity-100 max-w-[160px]`.

The `max-w-0 <-> max-w-[160px]` swap is animatable (unlike instant `w-0`), so labels squeeze shut while fading instead of popping. Collapsed icon-centering (`w-9 justify-center px-0 gap-0`) is preserved because `max-w-0` collapses the label box to zero width.

No logic, hooks, props, JSX structure, localStorage persistence (`COLLAPSE_KEY`), media-query default (`applyDefault` / `DESKTOP_SIDEBAR_QUERY`), `--app-sidebar-width` setter, chevrons, or collapsed-tooltip wrapping were touched.

### Task 2 — Sync settings sub-nav slide with the primary sidebar (`app/(app)/settings/layout.tsx`)

Appended `transition-[left] duration-200 ease-in-out` to the fixed settings sub-nav wrapper div that pins itself via `md:left-[var(--app-sidebar-width)]`. The sub-nav now eases its `left` offset in sync with the sidebar slide instead of jumping abruptly. Only that one wrapper changed — the demo early-return branch, inner `<aside>`, `SettingsNav`, and content-offset div are untouched. `project-workspace.tsx` already animates at 200ms ease-in-out and was left out of scope as instructed.

## Verification

- `npx tsc --noEmit`: zero errors in `components/app-shell/sidebar.tsx` and `app/(app)/settings/layout.tsx`. (Pre-existing unrelated tsc errors in Stripe API-version typings, test mocks, and email branding types remain out of scope — not caused by these className-only edits.)
- sidebar.tsx grep checks: `transition-[width] duration-200 ease-in-out` = 1; `max-w-[160px]` = 4; `max-w-0` = 4; `duration-150` = 0; ` w-0` (leading space) = 0. All match plan expectations.
- settings/layout.tsx grep check: `transition-[left] duration-200 ease-in-out` = 1, on the same line that carries `md:left-[var(--app-sidebar-width)]`.
- Manual visual smoke: optional, auto-approved per project memory (no checkpoint). Expected behavior — toggling the collapse chevron animates width, labels, branding, and the settings sub-nav together with no pop/jump; collapsed icons stay centered; no expanded label truncated at 213px.

## Deviations from Plan

None to the planned edits themselves — both tasks executed exactly as written.

### Execution note (git recovery, not a plan deviation)

A concurrent phase-96 verification process committed at the same instant Task 1's `sidebar.tsx` was staged, sweeping the staged file into an unrelated commit (`916be46` "docs(phase-96): complete phase execution"). Recovery: the offending commit was amended to drop `sidebar.tsx` (now `bbdb978`, containing only the phase-96 `STATE.md` + `96-VERIFICATION.md` it was meant to hold), and the captured sidebar changes — confirmed byte-for-byte identical to the intended 10-line edit via diff — were re-committed atomically as the proper Task 1 commit. No phase-96 content was lost or altered; the only history rewrite was on a local, un-pushed commit. Subsequent commits chained `git add` + `git commit` to avoid a repeat collision.

## Commits

- `b6699ec` fix(quick-260620-lia): synchronize sidebar collapse transitions to 200ms ease-in-out (`components/app-shell/sidebar.tsx`)
- `dc5fd6c` fix(quick-260620-lia): slide settings sub-nav in sync with sidebar collapse (`app/(app)/settings/layout.tsx`)

## Known Stubs

None — no stub patterns introduced (CSS/Tailwind className-only changes; no data sources or placeholder values added).

## Self-Check: PASSED

- FOUND: components/app-shell/sidebar.tsx
- FOUND: app/(app)/settings/layout.tsx
- FOUND: .planning/quick/260620-lia-revisar-animacao-de-colapso-da-sidebar-j/260620-lia-SUMMARY.md
- FOUND commit: b6699ec (sidebar.tsx — 6 ease-in-out occurrences in committed blob)
- FOUND commit: dc5fd6c (settings/layout.tsx — transition-[left] present in committed blob)
