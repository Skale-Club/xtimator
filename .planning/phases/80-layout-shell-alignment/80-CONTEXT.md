# Phase 80: Layout Shell Alignment — Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Update sidebar and topbar to match Xphere v2.1's minimal Linear-inspired shell. Remove glassmorphism from both surfaces. Adjust sidebar dimensions (232px/60px) and topbar height (56px). Update active nav state. Align mobile bottom nav. No feature/route changes — purely visual shell migration.

**Out of scope:** Component library (Phase 81), data display (Phase 82), any feature work. Auth and marketing pages not touched.

</domain>

<decisions>
## Implementation Decisions

### Sidebar Dimensions

- **D-01:** Sidebar expanded: `w-[232px]` (from `w-64` = 256px). Collapsed: `w-[60px]` (from `w-16` = 64px).
- **D-02:** Transition: `duration-[--motion-base]` with `ease-[--ease-spring]` (was `duration-200`).

### Sidebar Surface

- **D-03:** Background: `bg-[--bg-secondary]` (dark: `#111113`) — no `glass-bg`, no `backdrop-blur`, no `[-webkit-backdrop-filter]`.
- **D-04:** Right border: `border-r border-[--border-subtle]` (was `border-r border-[var(--glass-border)]`).
- **D-05:** Footer divider: `border-t border-[--border-subtle]` (was `border-[var(--glass-border)]`).

### Active Nav State

- **D-06:** Active item background: `bg-[--accent-muted]` (rgba 8% opacity accent).
- **D-07:** Active item left bar: `before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2.5px] before:rounded-r before:bg-[--accent] before:shadow-[0_0_8px_var(--accent-glow)]`.
- **D-08:** Remove gradient-brand highlight from active state entirely.
- **D-09:** Inactive item hover: `hover:bg-[--bg-tertiary]` (was `hover:bg-accent/10`).

### Topbar

- **D-10:** Height: `h-14` (56px, down from `h-16` = 64px).
- **D-11:** Background: `bg-[--bg-primary] border-b border-[--border-subtle]` — no `glass-bg`, no `backdrop-blur`, no `[-webkit-backdrop-filter]`.
- **D-12:** All existing topbar actions preserved: search, dial pad, notifications, theme toggle, org switcher.

### Mobile Bottom Nav

- **D-13:** Background: `bg-[--bg-secondary] border-t border-[--border-subtle]` — no glass, no backdrop-blur.
- **D-14:** Active icon color: `text-[--accent]`. Inactive: `text-[--text-tertiary]`.

### Layout Container

- **D-15:** Main content area background: `bg-[--bg-primary]` (was `bg-background` which now resolves to the same via shim).
- **D-16:** `min-h-dvh` for full viewport height support (matches Xphere pattern).

### Viewport Meta

- **D-17:** Update `themeColor` in `app/layout.tsx` viewport export: dark `#0A0A0B`, light `#FCFCFD` (aligned to `--bg-primary`).

### Claude's Discretion

- Exact Tailwind class strategy for the 2.5px left bar (pseudoelement vs separate div) — use whichever is cleaner given the sidebar component structure.
- Whether to update `nav-items.ts` group names/icons alongside this phase — keep existing groups and icons, only visual changes.

</decisions>

<canonical_refs>
## Canonical References

### Xphere Reference Implementation
- `C:\Users\Vanildo\Dev\xphere\src\components\layout\sidebar.tsx` — canonical sidebar implementation
- `C:\Users\Vanildo\Dev\xphere\src\components\layout\top-bar.tsx` — canonical topbar implementation

### Xtimator Files to Edit
- `components/app-shell/sidebar.tsx` — main sidebar (uses `w-64`/`w-16`, `glass-border`)
- `components/app-shell/topbar.tsx` — topbar (uses `h-16`, `glass-bg`, `backdrop-blur`)
- `components/app-shell/bottom-nav.tsx` — mobile bottom navigation
- `app/(app)/layout.tsx` — layout container background and structure
- `app/layout.tsx` — viewport themeColor meta

### Depends On
- Phase 79 CONTEXT.md — all token values referenced above come from Phase 79

</canonical_refs>

<code_context>
## Existing Code Insights

### Sidebar (`components/app-shell/sidebar.tsx`)
- Currently: `collapsed ? 'w-16' : 'w-64'` — change to `w-[60px]` / `w-[232px]`
- Active state: gradient-brand based — replace with accent-muted + left bar
- Bottom border uses `border-[var(--glass-border)]` — change to `border-[--border-subtle]`
- Collapse transition: `duration-200` — change to motion token

### Topbar (`components/app-shell/topbar.tsx`)
- Line 77: `bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] border-b border-[var(--glass-border)] h-16`
- Dropdown at line 125: `glass-strong border border-[var(--glass-border)] shadow-glass` — change to `bg-[--bg-elevated] border border-[--border]`
- All other topbar logic (search, org switcher, notifications) unchanged

### Integration Points
- CSS variables `--glass-bg`, `--glass-border`, `--glass-blur` will be removed in Phase 79 — Phase 80 cleans up all usage in shell files

</code_context>

<specifics>
## Specific Ideas

No specific visual references beyond Xphere's sidebar.tsx and top-bar.tsx. The goal is a clean 1:1 structural mapping — same proportions, same surface treatment, same interaction model, different brand color.

</specifics>

<deferred>
## Deferred Ideas

- **Sidebar nav group re-labeling** — Xphere has "Overview / Engage / Sales / Build / Manage" groups. Xtimator has different groups. Renaming groups is out of scope for design alignment.
- **Topbar search UX** — Xphere has ⌘K with keyboard hint. Xtimator has a search button. Aligning that interaction is a UX feature, not a design token change.

</deferred>

---

*Phase: 80-layout-shell-alignment*
*Context gathered: 2026-05-22*
