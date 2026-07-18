---
phase: quick-260718-s5m
status: complete
date: 2026-07-18
commit: 2d4fe4d5
files_modified:
  - components/landing/top-nav-auth.tsx
  - components/landing/top-nav.tsx
  - components/landing/landing-page.tsx
---

# Summary: Navbar Start CTA (signup) right of Login

## What changed

- **top-nav-auth.tsx**: logged-out state now renders Login + a new `<Button variant="primary" size="sm" className="px-4">` (same gradient-brand "blue square" as the hero Start) grouped in a `flex items-center gap-4` div — Start sits to the RIGHT of Login. New `openSignup()` mirrors `openLogin()`: prefers `onOpenAuth('signup')` (LandingPage-owned dialog), falls back to the local AuthDialog with mode `signup`. New optional `ctaLabel` prop (default 'Start').
- **top-nav.tsx**: passes the new optional `ctaLabel` through to TopNavAuth.
- **landing-page.tsx**: threads `content.ctaLabel` (same DB-driven label the hero uses) into TopNav.

No hero change was needed: hero Start already opens signup (`onOpenAuth?.('signup')` → AuthDialog `initialMode`), Login already opens login. Logged-in navbar (avatar dropdown) untouched. Note: tests/e2e/auth-modal.spec.ts already assumed a nav Start CTA existed ("per landing-nav.tsx", a since-removed component) — this restores that.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- `tests/unit/seo/home-cacheability.test.ts` — 4/4 (it reads top-nav-auth.tsx + landing-page.tsx source; pins intact)
- `tests/unit/components/landing-page.test.tsx` — 4/5; the 1 failure is the same pre-existing `?auth=login` lazy-load flake documented in quick-260718-q2v (proven unrelated there via stash test)
- Live DOM at 1390px: header order logo → Login (x=1106) → Start (x=1159, 64×36px, `data-variant="primary"`, gradient background, vertically centered in the 64px bar)
