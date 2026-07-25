---
phase: quick-260724-iset
status: complete
date: 2026-07-24
harvests: SEED-051
files_modified:
  - components/settings/settings-nav.tsx
  - components/settings/settings-layout-client.tsx
---

# Summary: Immersive phone Settings — full-width content + horizontal top-tab nav (harvest SEED-051, Option C)

Phone Settings was cramped: a fixed vertical left rail (`w-14`/`w-40`) squeezed
the content beside it. Made it immersive by reclaiming the full width on phone.

## What changed

- **`settings-nav.tsx`** — dropped `alwaysVertical`, so `SubNav` uses its
  built-in responsive mode: **horizontal scrollable pill row on phone**,
  **vertical rail on desktop** (`md+`).
- **`settings-layout-client.tsx`** — reworked from a viewport-`fixed` left rail
  + `ml-*` margin offset to an **in-flow `flex-col md:flex-row`** that mirrors
  the settings skeleton:
  - Phone (`<md`): sub-nav is a **full-width sticky horizontal strip** at the top
    (sticky `top-[56px]`, under the mobile header, with a right-edge scroll fade);
    page content spans the **full width** below it.
  - Desktop (`md+`): sub-nav is a **sticky vertical rail** (`md:w-52`, collapse →
    `md:w-14`); content is `flex-1` (grows automatically when the rail collapses —
    no margin math). Visually unchanged from before.
  - Collapse toggle is desktop-only now (the phone strip has no collapse).

This also **aligns the real layout with the long-standing settings skeleton**
(`settings-shell-skeleton` / `settings-subnav-skeleton`), which already rendered
the horizontal-mobile / vertical-desktop structure — the previous fixed-rail
client layout mismatched it.

## Recommendation call — Option C, not A

SEED-051 recommended **Option A (full-screen drill-down)**. I implemented
**Option C (full-width + top tabs)** instead: A is a routing-level redesign of a
core, **auth-gated** area that the Browser pane here cannot render/verify, so
doing it blind carried real risk of breaking settings navigation. C is the
high-value, low-risk, contained win (proven skeleton pattern). **Option A
remains a documented follow-up** for an auth-verified pass.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- Structure mirrors the existing `settings-shell-skeleton` (a known-good layout
  pattern already shipped as the loading state) → high confidence.
- No live screenshot: `/settings/*` is auth-gated and the Browser pane can't
  authenticate or composite this app. Verified via tsc + skeleton-parity.

## Notes
- Desktop settings cascade visually unchanged. Local commit only, not pushed.
