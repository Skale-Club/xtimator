---
phase: quick-260718-q2v
status: complete
date: 2026-07-18
commit: acd676c5
files_modified:
  - components/landing/hero-section.tsx
---

# Summary: Hero CTA buttons 15% bigger on desktop

## What changed

Desktop-only (`xl:` ≥1280px, consistent with quick-260718-n7d) 15% scale-up of the hero "Start" and "See Demo" buttons in components/landing/hero-section.tsx:

- Start: `xl:h-[46px] xl:min-w-[184px] xl:px-[18px] xl:text-base` on top of Button size=default (40px/14px/min-w-40); ArrowRight icon `xl:size-[18px]` (was size-4)
- See Demo: `xl:h-[46px] xl:min-w-[166px] xl:px-[18px] xl:text-base` on top of its explicit `h-10 text-sm sm:min-w-36 sm:px-4`

Math: 40→46px height, 14→16px font, 160→184px / 144→166px min-widths, 16→18px padding/icon. Below 1280px nothing changes (the globals.css iPad media queries own 640-1279px button sizing with !important; mobile keeps Tailwind defaults). The bottom-CTA section's own Start/See Demo pair (Button size=lg, 56px) is untouched.

Known cosmetic nit: on Start, the cva `has-[>svg]:px-3` (a :has() selector, higher specificity) beats `xl:px-[18px]`, so computed padding stays 12px — irrelevant visually because min-width 184px governs the rendered box.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- Live DOM measurement at 1390×800: hero Start 184×46px @16px, See Demo 166×46px @16px (bottom-CTA pair unchanged at size=lg 56px; both pairs disambiguated by section + data-size)
- `tests/unit/components/landing-page.test.tsx`: 4/5 green. The 1 failure ("opens the AuthDialog in login mode when ?auth=login", a lazy-load timing waitFor) is PRE-EXISTING/environmental, NOT from this change — proven by `git stash push` of the hero edit and re-running: it fails identically against HEAD. It had passed at 09:23 the same morning; a concurrent session's in-flight price-book/trash work plus machine load coincide with the flake window. Hero rendering tests all pass.
