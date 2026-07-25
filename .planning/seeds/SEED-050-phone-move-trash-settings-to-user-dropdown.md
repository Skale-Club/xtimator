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

# SEED-050: Phone — move Trash + Settings to user dropdown; Price Book becomes the last bottom-nav item (drop "More")

## Why This Matters

On phone, **Trash** and **Settings** currently live in the bottom-nav **"More"**
overflow dropdown (alongside Price Book). The user wants **Trash and Settings
moved into the avatar/user dropdown** (the one opened from the top-right avatar,
showing the email + Sign Out) — specifically **in the space between the email
row and the Sign Out item**.

With Trash + Settings gone, the only overflow item left is **Price Book** — so
(user clarification) **Price Book is promoted to a direct bottom-nav slot as the
LAST item, and the "More" `…` button is removed entirely**. End-state bottom nav:
`Dashboard · Projects · New Xtimate (center) · Clients · Price Book`.

Rationale: Trash/Settings are account/management destinations that fit next to
the account actions (email, Sign Out); and with nothing else overflowing, a
dedicated Price Book slot is cleaner than hiding it behind "More".

## Scope Estimate

**Small** — move two nav destinations between two existing menus:

1. **Remove Trash + Settings from the bottom-nav overflow.** They render there
   because their `NAV_ITEMS` entries carry `overflow: true`. Drop them from the
   bottom-nav's item set (they now live in the user dropdown instead).
2. **Promote Price Book to a direct bar slot (LAST item) and remove "More".**
   Clear `overflow: true` on the Price Book item so it renders as a normal bar
   item. With no overflow items remaining, the `overflowItems.length > 0` guard
   drops the "More" button automatically. The existing center-primary reorder
   yields `Dashboard · Projects · New Xtimate · Clients · Price Book`.
3. **Add Trash + Settings to `NavUserDropdown`**, inserted **between the email
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
