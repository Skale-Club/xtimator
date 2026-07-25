---
phase: quick-260724-bnav
status: complete
date: 2026-07-24
harvests: SEED-050
files_modified:
  - components/app-shell/nav-items.ts
  - components/app-shell/bottom-nav.tsx
  - components/app-shell/nav-user-dropdown.tsx
  - components/app-shell/mobile-header.tsx
  - app/(app)/layout.tsx
---

# Summary: Phone bottom-nav reorg — Price Book last, Trash/Settings → avatar dropdown (harvest SEED-050)

Per the "bottom nav only" phone-nav decision, reorganized the mobile primary nav.

## Changes

- **`nav-items.ts`** — new `userMenu?: boolean` flag. Price Book loses
  `overflow` (now a normal bar item); Trash + Settings switch `overflow` →
  `userMenu` (kept `demoHidden`).
- **`bottom-nav.tsx`** — `visibleItems` now also excludes `userMenu` items. Net:
  bar = `Dashboard · Projects · New Xtimate (center) · Clients · Price Book`;
  overflow set is empty → the "More" `…` button no longer renders.
- **`nav-user-dropdown.tsx`** — renders the `userMenu` items (Trash, Settings)
  as `DropdownMenuItem → Link` **between the email row and Sign Out**, with a
  separator before Sign Out. Filters `demoHidden` in the demo → needs `isDemo`.
- **`mobile-header.tsx`** — new `isDemo?` prop, passed to `NavUserDropdown`.
- **`app/(app)/layout.tsx`** — passes `isDemo` to both `MobileHeader` usages
  (support-mode = `false`, main = `isDemo`).

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- Reorder math confirmed: 5 bar items with New Xtimate centered → Price Book
  lands last; 0 overflow items → `overflowItems.length > 0` guard hides "More".
- Desktop sidebar unaffected — it renders all `NAV_ITEMS` and ignores the
  mobile-only `overflow`/`userMenu` flags, so Trash/Settings still show there.
- No live authed screenshot (app-shell is auth-gated; Browser pane unauthed +
  can't composite this app) — verified by tsc + nav-model reasoning.

## Notes
- Local commit only, not pushed.
