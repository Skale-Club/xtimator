---
id: SEED-052
status: superseded
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested:
harvested_in:
trigger_when: Next phone-nav / settings UX pass (plan together with SEED-049/050/051)
scope: small
---

# SEED-052: Phone — show the account avatar in the settings-rail footer

> **SUPERSEDED (2026-07-24):** user chose **"bottom nav only"** — there is no
> persistent phone rail (and SEED-051 removes the settings rail), so there's no
> rail footer to host the avatar. The account avatar stays as the mobile-header
> dropdown trigger (top-right), and account items (Trash/Settings/Sign Out) live
> in that dropdown per [[SEED-050-phone-move-trash-settings-to-user-dropdown]].
> Kept for history.

## Why This Matters

On phone, in the Settings view, the bottom-left of the settings sub-nav rail is
empty (just the collapse `<` toggle sits there — the spot the user marked with a
red square). The user wants the **account avatar (the profile photo currently in
the top-right mobile header) to appear there** — anchoring the account/user at
the bottom of the rail, the way a desktop sidebar footer shows the user.

## Scope Estimate

**Small** — add the avatar to the settings-rail footer on phone:

1. Render the account `Avatar` (profile image, `avatarUrl`, initial fallback) in
   the settings sub-nav **rail footer**, on the left of the existing collapse
   toggle (keep the toggle on the right).
2. Scope to phone (the mobile settings view) — desktop already has its own rail
   footers; don't disturb them.
3. Likely make the avatar tappable → open the user menu (email + Sign Out, and
   per SEED-050 possibly Trash/Settings). Reuse `NavUserDropdown` or its content.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/settings/settings-layout-client.tsx` (rail footer `div`, `mt-auto … border-t … p-2` holding the collapse toggle) | The exact footer element the red square points at — add the avatar here |
| `components/app-shell/nav-user-dropdown.tsx` | The avatar (with `avatarUrl`) + the user menu it opens — reuse for the rail-footer avatar |
| `components/ui/avatar.tsx` | `Avatar`/`AvatarImage`/`AvatarFallback` primitives |
| settings layout wiring (`app/(app)/settings/**` / the layout that renders `SettingsLayoutClient`) | `SettingsLayoutClient` doesn't receive `navUser`/`avatarUrl` today — it'll need the avatar data passed down |

## Notes

- `SettingsLayoutClient` currently takes only `children` — plumb `navUser`
  (email + avatarUrl) down to it (from the app-shell layout that already has it).
- **User-confirmed scope ("that last one for phone mode too" → "yes"):** the
  account-avatar footer should anchor the **always-on phone side menu
  ([[SEED-049-phone-persistent-side-nav-menu]])**, not only the Settings rail —
  i.e. wherever the persistent phone rail lives, its footer shows the account
  avatar (like the desktop sidebar footer). If the phone-nav shape ends up
  bottom-nav-only (no persistent rail), this avatar instead lives in the avatar
  dropdown per [[SEED-050-phone-move-trash-settings-to-user-dropdown]].
- Part of the phone-nav rethink — reconcile with
  [[SEED-049-phone-persistent-side-nav-menu]],
  [[SEED-050-phone-move-trash-settings-to-user-dropdown]], and
  [[SEED-051-phone-immersive-settings-experience]]. If SEED-051's immersive
  drill-down is chosen, this avatar placement should fit that layout rather than
  the current fixed rail.
