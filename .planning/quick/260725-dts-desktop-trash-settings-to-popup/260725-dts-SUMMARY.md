---
phase: quick-260725-dts
status: complete
date: 2026-07-25
files_modified:
  - components/app-shell/sidebar.tsx
---

# Summary: Desktop — Trash + Settings only in the profile/company popup, not the sidebar menu

The desktop mirror of the mobile SEED-050 change. On the desktop layout (the
`Sidebar`, which shows at `md+` — so it also covers the large iPads/tablets on
the desktop layout), Trash + Settings were duplicated: they showed both in the
main sidebar menu AND (Settings) in the CompanySelector profile dropdown. Per
user: they should live ONLY in that profile popup.

## Changes (`sidebar.tsx`)
1. **Main nav** — filter now excludes `userMenu` items:
   `NAV_ITEMS.filter(item => !(isDemo && item.demoHidden) && !item.userMenu)`.
   Trash + Settings carry `userMenu: true` (from SEED-050), so they drop off the
   sidebar menu; New Xtimate/Dashboard/Projects/Clients/Price Book remain.
2. **`accountMenuSlot`** (rendered inside `CompanySelector`) — added a **Trash**
   `DropdownMenuItem → Link href="/trash"` next to the existing Settings item
   (both `!isDemo`, imported `Trash2`). So the profile popup now shows:
   Companies · user · Settings · Trash · App Tour · Sign Out.

## Scope
- One component (`Sidebar`) = the whole desktop layout, so it covers desktop AND
  the large iPads/tablets that use the desktop layout. Applies in both the
  expanded and collapsed sidebar (the filter is on the nav map; the popup slot is
  passed to `CompanySelector` in both states).
- Mobile (`<md`) is unaffected — it uses the separate mobile drawer.

## Verification
- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- No live screenshot: the sidebar is auth-gated and the Browser pane can't
  authenticate this app. Verified via tsc + the nav-model reasoning. This is a
  `.tsx` change (HMR-friendly), so a normal reload shows it (no server restart
  needed, unlike the globals.css issue).

## Notes
- Local commit only, not pushed.
