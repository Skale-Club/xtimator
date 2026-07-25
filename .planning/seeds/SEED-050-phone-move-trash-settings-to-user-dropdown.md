---
id: SEED-050
status: planted
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested:
harvested_in:
trigger_when: Next phone-nav / app-shell UX pass (plan together with SEED-049 and SEED-051)
scope: small
---

# SEED-050: Phone — move Trash + Settings into the user (avatar) dropdown

## Why This Matters

On phone, **Trash** and **Settings** currently live in the bottom-nav **"More"**
overflow dropdown (alongside Price Book). The user wants **Trash and Settings
moved into the avatar/user dropdown** (the one opened from the top-right avatar,
showing the email + Sign Out) — specifically **in the space between the email
row and the Sign Out item**.

Rationale: those two are account/management destinations that fit more naturally
next to the account actions (email, Sign Out) than in the primary-nav "More"
overflow.

## Scope Estimate

**Small** — move two nav destinations between two existing menus:

1. **Remove Trash + Settings from the bottom-nav overflow.** They render there
   because their `NAV_ITEMS` entries carry `overflow: true`. Either drop them
   from the overflow set (a bottom-nav-specific filter) or add an explicit
   "show in user menu" flag. (Decide what remains in "More" — if only Price Book
   is left, consider giving it a real bar slot and removing the "More" button,
   or keep "More" for future overflow.)
2. **Add Trash + Settings to `NavUserDropdown`**, inserted **between the email
   row and the Sign Out item** (i.e. after the email `<div>` / first separator,
   before the Sign Out `DropdownMenuItem`), each as a `DropdownMenuItem` → `Link`
   with its icon (Trash2 / Settings) + label. Add a separator before Sign Out so
   it stays visually distinct.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/app-shell/bottom-nav.tsx:42-43` | `overflowItems = visibleItems.filter(item => item.overflow)` — the "More" set (Price Book, Trash, Settings) |
| `components/app-shell/bottom-nav.tsx:129-158` | The "More" `DropdownMenu` that renders the overflow items |
| `components/app-shell/nav-items.ts` | `NAV_ITEMS` + the `overflow` flags on Trash/Settings/Price Book; also the Trash (`/trash`) + Settings (`/settings`) hrefs/icons to reuse |
| `components/app-shell/nav-user-dropdown.tsx:34-45` | Target menu: `email` div (l.35) → separator (l.36) → Sign Out (l.37-44). Insert Trash + Settings between l.35 and l.37 |

## Notes

- `NavUserDropdown` only knows `email`/`avatarUrl` today — it'll need the Trash +
  Settings items (import the two from `nav-items`, or pass them in).
- Part of the phone-nav rethink: reconcile with [[SEED-049-phone-persistent-side-nav-menu]]
  (always-on side rail) and [[SEED-051-phone-immersive-settings-experience]] —
  these are overlapping answers to "how does phone nav/settings work"; decide the
  whole phone-nav shape in one pass so Trash/Settings don't end up in two places.
- The parallel mobile-nav refactor WIP is stashed (`git stash list | grep
  "app-shell mobile-nav refactor"`) — its `MobileNavSheet` is another home for
  these items; consider it when deciding.
