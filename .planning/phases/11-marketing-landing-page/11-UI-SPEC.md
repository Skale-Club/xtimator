---
phase: 11
slug: marketing-landing-page
status: draft
created: 2026-04-22
---

# Phase 11 - UI Design Contract

## Design Direction

Dark-mode marketing page with strong contrast, clear hierarchy, and conversion-focused flow.

- Visual tone: modern, confident, field-work practical (not abstract enterprise)
- Primary accent: `#406EF1`
- Secondary accent: `#7FA4F4`
- Background base: near-black gradient (`#0A0A0F` -> `#0D0F1A`)

---

## Palette Contract

| Role | Value | Usage |
|------|-------|-------|
| Background | `#0A0A0F` | Page base |
| Surface | `#13131A` | Feature cards, section containers |
| Surface Border | `rgba(127, 164, 244, 0.22)` | Subtle card edges |
| Primary | `#406EF1` | Main CTA, active chips, section highlights |
| Primary Hover | `#4E79F3` | CTA hover/press |
| Secondary | `#7FA4F4` | Supporting accents, gradients, micro-highlights |
| Text Primary | `#F5F7FF` | Headlines and body emphasis |
| Text Secondary | `#B8C1DA` | Supporting copy |

Rule: all interactive colors should resolve through project tokens where available (`hsl(var(--primary))`, `hsl(var(--ring))`).

---

## Typography Contract

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Hero Display | 42-56px | 700 | Tight tracking, 1.05-1.15 line-height |
| Section Heading | 28-36px | 600 | Strong but compact |
| Card Heading | 18-22px | 600 | Short, benefit-first |
| Body | 16-18px | 400 | Readable on dark surface |
| Meta/Caption | 13-14px | 500 | Step labels and helper text |

---

## Layout Contract

Landing order is fixed for this phase:

1. Hero (headline, subheadline, CTA pair)
2. How It Works (3-step flow)
3. Features/Benefits (4-card grid)
4. Final CTA strip
5. Footer

Spacing rhythm:

- Section padding: `py-16` mobile, `py-24` desktop
- Max width container: `max-w-6xl`
- Card gap: `gap-4` mobile, `gap-6` desktop

---

## Interaction and Motion

- Primary CTA has clear hover/focus states using `ring-ring`.
- Section reveal uses subtle fade/translate only (no heavy parallax).
- Avoid animation that blocks content readability on mobile.

---

## Accessibility and Mobile Guarantees

- No horizontal overflow at 390px width.
- CTA buttons remain visible above the fold in hero on mobile.
- Color contrast for headline/body text on dark background must meet AA.
- Focus-visible ring required for all links/buttons.

---

## Non-Goals (Phase 11)

- Pricing table
- Testimonial carousel
- Interactive product demo video

These are intentionally deferred (already marked in requirements as future work).
