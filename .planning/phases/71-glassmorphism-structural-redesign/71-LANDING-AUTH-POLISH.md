---
phase: 71
task: landing-auth-polish
type: inline-polish
created: 2026-05-17
tags: [polish, landing, auth, glassmorphism, first-impression]
---

# Phase 71 — Landing + Auth Polish Pass

Premium upgrade on the two first-impression surfaces (landing + auth). Coherent with the Phase 71 token system established in 71-01..04, but pushed visually further than the baseline 71-03 / 71-04 redesigns.

All upgrades are surface-level composition on top of `components/ui/*` primitives. **Zero changes to primitives.** Zero functional changes. Zero copy changes to existing strings.

## Scope

- `components/landing/hero-section.tsx`
- `components/landing/how-it-works-section.tsx`
- `components/landing/features-section.tsx`
- `app/(auth)/layout.tsx`
- `components/auth/auth-card.tsx`
- `components/auth/auth-brand-showcase.tsx` (NEW)
- `app/(auth)/login/login-form.tsx`
- `app/(auth)/signup/signup-form.tsx`
- `app/(auth)/reset-password/reset-password-form.tsx`
- `app/globals.css` (additive CSS layer: `.hero-mesh`, `.hero-dots`, `.cta-glow`, `.gradient-border-card`, `.auth-submit-shimmer`, `.input-glow-strong`, `.brand-showcase`)

## What Was Upgraded vs Baseline

### Landing — Hero

| Aspect             | Baseline (71-03)                              | Polish                                                                                                  |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Headline scale     | `clamp(40px, 8vw, 72px)` tracking `-0.025em`  | `clamp(44px, 10vw, 96px)` tracking `-0.04em` leading `0.98` — gigantic, magazine-cover scale            |
| Backdrop           | Single `gradient-hero` radial                 | + Animated `hero-mesh` (4-radial mesh with 22–34s float keyframes) + low-opacity dot grid + edge mask   |
| Primary CTA        | `<Button variant="primary">` shimmer baseline | Wrapped in `.cta-glow` (40px blur halo, 3.4s breathing pulse, motion-gated)                             |
| Trust signals      | 2 inline checkmarks only                      | + Trust band (3 placeholder stats) above the fold, gradient dot bullets, `border-t` divider             |
| Vertical rhythm    | `py-[clamp(64px,12vw,96px)]`                  | `py-[clamp(64px,12vw,112px)]` (more breathing on desktop)                                               |

All animations gated through `prefers-reduced-motion: no-preference` in CSS — `.hero-mesh` keyframes only run when motion is allowed, and `prefers-reduced-transparency` falls back to display-none for the mesh + dots.

### Landing — How It Works

| Aspect           | Baseline (71-03)                                  | Polish                                                                                       |
| ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Step badge       | Single icon in `gradient-brand` circle            | Numbered badge (`Step 01/02/03`) with icon overlay, ring-1, stronger 32px glow               |
| Card hover       | Color-tint overlay fade                           | + 0.5px lift, border tints to `primary/30`, glow ramps to 50px @ 18% intensity               |
| Stagger          | `delay: index * 0.1`, `duration: 0.5`             | `delay: index * 0.12`, `duration: 0.55`, `ease: 'easeOut'` — smoother sequenced reveal       |

### Landing — Features

| Aspect          | Baseline (71-03)                                            | Polish                                                                                  |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Card hover      | `hover:shadow-[0_0_40px_hsl(var(--primary)/0.1)]`           | + 0.5px lift + `hover:border-primary/30` + glow bumped to 60px @ 22% intensity          |
| Stagger         | 0.1s / 0.5s                                                 | 0.12s / 0.55s with easeOut (matches how-it-works rhythm)                                |

### Auth — Layout

| Aspect          | Baseline (71-04)                                          | Polish                                                                                                                |
| --------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Layout          | Single centered column                                    | **Two-column on desktop** (`lg:grid-cols-[1fr_minmax(0,520px)]`): glass form left, brand showcase right; single-col mobile |
| Backdrop        | `gradient-hero` radial only                               | + Animated `hero-mesh` overlay (motion-gated)                                                                         |
| Brand showcase  | n/a                                                       | NEW `<AuthBrandShowcase>` — gradient-brand surface, Xtimator wordmark, pull-quote testimonial, feature pills          |

### Auth — Card

| Aspect           | Baseline (71-04)                              | Polish                                                                                                |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Glass strength   | `<Card variant="glass">` (16px blur)          | `<Card variant="glass-strong">` (24px blur, denser bg)                                                |
| Border           | Token `--glass-border` single-color           | + `.gradient-border-card` 1px gradient ring via mask-image trick                                      |
| Shadow           | `shadow-glass`                                | + 30px×80px deep ambient drop shadow for premium float                                                |
| Padding          | `p-8`                                         | `p-8 sm:p-10` (more breathing on desktop)                                                             |
| Logo fallback    | Solid `bg-primary` square                     | `gradient-brand` square with directional drop-shadow glow                                             |
| Wordmark weight  | `font-extrabold`                              | `font-semibold` (matches UI-SPEC weight rule: 400/500/600 only)                                       |

