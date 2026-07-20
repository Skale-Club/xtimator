---
phase: quick-260718-n7d
status: complete
date: 2026-07-18
commit: 74120634
files_modified:
  - components/landing/hero-section.tsx
---

# Summary: Hero desktop 2-row title + smaller 2-row subheadline

## What changed

Desktop-only (≥1280px / `xl:`, where the iPad media queries in globals.css stop applying) hero typography, per user screenshots:

1. **H1 in 2 rows** — "Professional estimates" / "in seconds." (was 3 rows). The hardcoded break after word 1 became `<br className="xl:hidden" />`, and words 1-2 are wrapped in `<span className="xl:whitespace-nowrap">` so the pair can't silently re-wrap to 3 rows if the font metrics run wide (measured 527px inside the 580px box at 56px — fits). The existing `hidden sm:block` break before the remainder supplies the single desktop break.
2. **Subheadline 10% smaller** — `xl:text-[20px]` → `xl:text-[18px]`.
3. **Subheadline in 2 rows** (was 3) — the two tablet breaks gained `xl:hidden`; a new `hidden xl:block` break lands before "and branded" (via `indexOf`, guarded: if the DB text lacks that anchor or it's out of order, xl falls back to natural wrap; tablet/mobile breaks unaffected). Desktop rows: "Record a site walkthrough, add photos, pricing," / "and branded estimate before you leave the driveway."

Mobile (<640px) and tablet (640-1279px) markup resolves to exactly the pre-change classes — no visual change below 1280px.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- `npx vitest run tests/unit/components/landing-page.test.tsx` — 5/5 green (assertions are textContent-based; break/class changes don't affect them)
- Live layout measurement at 1390×800 via dev server DOM: h1 renders 2 line boxes ("Professional estimates" 527px / "in seconds." 262px), p renders 2 line boxes at computed 18px (373px / 421px)
- Note: the Browser-pane preview could not paint the page — the app's CSP blocks `eval`, which Next dev/Turbopack chunks need, so React's streaming swap (`<div hidden id="S:0">`) never executes and screenshots time out. Verification was done by removing the `hidden` attribute in-page and measuring real client rects. Worth knowing for future landing-page visual checks in dev.
