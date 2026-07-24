---
phase: quick-260724-t2r
status: complete
date: 2026-07-24
commit: 58165f76
files_modified:
  - components/landing/hero-section.tsx
  - app/globals.css
---

# Summary: Hero title → two rows + title/text full width, every breakpoint

## User intent (clarified mid-task, twice reversed)

Follows the 260723 hero work. Request evolved live:
1. "make title and text full width in all breakpoints (phone + tablet/iPad)"
2. "title should be on two rows only"
3. Reversed the shrink-to-fit approach: **"no shrinking"**, "jus make it two
   rows" — keep the current font sizes, just force two rows.

## Root cause of the 3-row title

The three rows were NOT natural wrapping — they came from two *forced* `<br>`
elements in the H1:
- `<br className="hidden sm:block lg:hidden" />` between word0/word1 → split
  "Professional" | "estimates" across the whole 640–1023 range.
- `<br className="hidden sm:block" />` after word1 → "in seconds." on its own row.

## What changed (no font-size change anywhere)

### components/landing/hero-section.tsx
1. **H1 two-row split.** Removed the forced word0/word1 break; made the
   after-word1 break unconditional (`<br />`). Result: row1 = first two words,
   row2 = the rest, at every breakpoint. `lg:whitespace-nowrap` on the span is
   kept (desktop unchanged — it already held the pair on one line there).
   Desktop lg is effect-identical: the removed break was already `lg:hidden`
   and the after-word1 break was already shown at lg.
2. **Subheadline full width.** `sm:max-w-2xl` → `lg:max-w-2xl` — the paragraph
   box is now genuinely full-width across phone + tablet (was capped at 672px
   from 640px up); the readability cap is retained only at desktop.

### app/globals.css — 3 real-tablet (`pointer: coarse`) blocks
3. `.hero-h1 { … width: auto !important }` → `width: 100% !important` (×3). On
   real iPads the title box was shrink-wrapped to its longest line; now it's a
   genuine full-width box. (Visually subtle for centered text, but it removes
   the last `width:auto` inconsistency and satisfies "full width in all.")
4. `.hero-left p { … }` → added `width: 100%` (×3) — explicit full-width text
   on real tablets, belt-and-suspenders with the class-level change.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- `tests/unit/components/landing-page.test.tsx` — 4/5 (the same pre-existing
  flaky AuthDialog "sign in" heading timing test seen throughout the 260723
  hero work; unrelated — this change touches no auth code).
- **Live SSR HTML** (dev server on the repo's default port): H1 now renders
  `<span class="lg:whitespace-nowrap">Professional estimates</span><br/>in
  seconds.`; the forced `hidden sm:block lg:hidden` break count is **0**;
  subheadline class is `lg:max-w-2xl` (no `sm:max-w-2xl`).
- **Computed style** at 390px: subheadline `max-width: none` (confirms
  full-width below lg); H1 font resolves to 36px (unchanged).
- **Canvas text measurement** (browser's real font engine, real letter-spacing
  −0.03em) of "Professional estimates" vs. the available column at each width:

  | Viewport | Title rows |
  |----------|-----------|
  | 360, 375 (SE/mini) | 3 — line1 ≈330px vs 312–327px column (~3px short) |
  | **390 (iPhone 12–15)**, 414, 430 | **2** ✓ |
  | 600, 640, 768, 820 (large phone / iPad) | **2** ✓ |
  | 1024+ (desktop) | **2** ✓ (unchanged) |

## Known limitation / open tradeoff

Because font shrinking was explicitly ruled out, the very narrowest phones
(≤375px CSS width — iPhone SE, iPhone 13 mini, small Android) keep 3 rows:
"Professional estimates" is ~3px wider than their content column at the
unchanged font. Levers to close that last gap if wanted (none applied — out of
the stated "no shrinking" scope): trim hero side padding below `sm` from
`px-6`→`px-4` (+16px column; fixes 375px, 360px still ~2px short), or allow a
hair of font shrink only under 375px.

Real-tablet (`pointer:coarse`) full-width + 2-row behavior was verified by
source + served-CSS/HTML inspection and canvas math, not a live screenshot —
the Browser pane cannot composite frames or resolve box geometry for this route
in this environment (documented across the 260723 hero tasks;
`getClientRects()`/`offsetWidth` return 0), so computed-style + canvas
measurement is the reliable check.

## Notes

Local commits only, not pushed. `fix` commit `58165f76`; this doc in a
follow-up `docs` commit.