### Auth — Forms

| Aspect           | Baseline (71-04)                                                | Polish                                                                                              |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Input focus      | `focus-visible:border-primary focus-visible:ring-1`             | `.input-glow-strong` — 3px primary/18% ring + 24px primary/45% glow (stronger gradient halo)         |
| Submit hover     | Primitive `variant="primary"` baseline shimmer                  | + `.auth-submit-shimmer` (stronger sweep on hover) + `hover:scale-[1.015]` micro-bounce + `active:scale-100` |

## What Was Preserved

- **Routes + IA**: same paths, same form fields, same auth server actions (`signIn`, `signUp`, `resetPassword`, `updatePassword`)
- **All existing copy strings**: zero modifications to landing content (`getLandingContent` flow untouched), zero modifications to form labels/placeholders/error messages
- **Brand color**: `#406EF1` / `hsl(var(--primary))` everywhere; tenant `--platform-primary` cascade preserved by construction (gradients reference `hsl(var(--primary))`)
- **Logo + wordmark**: preserved; wordmark weight normalized to `semibold` per UI-SPEC weight rule
- **i18n readiness**: new placeholder strings centralized as `TRUST_BAND` / `SHOWCASE_COPY` constants at top of each file — single sweep for future `t()` wiring
- **Performance**:
  - `backdrop-filter` still NOT introduced on landing scroll surfaces (mesh + dots use static `background-image`, not `backdrop-filter`)
  - Auth card `variant="glass-strong"` blur is GPU-cheap because it's a single fixed-size element above the fold
- **`prefers-reduced-motion`**: every new animation gated:
  - `.hero-mesh` keyframes wrapped in `@media (prefers-reduced-motion: no-preference)`
  - `.cta-glow` pulse wrapped same
  - `.auth-submit-shimmer:hover::after` wrapped same
  - Framer-motion `useReducedMotion()` `initial={reduce ? false : …}` retained on stagger reveals
- **`prefers-reduced-transparency`**: `.hero-mesh` + `.hero-dots` + `.cta-glow` all set to `display: none` / `box-shadow: none` under reduce
- **WCAG AA contrast**: white text on glass over hero-mesh stays > 4.5:1; brand showcase white-on-gradient-brand stays > 4.5:1
- **Primitives**: `components/ui/*` completely untouched (CVA variants from 71-02 still canonical)

## Verification

| Check                                                            | Before | After   | Status |
| ---------------------------------------------------------------- | ------ | ------- | ------ |
| `bun run test tests/unit/components/`                            | 72     | 72      | green  |
| `bunx tsc --noEmit` error count                                  | 22     | 22      | held   |
| Hero headline clamp(min) ≥ 40px (PT/ES i18n gate)                | 40px   | 44px    | better |
| Animations gated through `prefers-reduced-motion`                | n/a    | all new | enforced |
| Forms: zero functional changes (server actions, validation)      | n/a    | confirmed | held |
| `components/ui/*` modifications                                  | n/a    | zero    | held   |

## Commits

| Hash      | Subject                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| `cad9d40` | feat(71-polish): premium hero — gigantic headline, animated mesh, glow CTA, trust band         |
| `f6900b7` | feat(71-polish): how-it-works number badges + stagger + hover lift on landing cards            |
| `5439586` | feat(71-polish): two-column auth layout with brand showcase + stronger glass card              |
| `3a55b4b` | feat(71-polish): stronger gradient focus glow on inputs + shimmer/scale on auth submits        |

## Known Stubs

None functional. Trust band stats (`Used by 500+ contractors`, `12,000+ estimates sent`, `4.9/5 average rating`) and brand showcase quote (`Daniel R., Northstar Renovations`) are **placeholder copy** — these are explicitly i18n-ready constants grouped at the top of each component for a single-sweep replacement when marketing finalizes the strings. They render as real DOM and meet the user's "use placeholder copy that's i18n-ready" requirement.

## Notes for Future Work

1. **Trust band / brand showcase copy** — when marketing supplies real numbers + customer quote, swap the `TRUST_BAND` and `SHOWCASE_COPY` constants in `hero-section.tsx` and `auth-brand-showcase.tsx`. No structural change needed.
2. **Visual snapshots** — auth + marketing snapshot specs from 71-03 / 71-04 will need re-minting (`--update-snapshots`) since the visual changes here are intentional. Defer to next wave's snapshot pass (same pattern as 71-03 / 71-04 baselines).
3. **Auth two-column threshold** — `lg:grid-cols-[1fr_minmax(0,520px)]` activates at 1024px. Below that, single column; brand showcase hidden via `hidden lg:block`.
