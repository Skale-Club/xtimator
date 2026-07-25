---
id: SEED-051
status: harvested
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested: 2026-07-24
harvested_in: quick-260724-iset
harvest_note: >
  Implemented Option C (full-width content + horizontal top-tab nav on phone),
  NOT the full Option A drill-down. Rationale: the routing-based drill-down is a
  large change to a core, auth-gated area that can't be visually verified here
  without real risk; Option C is the high-value, low-risk, verifiable win and
  also aligns the real layout with the long-standing settings skeleton. Option A
  (dedicated section list → full-screen section + back header) remains a
  documented follow-up to do with auth-verified iteration.
trigger_when: Next phone-nav / settings UX pass (plan together with SEED-049 and SEED-050)
scope: medium
---

# SEED-051: Phone — a more immersive Settings experience

## Why This Matters

On phone, tapping **Settings** drops you into a cramped layout: a fixed
icon-only left rail (`w-14`, sometimes `w-40`) plus a narrow content column
squeezed beside it. The user wants a **more immersive experience — "like opening
the settings page"** — and asked for a plan of good ways this could work.

## Proposed approaches (user asked to "plan good ways this could work best")

### Option A — Drill-down full-screen (native settings pattern) ★ recommended
Tapping Settings opens a **full-width list** of sections (Company, Account,
Team, Notifications, Estimates, Plans, Message Template, Knowledge,
Integrations) — each a full-width row with icon + label + chevron. Tapping a row
**slides into that section full-screen** with a back aff`← Settings` header. No
side rail on phone. This is the iOS/Android Settings pattern: immersive, uses the
whole width, obvious hierarchy, one thing at a time. Best fit for "opening the
settings page."
- Impl: a phone-only `/settings` index view listing sections; each section route
  renders full-screen below `lg` (hide the rail, show a back header). Can be pure
  routing (`/settings` → list, `/settings/team` → full section) with a
  responsive back-header, so desktop keeps the cascade unchanged.

### Option B — Full-screen sheet/modal
Settings opens as a full-screen overlay (sheet or modal route) containing the
same drill-down. Keeps the underlying page in place behind it. More app-like
"mode," but adds an overlay layer to manage.

### Option C — Horizontal top tabs (lightest touch)
Keep a single page but replace the left icon-rail with a **horizontal scrollable
tab bar** at the top (Company · Account · Team · …) and full-width content below.
Less immersive than A, but a small change and instantly reclaims the width.

### Option D — Bottom-sheet section switcher
Content is full-width; a header button (current section name ▾) opens a **bottom
sheet** listing sections to jump between. Thumb-friendly, minimal chrome.

**Recommendation:** **Option A** for the most immersive/native feel; **Option C**
as the low-effort fallback if a full drill-down is too much for now. Confirm the
choice with the user before building.

## Scope Estimate

**Medium** — depends on the option. C is small (swap rail → top tabs, mobile
only). A is medium (a phone index view + a responsive back-header + hiding the
rail below the breakpoint) but keeps desktop's cascade untouched.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/settings/settings-layout-client.tsx` | Current phone settings layout (fixed left rail + content) — what an immersive redesign replaces below the desktop breakpoint |
| `components/settings/settings-nav.tsx` | The settings section list (`SubNav`) — the sections to render as the drill-down list / tabs |
| `app/(app)/settings/**` | Settings routes/pages — Option A can lean on these (index = list, `/settings/<section>` = full-screen on phone) |
| `components/skeletons/settings-shell-skeleton.tsx`, `settings-subnav-skeleton.tsx` | Loading states — update to match whichever layout is chosen |

## Notes

- Keep **desktop (`lg`) unchanged** — the desktop sidebar + settings cascade is
  the good baseline; this seed is a phone-only (and maybe tablet) treatment.
- Reconcile with [[SEED-049-phone-persistent-side-nav-menu]] and
  [[SEED-050-phone-move-trash-settings-to-user-dropdown]] — the phone nav shape
  (persistent rail? bottom nav? where Settings lives?) should be decided as one
  coherent phone-navigation design, not three disconnected tweaks. The stashed
  mobile-nav refactor WIP (`git stash list | grep "app-shell mobile-nav
  refactor"`) is prior art for this.
