---
phase: quick-260724-cnav
status: complete
date: 2026-07-24
commit: (revert to HEAD — no code diff; docs commit only)
stash_ref: 'git stash list | grep "app-shell mobile-nav refactor"'
files_reverted:
  - app/(app)/layout.tsx
  - components/app-shell/bottom-nav.tsx
  - components/app-shell/mobile-header.tsx
  - components/app-shell/nav-user-dropdown.tsx
  - components/app-shell/sidebar.tsx
  - components/app-shell/topbar.tsx
  - components/app-shell/mobile-nav-sheet.tsx
  - components/settings/settings-layout-client.tsx
  - components/skeletons/settings-shell-skeleton.tsx
  - components/skeletons/settings-subnav-skeleton.tsx
---

# Summary: Restore the 768px tablet cascade (revert app-shell mobile-nav WIP)

## What the user saw

On phone/tablet the settings "cascade" (main sidebar + settings sub-nav rail)
looked broken — on tablet `/settings` the sub-nav rail rendered without its
parent sidebar. User: "the cascade menu got messed up on phone and tablet modes,
fix them so it is the same cascade effect it was before."

## Root cause (NOT a bug I introduced)

An **uncommitted, deliberate in-progress refactor** — already in the working
tree at the start of this session, authored by neither me nor the hero work —
moved the entire app-shell desktop/mobile breakpoint from **`md` (768px)** to
**`lg` (1024px)** and swapped `NavUserDropdown` for a new `MobileNavSheet`
(documented in that file: "for every width where MobileHeader renders (<1024px —
phone and tablet alike)"). Net effect: 768–1023px (tablet/iPad) became "mobile"
— hamburger sheet + bottom nav, and the settings cascade rail rendered without
the (now `lg`-gated) sidebar.

Surfaced this to the user via AskUserQuestion (it contradicted the "got messed
up" framing — it was intentional WIP I didn't create). User chose: **revert to
the old 768px cascade**, preserving the WIP.

## What was done

Scoped `git stash` of exactly the 10 cascade-refactor files (leaving the other
unrelated uncommitted WIP — projects pages, chat-bubble, how-it-works,
install-prompt, tour-help-button, estimate-floating-actions — untouched):

```
git stash push -u -m "app-shell mobile-nav refactor WIP (md->lg 768->1024
  breakpoint + MobileNavSheet, del NavUserDropdown) — stashed 2026-07-24 to
  restore the 768px tablet cascade per user request" -- <10 paths>
```

`app/(app)/layout.tsx` had to be included — it passed the new `isDemo` prop to
`MobileHeader` and had its own `md:pb-6`→`lg:pb-6` change; reverting the header
without it would have been a type error.

Result: all 10 files are now byte-identical to HEAD (`deb12330`) — the known-good
768px cascade. `nav-user-dropdown.tsx` restored, `mobile-nav-sheet.tsx` removed,
sidebar `DESKTOP_SIDEBAR_QUERY` back to `(min-width: 768px)` / `hidden md:flex`,
settings sub-nav back to `md:left-[var(--app-sidebar-width)]`.

## Verification

- `git status` — the 10 files no longer appear (== HEAD); the other WIP remains.
- `nav-user-dropdown.tsx` present; `mobile-nav-sheet.tsx` gone.
- `npx tsc --noEmit -p tsconfig.ci.json` — clean (exit 0; no dangling imports).
- The restored state is literally HEAD, a previously-shipped working cascade, so
  no visual re-derivation is needed. (Browser-pane visual check skipped — the
  `/settings` route is auth-gated and the pane can't composite/measure this app.)

## Recovering the stashed refactor

The WIP is NOT lost — it's in the stash. To restore it later:

```
git stash list | grep "app-shell mobile-nav refactor"   # find its index
git stash apply stash@{N}                                # re-apply (keep in stash)
```

## Notes

- No code commit (working tree == HEAD for these files). Docs commit only.
- If the mobile-at-tablet refactor is wanted again later, unstash it and finish
  the `/settings` cascade rail so it doesn't render without the sidebar below
  `lg` — that partial-rail render was the actual defect in the WIP.
