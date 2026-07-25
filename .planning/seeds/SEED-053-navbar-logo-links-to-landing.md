---
id: SEED-053
status: harvested
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested: 2026-07-24
harvested_in: quick-260724-lgl
trigger_when: Next nav/app-shell polish pass (trivial — can fold into any nearby task)
scope: small
---

# SEED-053: Navbar logo/name should link to the landing page

## Why This Matters

Clicking the Xtimator **icon or name** in the navbar should take you to the
**landing page (`/`)**. Today it's inconsistent:

- **Desktop sidebar** logo/name → already `href="/"` (landing) ✓
- **Mobile header** logo/name → `href="/dashboard"` ✗ (goes to the dashboard,
  not the landing)

So on phone (and tablet, where the mobile header shows) the logo doesn't behave
as the user expects. Make it consistent → landing.

## Scope Estimate

**Trivial** — one-line change: in `mobile-header.tsx`, change the logo `<Link>`
`href` from `/dashboard` to `/`. (The desktop sidebar already points at `/`.)

Note: `/` renders the **landing page even for authenticated users** (established
by quick-260718-w4r "landing-root-shows-landing-when-authed"), so this reliably
lands users on the marketing/landing page as requested — no auth redirect back
to the app.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/app-shell/mobile-header.tsx:47-48` | Logo `<Link href="/dashboard">` — change to `href="/"` |
| `components/app-shell/sidebar.tsx:190` | Logo `<Link href="/">` — already correct; the reference/consistency target |

## Notes

- Confirm intent: an in-app logo usually goes "home" (dashboard), but the user
  explicitly wants the **landing** page — and the desktop sidebar already does
  exactly that, so matching it is the consistent choice.
- If a topbar logo is ever added (desktop topbar currently shows breadcrumbs, no
  logo), point it at `/` too.
