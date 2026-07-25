---
phase: quick-260724-spc
status: complete
date: 2026-07-24
harvests: SEED-046
files_modified:
  - components/landing/how-it-works-section.tsx
---

# Summary: Harmonize mobile/tablet section spacing (harvest SEED-046)

The uneven phone/tablet rhythm (and the "no gap between the trust bar and
how-it-works") traced to a single outlier: **how-it-works used `py-6 sm:py-8`
while features and final-cta use `py-16`**. On phone/tablet (where these
sections are natural height, not `100dvh`), that made how-it-works cramped and
inconsistent with its neighbours.

## Change
- `how-it-works` section: `py-6 sm:py-8 lg:py-10` → **`py-16 lg:py-10`**.
  Now 64px vertical padding on phone/tablet (matching features/final-cta),
  keeping the tuned `lg:py-10` for the desktop centered-in-100dvh layout.

## Verification (computed style, live landing, 390px)
- how-it-works pt/pb = **64px**, features = 64px, final-cta = 64px → consistent ✓

## Recommendation call
- Left the deeper structural item alone: below `lg`, sections turn `100dvh` at
  different widths (how-it-works ≥720, features ≥1024, final-cta always), which
  can still feel staggered on tablet. Reworking the snap-scroll `min-h-[100dvh]`
  wrappers is larger/riskier — flagged as a possible follow-up, not done here.

## Notes
- Local commit only, not pushed.
