---
phase: quick-260725-hmb
status: complete
date: 2026-07-25
files_modified:
  - components/app-shell/mobile-nav-drawer.tsx
  - components/app-shell/mobile-header.tsx
---

# Summary: Tablet/phone hamburger (sandwich) menu → slide-out sidebar, profile at bottom

On the mobile header (`md:hidden`, i.e. tablet ≤767px + phone), the top-right
**profile avatar** is replaced by a **hamburger (sandwich)** button that toggles
a slide-out **sidebar** drawer. Desktop (md+) is completely untouched.

## Scope (per user)
- 🎯 Target: the `md:hidden` `MobileHeader` only (the ≤767px view — iPad
  portrait + phone). Desktop `Topbar` / `Sidebar` unchanged.
- 🔒 Keep flag (LanguageToggle), bell (Notifications), moon (ThemeToggle)
  exactly where they are — only the avatar slot changes to the sandwich.
- 🔒 Bottom bar stays as-is (it remains the primary nav). The sandwich sidebar
  is the *secondary* menu.

## Changes
### New: `components/app-shell/mobile-nav-drawer.tsx`
`<MobileNavDrawer>` — client component built on the existing `Sheet`
(`components/ui/sheet.tsx`), `side="left"` (mirrors the desktop sidebar edge),
width `260px`. Toggled open/closed by the sandwich button (lucide `Menu`).
Layout mirrors the desktop `<Sidebar>`:
- **Top:** brand (logo + app name), links to `/`.
- **Middle:** main nav from `NAV_ITEMS` (New Xtimate [primary, opens the
  new-project modal], Dashboard, Projects, Clients, Price Book). Active-route
  highlight; `demoHidden` items filtered in demo.
- **Bottom (pinned):** profile block — avatar + email, then the account items
  (`userMenu`: Settings, Trash) and **Sign Out**. Any nav click closes the sheet.

### Edit: `components/app-shell/mobile-header.tsx`
- Swapped the `NavUserDropdown` import for `MobileNavDrawer`.
- Replaced `<NavUserDropdown … />` (last item in the right-actions row) with
  `<MobileNavDrawer branding={branding} navUser={navUser} isDemo={isDemo} />`.
- Nothing else moved.

## Decisions / assumptions (flag for user)
- **Slide side = LEFT.** User deflected the left/right question; picked LEFT to
  match the desktop sidebar (the "sidebar" they referenced, profile-at-bottom
  layout). Trivially flippable to `side="right"` (one prop) if preferred.
- **Drawer contents = full sidebar** (nav links + profile at bottom), per the
  option the user selected. Bottom bar keeps the primary nav; this is the
  "second menu".

## Verification
- `tsc --noEmit`: clean for the touched files.
- `eslint` on both files: clean.
- **No in-pane visual check:** the authenticated app shell requires a real
  login (Browser pane has no session; credentials are the user's to enter), the
  `/demo` route uses its own separate layout (not this `MobileHeader`), and the
  Browser pane wasn't compositing (screenshots time out). The change is
  hot-reloaded into the user's running dev server (`localhost:9633`) — **needs
  the user's on-session visual check**: refresh, view at ≤767px, tap the
  sandwich (top-right), confirm the left drawer + profile at the bottom.

## Notes
- Local commit only, not pushed.
- `nav-user-dropdown.tsx` is left in place (no longer imported by the mobile
  header); not deleted in case it's reused elsewhere.
