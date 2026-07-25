---
phase: quick-260725-snv
status: complete
date: 2026-07-25
files_modified:
  - app/(app)/settings/layout.tsx
  - components/settings/settings-layout-client.tsx
  - components/settings/settings-nav.tsx
  - components/settings/use-subnav-scroll.ts
  - components/ui/sub-nav.tsx
---

# Summary: Mobile/tablet Settings sub-nav — sticky fix + drag-scroll + active underline

Three fixes to the `md:hidden` Settings sub-nav pill row (Company · Account ·
Team · … · Integrations). Desktop (md+) vertical rail is byte-for-byte
unchanged. Implemented by a background subagent; reviewed + committed by parent.

## Scope (per user)
- 🎯 Target: mobile/tablet horizontal pill row only. Desktop rail untouched.
- Settings stays multi-route (separate pages per tab) — user chose
  "underline follows the active tab", NOT scroll-spy.

## Changes
### 1. Sticky bug — "bar disappears mid-page"
Root cause: `position: sticky` only sticks within its containing block (flow
parent's box). Two ancestors capped that box to ~one viewport, so the bar
released partway down:
- `app/(app)/settings/layout.tsx`: `flex h-full flex-col` → `flex min-h-full flex-col md:h-full`
- `settings-layout-client.tsx` root: `flex flex-1 min-h-0 flex-col md:…` → `flex flex-col md:flex-1 md:min-h-0 md:…`
Phone now grows to content height so the sticky row's containing block spans the
full scroll (bar stays pinned under the header the whole way). `md:` classes
resolve to the original desktop layout → desktop self-scrolling rail unchanged.
`top-0` kept (header is a sibling above `main`, the scrollport).

### 2. Horizontal drag / wheel / auto-scroll — `use-subnav-scroll.ts` (new hook)
- Pointer/mouse drag-to-scroll (grab/grabbing cursor); real drag swallows the
  trailing click so releasing over a pill doesn't misfire navigation.
- Vertical mouse-wheel → horizontal scroll over the row.
- Auto-centers the active pill on mount / route change.
- Every behavior self-gates on `scrollWidth > clientWidth` → completely inert on
  the desktop vertical rail (no horizontal overflow). Touch left to native.
- `sub-nav.tsx` gained an optional `navRef` forwarded to the scrollable `<nav>`;
  `settings-nav.tsx` wires `useSubNavScroll(activeValue)` into it.

### 3. Active indicator = underline (mobile only)
- `sub-nav.tsx`: active pill in responsive mode drops the background pill on
  mobile (`text-foreground md:bg-[var(--glass-bg-light)]`) and renders a
  gradient underline (`absolute inset-x-2 bottom-0.5 h-[2px] bg-[image:var(--gradient-brand)] md:hidden`).
- Route-driven via `aria-current`, so it moves to the new section on tap.
- `alwaysVertical` (workspace) and callback (`onSelect`) SubNav modes preserved:
  the underline/underline-color changes are guarded to the responsive mode only.

## Verification
- `tsc --noEmit`: the 5 touched files are clean (only pre-existing, unrelated
  `tests/**` errors remain).
- eslint: the sole error is pre-existing (`react-hooks/set-state-in-effect` at
  `settings-layout-client.tsx:15`, the localStorage-hydration effect — untouched
  by this change).
- NO in-pane visual check: Settings is auth-gated, the Browser pane has no
  session and wasn't compositing, and `/demo` uses a separate layout. **Needs
  the user's on-session check at ≤767px** (bar stays stuck while scrolling; drag
  side-to-side reaches Integrations; underline follows the active tab).

## Notes
- Local commit only, not pushed. Underline is a subtle 2px gradient at
  `bottom-0.5` — thickness/offset is a one-line tweak in `sub-nav.tsx` if wanted.
