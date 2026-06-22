---
phase: quick
plan: 260620-lia
type: execute
wave: 1
depends_on: []
files_modified:
  - components/app-shell/sidebar.tsx
  - app/(app)/settings/layout.tsx
autonomous: true
requirements: [QUICK-SIDEBAR-ANIM]
must_haves:
  truths:
    - "Collapsing/expanding the sidebar animates smoothly — width, labels, and branding move together with no pop or jump"
    - "Nav item labels and branding label smoothly squeeze + fade (no instant clip to zero width)"
    - "Settings sub-nav slides in sync with the primary sidebar instead of jumping abruptly"
    - "When collapsed, nav item icons stay perfectly centered (label collapses to zero width)"
    - "No expanded label is truncated at the 213px sidebar width"
  artifacts:
    - path: "components/app-shell/sidebar.tsx"
      provides: "Synchronized 200ms ease-in-out collapse transitions + animatable label widths"
      contains: "transition-[width] duration-200 ease-in-out"
    - path: "app/(app)/settings/layout.tsx"
      provides: "Settings sub-nav wrapper that animates its left offset in sync with the sidebar"
      contains: "transition-[left] duration-200 ease-in-out"
  key_links:
    - from: "components/app-shell/sidebar.tsx (--app-sidebar-width JS setter)"
      to: "app/(app)/settings/layout.tsx (md:left-[var(--app-sidebar-width)])"
      via: "CSS var consumed with a left transition so the subnav slides with the sidebar"
      pattern: "transition-\\[left\\] duration-200 ease-in-out"
---

<objective>
Fix the visual jank in the desktop sidebar collapse/expand animation. The motion currently feels disjointed because transition durations and easings are inconsistent across the moving parts, labels clip to zero width instantly (text "pops" instead of squeezing), and the settings sub-nav jumps abruptly while the primary sidebar slides.

Purpose: A polished, cohesive collapse animation where width, labels, branding, and the dependent settings sub-nav all move together with synchronized 200ms ease-in-out motion.

Output: Two files updated with className-only changes — no logic, props, DOM structure, persistence, media-query default, or tooltip behavior touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@components/app-shell/sidebar.tsx
@app/(app)/settings/layout.tsx
@components/workspace/project-workspace.tsx
@app/globals.css

<diagnosis>
Root causes of the jank (already diagnosed — do not re-investigate):

1. Inconsistent durations/easings:
   - `<aside>` width: `transition-[width] duration-200` (browser-default easing, NOT ease-in-out)
   - branding label: `transition-opacity duration-150`
   - nav item label spans: `transition-opacity duration-150`
   - nav item base layout: `transition-all duration-150`
   - workspace subnav (project-workspace.tsx, line 117): already `transition-all duration-200` (ease-in-out) — this is the reference cadence to match.

2. Labels collapse with instant `w-0` (NOT transitioned) + opacity over 150ms → the text box reflows to zero width instantly while opacity fades an already-clipped box. This is the most visibly broken part (text pops instead of squeezing).

3. `--app-sidebar-width` is set instantly via JS (sidebar.tsx useEffect, line 132). The settings sub-nav wrapper (app/(app)/settings/layout.tsx line 40) pins `md:left-[var(--app-sidebar-width)]` with NO transition → it jumps abruptly while the primary sidebar slides. (project-workspace.tsx already animates via `transition-all duration-200`, so it is the correct reference and needs NO change.)
</diagnosis>

<sizing-verification>
Sidebar expanded width = 213px (aside `w-[213px]`, --app-sidebar-width '213px').
- Nav item label content area: `px-3` (24px) + icon `w-5` (20px) + `gap-3` (12px) ≈ 56px reserved → ~157px available for label.
- Branding label content area: `px-4` (32px) + logo `w-6` (24px) + `gap-2.5` (10px) ≈ 66px reserved → ~147px available.
- Longest English nav label is "Dashboard"/"New Xtimate"/"Price Book" — all render well under 157px. Branding appName "Xtimator" renders well under 147px.
- Chosen cap: `max-w-[160px]` comfortably exceeds every expanded label's rendered width. The existing `truncate` remains as a graceful fallback for unusually long translated labels (labels pass through `t()`), so nothing breaks layout when expanded.
- Collapsed state uses `max-w-0` which collapses the label box to zero width, preserving the existing icon-centering behavior (`w-9 justify-center px-0 gap-0`).
</sizing-verification>

