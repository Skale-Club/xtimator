---
phase: quick-260724-fcp
status: complete
date: 2026-07-24
harvests: SEED-045
files_modified:
  - components/landing/features-section.tsx
---

# Summary: Feature card — center benefit pill + desaturate corner icon (harvest SEED-045)

Two class-only tweaks on the landing feature cards (`FeatureCard`):

1. **Benefit pill centered** — the bottom pill was `inline-flex` (shrink-wrapped
   flush-left). Changed to `flex w-fit mx-auto` so it's a fit-content block
   centered horizontally in the card (works whether the card is block or
   flex-col). `mt-auto` kept for bottom placement.
2. **Corner icon desaturated 50%** — added `[filter:saturate(.5)]` to the
   gradient-brand icon badge span.

## Verification (computed style, live landing page)
- Benefit pill: `display:flex`, `width:fit-content`, `margin-left/right:auto`
  → centered ✓
- Icon badge: `filter: saturate(0.5)` ✓

## Notes
- Applies to every feature card (shared `FeatureCard`). Local commit only.
