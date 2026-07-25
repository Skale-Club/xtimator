---
id: SEED-049
status: planted
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested:
harvested_in:
trigger_when: Next mobile-nav / app-shell UX pass (pairs with the stashed mobile-nav refactor WIP)
scope: medium
---

# SEED-049: Persistent side-nav menu on phone (today it only appears in Settings)

## Why This Matters

On **phone** view there is no persistent left side-nav rail for the app —
primary navigation is the bottom nav (+ the mobile-header user dropdown). A
left-hand side menu (icon rail) only appears **once you're inside the Settings
section** — and that rail is actually the *Settings sub-nav*, not the app's main
nav. The user wants a side menu to be **always present on phone**, consistently
across the whole app, not something that only shows up when you tap Settings.

(Observed on the phone `/settings/team` view — an icon-only rail on the left,
mobile header on top, bottom nav on the bottom.)

## Current behavior (the reverted/HEAD baseline)

- `components/app-shell/sidebar.tsx` — main sidebar is `hidden md:flex`, so it
  does **not** render below 768px (phone). Phone nav = bottom nav + hamburger.
- `components/settings/settings-layout-client.tsx` — the **Settings sub-nav**
  renders as a `fixed left-0 top-[56px]` rail **even on phone** (width `w-40`,
  or `w-14` when collapsed). This is the "side menu that only appears on
  settings" the user is pointing at.
- So the app is inconsistent on phone: no side rail on Dashboard/Projects/etc.,
  but a fixed side rail inside Settings.

## User-confirmed detail

The persistent phone side menu should carry an **account-avatar footer** at its
bottom (confirmed via "that last one for phone mode too" → "yes") — the
[[SEED-052-phone-account-avatar-in-settings-rail-footer]] avatar anchors THIS
rail's footer, not only the Settings rail, mirroring the desktop sidebar footer.

## Design question to resolve during planning

"Always there" side menu on phone most likely means the **main app nav**
(`NAV_ITEMS`) rendered as a persistent icon rail on phone — matching how the
Settings sub-nav rail already persists. Confirm with the user:
- Persistent main-nav icon rail on phone **in addition to** the bottom nav, or
  **replacing** the bottom nav?
- Collapsed (icon-only) by default, expandable? Same `w-14`/`w-40` pattern the
  Settings rail uses?
- How it composes with Settings: does the settings sub-nav then cascade next to
  this always-on main rail (the desktop cascade, but on phone)?

## When to Surface

**Trigger:** Next mobile-nav / app-shell UX pass. Do this together with the
**stashed mobile-nav refactor WIP** (see below) and [[SEED-048-largest-tablet-hero-still-stacked-verify]] — the whole phone/tablet shell breakpoint story should be
decided in one coherent pass rather than piecemeal.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/app-shell/sidebar.tsx` | Main sidebar `hidden md:flex` — the nav that's absent on phone; candidate to make a persistent phone rail |
| `components/app-shell/nav-items.ts` (`NAV_ITEMS`) | The primary nav item list (shared by sidebar + bottom nav + the stashed MobileNavSheet) |
| `components/app-shell/bottom-nav.tsx` | Current phone primary nav (`md:hidden`) — decide whether the always-on rail supplements or replaces it |
| `components/settings/settings-layout-client.tsx` | The Settings sub-nav rail that DOES persist on phone (`fixed left-0 top-[56px]`, `w-40`/`w-14`) — the reference for "always there" |
| `components/app-shell/mobile-header.tsx` | Phone top bar (`md:hidden`) + `NavUserDropdown` |

## Notes

- Baseline context: the app-shell was just reverted to the 768px cascade
  (quick-260724-cnav). A parallel in-progress refactor that reworked mobile nav
  (breakpoint 768→1024 + a hamburger `MobileNavSheet`) is preserved in a git
  stash — recover with `git stash list | grep "app-shell mobile-nav refactor"`.
  A future mobile-nav pass should reconcile THIS seed (always-on phone side rail)
  with that stashed direction (hamburger sheet) — they're competing answers to
  the same "phone primary nav" question; pick one deliberately.