<constraints>
- Pure CSS/Tailwind className polish ONLY. Do NOT change component logic, props, DOM structure, or the collapse/expand behavior.
- Do NOT touch localStorage persistence (COLLAPSE_KEY), the media-query default (applyDefault / DESKTOP_SIDEBAR_QUERY), or the collapsed tooltip wrapping.
- Do NOT modify project-workspace.tsx — it already animates at 200ms ease-in-out and is the reference cadence.
- Keep the existing opacity toggle on labels; add the animatable width alongside it (do not remove opacity).
- Keep `truncate` and `whitespace-nowrap` / `overflow-hidden` on label spans.
</constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Standardize sidebar collapse transitions to 200ms ease-in-out + animatable label widths</name>
  <files>components/app-shell/sidebar.tsx</files>
  <action>
ClassName-only edits. Make four changes; do NOT touch any logic, hooks, props, or JSX structure.

1. `<aside>` width transition (line ~172): change `transition-[width] duration-200` →
   `transition-[width] duration-200 ease-in-out`.

2. Branding label `<span>` (line ~194-198): the text currently uses
   `transition-opacity duration-150` and collapses via `opacity-0 w-0`. Replace so the
   label smoothly squeezes + fades:
   - Base classes: change `transition-opacity duration-150` →
     `transition-all duration-200 ease-in-out overflow-hidden whitespace-nowrap`
     (keep existing `truncate text-lg font-bold tracking-tight`).
   - Collapsed branch: change `opacity-0 w-0 pointer-events-none` →
     `opacity-0 max-w-0 pointer-events-none`.
   - Expanded branch: change `opacity-100` → `opacity-100 max-w-[160px]`.

3. Nav item base layout (`baseLayout` const, line ~218-219): change
   `transition-all duration-150` → `transition-all duration-200 ease-in-out`.

4. Nav item label `<span>` elements. There are THREE structurally identical label spans
   that must ALL receive the same treatment (do not miss any):
     - the modal `<button>` branch span (line ~252-256),
     - the `<Link>` branch span (line ~270-274),
     - the offline disabled `<button>` branch span (line ~293-297).
   For each, the current pattern is:
     base:      `truncate transition-opacity duration-150 whitespace-nowrap`
     collapsed: `opacity-0 w-0 overflow-hidden`
     expanded:  `opacity-100`
   Change each to:
     base:      `truncate transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden`
     collapsed: `opacity-0 max-w-0`
     expanded:  `opacity-100 max-w-[160px]`
   Rationale: `max-w-0 ↔ max-w-[160px]` is animatable (unlike the instant `w-0`), so the
   label squeezes shut while fading instead of popping. `max-w-0` collapses the label box
   to zero width, preserving the collapsed icon-centering (`w-9 justify-center px-0 gap-0`).

Do NOT change: the `useEffect` that sets `--app-sidebar-width`, the collapse toggle,
localStorage persistence, the media-query default, the collapsed-tooltip wrapping, the
ChevronLeft/Right buttons, or the branding Link's container transition-opacity (its own
hover treatment is independent and fine).
  </action>
  <verify>
    <automated>cd /c/Users/Vanildo/Dev/xtimator && npx tsc --noEmit 2>&1 | head -20</automated>
    Then grep-confirm the new classes are present and the old jank classes are gone:
    - `grep -n "transition-\[width\] duration-200 ease-in-out" components/app-shell/sidebar.tsx` → 1 match
    - `grep -n "max-w-\[160px\]" components/app-shell/sidebar.tsx` → 4 matches (branding + 3 nav label spans)
    - `grep -n "max-w-0" components/app-shell/sidebar.tsx` → 4 matches
    - `grep -n "duration-150" components/app-shell/sidebar.tsx` → 0 matches
    - `grep -n " w-0" components/app-shell/sidebar.tsx` → 0 matches (no instant width-0 left on labels)
  </verify>
  <done>
