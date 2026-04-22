# Phase 11: Marketing Landing Page - Research

**Researched:** 2026-04-22
**Domain:** Public route architecture, dark-mode marketing UI, responsive behavior
**Confidence:** HIGH

## Summary

Phase 11 introduces the first public marketing surface at `/`. The current root route (`app/page.tsx`) hard-redirects to `/auth/login`, so the work is both routing and UI.

The implementation should preserve authenticated-user fast paths while letting logged-out visitors land on a high-quality, dark-mode page that clearly explains the 3-step value flow and drives signup.

Phase 10 already locked brand tokens to `#406EF1` (`224 86% 60%`), so this phase should consume existing tokens (`bg-primary`, `text-primary`, `ring-ring`, etc.) instead of adding one-off color constants.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAND-01 | Hero with headline, subheadline, signup/login CTA | Root page server component with primary CTA group |
| LAND-02 | How It Works 3-step section (audio -> photos -> estimate) | Dedicated section with numbered cards and mobile-first layout |
| LAND-03 | Features/benefits grid (AI generation, branded PDF, share link, mobile-first) | 4-card feature grid using existing Card primitives |
| LAND-04 | Fully responsive on iOS Safari + Android Chrome | Add Playwright mobile projects + route-specific e2e assertions |
| LAND-05 | Dark visual quality using near-black + #406EF1 + #7FA4F4 | UI spec with explicit palette, spacing, type scale, and contrast rules |

---

## Existing Architecture and Constraints

- `app/page.tsx` currently redirects all visitors to `/auth/login`; this is the direct insertion point.
- No `middleware.ts` exists in repo today; authenticated redirect logic can be centralized there to keep page component pure.
- Global theme stack is already dark-first (`ThemeProvider` defaulting to dark from cookie fallback in `app/layout.tsx`).
- Brand tokens are centralized in `app/globals.css`; do not reintroduce hardcoded old fallback values.
- Existing design system: shadcn/ui primitives + Tailwind tokens; keep consistent structure and utility style.

---

## File Inventory for Phase 11

### Must modify

- `app/page.tsx` - replace redirect with marketing page server component.

### Likely add

- `components/landing/landing-page.tsx`
- `components/landing/hero-section.tsx`
- `components/landing/how-it-works-section.tsx`
- `components/landing/features-section.tsx`
- `components/landing/final-cta-section.tsx`
- `components/landing/landing-footer.tsx`

### Routing and behavior

- `middleware.ts` - redirect authenticated users visiting `/` to `/dashboard` while keeping `/` public for visitors.

### Validation

- `tests/e2e/landing-page.spec.ts`
- `playwright.config.ts` (mobile projects for iOS Safari and Android Chrome emulation)

---

## Key Decisions

1. Route-level behavior
   - Keep `/` public and deterministic.
   - Move auth-state redirect responsibility to middleware so page rendering stays declarative.

2. Design implementation approach
   - Build with composable landing components under `components/landing`.
   - Use tokens from `globals.css`; avoid section-level random palettes.

3. Responsiveness strategy
   - Ship mobile-first layout from initial implementation.
   - Validate with Playwright projects that emulate iOS Safari and Android Chrome viewports.

---

## Risks and Mitigations

- Risk: accidental regression of auth redirect flow.
  - Mitigation: explicit middleware matcher and route guard tests for `/` + authenticated cookie/session states.

- Risk: generic SaaS look despite requirement for production quality.
  - Mitigation: lock UI contract in `11-UI-SPEC.md` (palette, typographic hierarchy, spacing, motion).

- Risk: mobile overflow in hero and feature cards.
  - Mitigation: add e2e checks for no horizontal scroll and visible CTA at 390x844 and 412x915 breakpoints.

---

## Sources

- `app/page.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/seeds/SEED-002-landing-page-global-brand-identity.md`
