---
id: SEED-002
status: dormant
planted: 2026-04-22
planted_during: v1.1 — Dark-first UX & Modern Redesign (all 9 phases complete)
trigger_when: when starting a milestone that includes public launch prep, marketing, or brand identity consolidation
scope: Medium
---

# SEED-002: Landing Page + Identidade Visual Global (#406EF1)

## Why This Matters

Currently `app/page.tsx` redirects straight to `/auth/login` (Decision D-04 — no landing page in v1).
Before public launch, the platform needs:
1. A public-facing marketing landing page to drive conversions
2. A consistent global brand identity using the chosen primary color `#406EF1` throughout the
   entire UI — including the admin panel, which currently defaults to `220 91% 60%`

This is the difference between a working app and a shippable product.

## When to Surface

**Trigger:** When a milestone targets public launch, marketing site, brand identity, or
customer-facing polish.

This seed should be presented during `/gsd:new-milestone` when:
- The milestone mentions "landing page", "marketing", "public launch", "brand", or "identity"
- A v1.2+ milestone is being scoped for external users / growth
- The admin branding panel (Phase 08) is being extended with a default color seed

## Design Specification

### Color System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#406EF1` (HSL ≈ `226 85% 60%`) | CTAs, active nav items, highlights, links |
| Secondary | `#7FA4F4` (HSL ≈ `218 85% 73%`) | Hover states, secondary accents, gradients |
| Background | Near-black (e.g., `#0A0A0F` or `#0D0D14`) | Page background in dark mode |
| Surface | `#13131A` / `#1A1A24` | Cards, panels, sidebars |

### Landing Page Requirements

- **Mode**: Dark mode first (consistent with v1.1 system-wide dark default)
- **Style**: Modern, elegant — NOT generic AI SaaS look; high visual quality
- **Sections**: Hero, Features/Benefits, How It Works, Social Proof / Testimonials, Pricing, CTA, Footer
- **Responsive**: Mobile-first; audio recording + camera flow must be demonstrable on mobile

### Admin Panel Color Update

- Replace default `220 91% 60%` fallback in `--platform-primary` with `226 85% 60%` (`#406EF1`)
- Update `app/(auth)/layout.tsx:15` and `app/admin/layout.tsx:18` fallback values
- Update Tailwind config / CSS variables to use `#406EF1` as the base `--primary` token

### Required Design Skills (Use During Phase)

Install and invoke before building:

```
https://skills.sh/vercel-labs/agent-skills/web-design-guidelines
https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max
```

Both skills must be active when generating the landing page UI to ensure production-grade
visual quality, not generic AI output.

## Scope Estimate

**Medium** — 1 full phase, ~3-4 plans:
1. Global brand token update: `#406EF1` as `--primary` / `--platform-primary` default everywhere
2. Landing page scaffold + hero + features sections
3. Pricing, testimonials, CTA, footer sections
4. Mobile responsiveness pass + admin panel color audit

## Breadcrumbs

Related code in current codebase:

- `app/page.tsx` — currently redirects to `/auth/login`; this is where the landing page root goes
- `app/(auth)/layout.tsx:15` — `--platform-primary` fallback `220 91% 60%` → update to `226 85% 60%`
- `app/admin/layout.tsx:18` — same fallback to update
- `app/admin/branding/branding-preview-card.tsx:74,98` — preview card uses `--platform-primary`; will reflect new default
- `.planning/STATE.md:61` — Decision D-04: "no landing page in v1" — this seed overrides that for v1.2+
- `.planning/phases/08-platform-admin-panel-for-centralized-api-integrations/08-UI-SPEC.md` — UI spec pattern to follow
- `.planning/phases/09-system-wide-dark-mode-default/` — dark theme implementation to build upon

## Notes

- The landing page should use `app/page.tsx` as entry point (remove the login redirect).
- Auth redirect logic should move to middleware or a separate route check so `/` serves the landing.
- `#406EF1` in HSL is approximately `226 85% 60%` — verify with a color converter before committing.
- The scoped `[data-theme]` CSS var pattern from Phase 08 / 09 can be reused for the landing page
  hero gradient effects.