tsc passes with no new errors. All collapse-driven transitions in sidebar.tsx are 200ms ease-in-out. All four label spans (branding + 3 nav) use `max-w-0 ↔ max-w-[160px]` with `transition-all duration-200 ease-in-out` and retain their opacity toggle. No `duration-150` or instant `w-0` remains on label spans.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sync settings sub-nav slide with the primary sidebar</name>
  <files>app/(app)/settings/layout.tsx</files>
  <action>
ClassName-only edit. The non-demo settings sub-nav wrapper div (line ~40) pins itself to
the primary sidebar's right edge via `md:left-[var(--app-sidebar-width)]` but has no
transition, so it jumps when the sidebar collapses/expands.

Add a left transition matching the sidebar cadence. On that wrapper div's className
string, append: `transition-[left] duration-200 ease-in-out`.

The current className is:
  "relative sticky top-0 z-20 shrink-0 md:fixed md:left-[var(--app-sidebar-width)] md:top-16 md:z-30 md:h-[calc(100vh-4rem)] md:w-52"
becomes:
  "relative sticky top-0 z-20 shrink-0 md:fixed md:left-[var(--app-sidebar-width)] md:top-16 md:z-30 md:h-[calc(100vh-4rem)] md:w-52 transition-[left] duration-200 ease-in-out"

Do NOT change the demo-session early-return branch, the inner `<aside>`, the SettingsNav,
the page-content offset div, or any other class. Only the one sub-nav wrapper div gets the
transition. (project-workspace.tsx already handles its own subnav animation and is out of
scope.)
  </action>
  <verify>
    <automated>cd /c/Users/Vanildo/Dev/xtimator && npx tsc --noEmit 2>&1 | head -20</automated>
    Then: `grep -n "transition-\[left\] duration-200 ease-in-out" "app/(app)/settings/layout.tsx"` → 1 match on the wrapper that also contains `md:left-[var(--app-sidebar-width)]`.
  </automated>
  </verify>
  <done>
tsc passes. The settings sub-nav wrapper animates its `left` offset over 200ms ease-in-out, staying visually in sync with the primary sidebar slide instead of jumping. No other class in the file changed.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no new errors.
- sidebar.tsx: aside width, branding label, nav base layout, and all 3 nav label spans use 200ms ease-in-out; labels use `max-w-0 ↔ max-w-[160px]` (animatable squeeze) + retained opacity toggle; zero `duration-150` and zero instant `w-0` on labels remain.
- settings/layout.tsx: the sub-nav wrapper carries `transition-[left] duration-200 ease-in-out` alongside `md:left-[var(--app-sidebar-width)]`.
- Manual smoke (optional, no checkpoint — auto-approve per project memory): on desktop, toggle the sidebar collapse chevron and confirm width, labels, branding, and the settings sub-nav all move together smoothly with no pop or jump; collapsed icons stay centered; no expanded label is truncated at 213px.
</verification>

<success_criteria>
- Collapse/expand animation is visually cohesive: every moving part shares 200ms ease-in-out.
- Labels squeeze + fade smoothly instead of popping to zero width.
- Settings sub-nav slides in sync with the primary sidebar.
- Collapsed icon centering preserved; no expanded label truncated at 213px.
- No logic, props, DOM structure, persistence, media-query default, or tooltip behavior changed.
</success_criteria>

<output>
After completion, create `.planning/quick/260620-lia-revisar-animacao-de-colapso-da-sidebar-j/260620-lia-SUMMARY.md`
</output>
