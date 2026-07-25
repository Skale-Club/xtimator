---
id: SEED-045
status: harvested
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested: 2026-07-24
harvested_in: quick-260724-fcp
trigger_when: Next milestone or quick pass touching landing-page visual polish / features section
scope: small
---

# SEED-045: Feature card — center the benefit pill + desaturate the corner icon

## Why This Matters

Two small visual refinements on the landing "features" cards (the
`Generate Estimates` / `Branded PDF Estimates` / etc. cards), requested from a
live screenshot:

1. **Benefit pill alignment.** The blue benefit pill at the bottom of each card
   (e.g. "Skip the blank-page struggle", "Look professional") is an
   `inline-flex` element that hugs its text and sits flush-left. The user wants
   the pill **centered** horizontally within the card instead of left-aligned.
2. **Corner icon saturation.** The blue circular icon badge floating over the
   top-right corner of each card image is too saturated — reduce its saturation
   by **50%**.

## When to Surface

**Trigger:** Any landing-page polish pass, features-section work, or general UI
refinement milestone. Cheap enough to fold into any nearby landing task.

## Scope Estimate

**Small** — two CSS/class tweaks in one component, no logic:

1. **Center the pill** — the benefit pill is a shrink-to-content `inline-flex`.
   Options: wrap it in a `flex justify-center` container, or give the pill
   `mx-auto` / make it `flex w-full justify-center` (full-width, centered text).
   Decide during planning whether "centered" means *the pill centered in the
   card* (mx-auto on the hugging pill — most likely intent) vs *full-width pill
   with centered text*.
2. **Desaturate the icon** — add `[filter:saturate(.5)]` (Tailwind arbitrary
   property) to the badge `<span>`, or reduce the saturation of the
   `gradient-brand` colors used for its background. Prefer the scoped
   `filter:saturate(.5)` so other `gradient-brand` usages are unaffected.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/landing/features-section.tsx:59` | Benefit pill: `<div className="mt-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-secondary ...">{feature.benefit}</div>` — the `inline-flex` is why it shrink-wraps flush-left |
| `components/landing/features-section.tsx:54` | Corner icon badge: `<span className="absolute top-3 right-3 inline-flex size-10 ... rounded-full gradient-brand text-white ...">` — add `[filter:saturate(.5)]` here |
| `app/globals.css` (`.gradient-brand`) | The brand gradient the badge uses; only touch if you choose to desaturate the gradient globally instead of filtering the one badge (not recommended — it's shared) |

## Notes

- The pill and icon are shared by every feature card (`FeatureCard`), so both
  tweaks apply to all cards at once — good (consistent), just confirm no card
  variant needs different treatment.
- `filter: saturate(0.5)` keeps the hue/lightness and only cuts chroma in half —
  matches "lose saturation by 50%" literally.
