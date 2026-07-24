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

## Follow-up commit (`2c10bffa`) — the actual "grouped in center" fix

After the width work landed, the user reported tablet views "still look all
grouped in the center instead of full width." Diagnosed live via computed style
at 820px: `.hero-left`, `h1`, and `p` were all already `width: 100%` /
`max-width: none` (the box **was** full-width) but every one was
`text-align: center` with `align-items: center`. Centered text clusters in the
middle of a full-width box with equal side gaps regardless of box width — so the
full-width change was visually invisible. The real lever was **alignment, not
width**.

Fix: left-align the stacked hero on tablet+ (`sm:`) to match the desktop
left-aligned look.
- `.hero-left`: added `sm:items-start sm:text-left` (phone `<640` stays
  centered — only tablet was flagged; desktop `lg:` unchanged).
- Badge wrapper: `justify-center lg:justify-start` → `justify-center
  sm:justify-start`.
- The 3 real-tablet (`pointer:coarse`) CSS blocks set only `justify-content`
  (the vertical/main axis for this flex-column) and `align-items` on
  `.hero-content` (moot — `.hero-left` is `width:100%`); none force
  `text-align` or `.hero-left`'s `align-items`, so real iPads inherit the
  left-align from the classes automatically — no CSS change needed.

Verified (computed style, live server): at 820px `.hero-left`/`h1`/`p` resolve
`text-align: left`, `align-items: flex-start`; at 390px they stay `center`.
tsc clean. Local commit, not pushed.

## Second follow-up commit (`2dd41540`) — natural wrap instead of a forced spot

User observation: the title/text "should only go to second row when the first
row gets filled up … solve the issue with the words being accumulated at a
certain spot." Correct — the forced `<br>` from the first commit always broke at
the *same word* regardless of width, so on wider screens row 1 sat half-empty
with the rest stranded on row 2.

Fix: remove the forced breaks below lg so the browser wraps naturally (greedy —
fills each row, wraps only when the row is genuinely full).
- Title: after-word `<br>` → `hidden lg:block` (lg-only). Below lg no forced
  break → natural wrap; desktop keeps its deliberate "Professional estimates" /
  "in seconds." split (lg break + `lg:whitespace-nowrap` span) byte-identical.
- Subheadline: removed the two forced mobile/tablet `<br>`s
  (`block sm:hidden md:block lg:hidden`); only the lg desktop 2-row split
  remains. Below lg it wraps naturally.

This also supersedes the earlier hard "exactly two rows everywhere" goal — the
row count is now width-driven by design (e.g. 1 row on a wide iPad, 2 rows mid,
3 on the narrowest phone), which is what "fill row 1 first" means.

Verified: served HTML shows the title `<br>` is `hidden lg:block` and the
subheadline forced-break count is 0; a greedy-wrap simulation using the live
page's real font metrics confirms row 1 fills before wrapping at every width
(390–600px → "Professional estimates" / "in seconds."; 768–820px →
"Professional estimates in" / "seconds."; 360px → 3 rows, each filled). tsc
clean. Local commit, not pushed.

## Notes

Local commits only, not pushed. `fix` `58165f76` (two-row + width), `fix`
`2c10bffa` (tablet left-align), `fix` `2dd41540` (natural wrap); docs in
follow-up `docs` commits.
