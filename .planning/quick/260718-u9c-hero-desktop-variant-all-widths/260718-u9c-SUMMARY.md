---
phase: quick-260718-u9c
status: complete
date: 2026-07-18
commit: 58b9bd0d
files_modified:
  - app/globals.css
  - components/landing/hero-section.tsx
---

# Summary: Uniform hero on ALL desktop widths (2-row text, 46px CTAs from lg)

## What changed

User: "all desktop views need to be 2 rows for title or description… make sure buttons from hero remain the same size across all desktop layouts."

The concurrent quick-260718-h9x task had already (uncommitted, same files) moved the 2-row title/subheadline/CTA-row gates xl → lg and scoped the iPad LANDSCAPE media query to `(pointer: coarse)`. This task finished the job:

- **Subheadline**: `lg:text-base xl:text-[18px]` → `lg:text-[18px]` — 18px on every desktop width ≥1024, not just ≥1280.
- **CTAs**: the 15% size bump (46px height, 16px font, 184/166px min-widths, 18px padding/icon) moved `xl:` → `lg:` — same button size across all desktop layouts.
- **globals.css**: the two PORTRAIT iPad hero blocks also got `and (pointer: coarse)` (matching h9x's landscape scoping) so portrait-shaped desktop windows can't inherit tablet styling.

Tablet impact: heights/fonts on real iPads stay forced by their media queries (`!important` / selector specificity). Only leak: `lg:min-w-[184px]/[166px]` makes CTAs ~20px wider on ≥1024 iPads — accepted, the row has room.

Approach note: a `@custom-variant desktop` (fine-pointer aware) was drafted, then removed in favor of h9x's plain `lg:` convention so the hero keeps ONE gating mechanism.

## Coordination note (important for quick-260718-h9x)

h9x's hero/globals hunks were uncommitted in the same two files when this task needed to commit. Commit **58b9bd0d** carries BOTH change sets (annotated in the commit body). When the h9x session resumes: its code is already committed here — it only needs its docs commit, referencing 58b9bd0d.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- landing-page tests 4/5 (same pre-existing `?auth=login` lazy-load flake documented in q2v/s5m) + home-cacheability 4/4
- Live DOM, fine-pointer viewport: **identical hero at 1206×800 and 1390×800** — h1 2 lines ("Professional estimates" / "in seconds.", 54.3px/56px clamp), p 2 lines @18px, Start 184×46 @16px, See Demo 166×46 @16px, both on one row (same top)
