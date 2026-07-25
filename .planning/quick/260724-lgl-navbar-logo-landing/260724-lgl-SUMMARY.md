---
phase: quick-260724-lgl
status: complete
date: 2026-07-24
harvests: SEED-053
files_modified:
  - components/app-shell/mobile-header.tsx
---

# Summary: Navbar logo → landing page (harvest SEED-053)

The mobile-header logo/name `<Link>` pointed at `/dashboard`; changed to `/` so
tapping the Xtimator icon/name on phone (and tablet, where the mobile header
shows) takes you to the landing page — matching the desktop sidebar logo, which
already links to `/`. `/` renders the landing page even when authenticated
(quick-260718-w4r), so no auth bounce.

One-line change: `components/app-shell/mobile-header.tsx` logo `href`
`/dashboard` → `/`.

## Verification
- tsc clean (href string change; no type impact).
- Sidebar logo already `href="/"` (consistency confirmed).

## Notes
- Part of the phone-nav seed set; the fork-independent one, executed first.
- Local commit only, not pushed.
