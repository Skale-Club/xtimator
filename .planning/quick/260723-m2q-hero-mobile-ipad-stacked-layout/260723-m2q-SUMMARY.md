---
phase: quick-260723-m2q
status: complete
date: 2026-07-23
commit: 9a97b373
files_modified:
  - components/landing/hero-section.tsx
  - app/globals.css
---

# Summary: Hero mobile/iPad stacked layout + size bumps

## What changed

Started from a screenshot of the desktop hero ("this looks great") with a
request to change mobile/iPad specifically: image below the text instead
of overlapping it, taller section to fit, centered text, more room for the
image. Confirmed via AskUserQuestion: image stacks below text; applies to
iPad in both orientations.

That "both orientations" answer created a real conflict: iPad Pro 12.9"
portrait is 1024px wide — exactly the desktop `lg` breakpoint. A pure
width-based row/column split can't tell that device apart from a resized
1024px-wide desktop browser window, which should stay side-by-side. Solved
by combining the width split with `pointer: coarse` — a mechanism this
file already used in 3 other places to distinguish real touch tablets from
same-width desktop windows.

### Layout restructure
- `hero-content`: row/column breakpoint moved from `sm:flex-row` (640px)
  to `lg:flex-row` (1024px) — phone AND all iPad widths now stack by
  default; only true desktop widths stay side-by-side.
- `hero-left`: full-width + centered (`items-center text-center`) below
  lg; the exact original 55%-width/left-aligned classes restored at `lg:`.
- Image container: was `absolute` at every breakpoint; now `relative
  w-full aspect-[4/3]` (in-flow) below lg, with the ORIGINAL absolute-
  positioning classes moved onto `lg:` so desktop is pixel-identical to
  before. `object-position` changed `object-bottom` → `object-center` for
  the new standalone block (bottom-anchoring was tuned for the old
  overlapping design), with `lg:object-bottom` restoring the desktop
  anchor exactly.
- Section height: removed the `sm:max-h-[520px] md:max-h-[620px]` caps
  (too short for a stacked image-below-text layout); `lg:max-h-[520px]`
  unchanged.
- Removed several `self-start`/`justify-start` overrides on the pill and
  CTA buttons that would have fought the new parent-level centering below
  lg — each got an `lg:` counterpart restoring the original left-aligned
  desktop look exactly.

### Real-tablet CSS (globals.css)
- The 640-1023 portrait `pointer:coarse` block already gets the stacked
  layout for free (entirely below 1024) — just removed its now-conflicting
  max-height and flipped `align-items` to center.
- The 1024-1279 portrait and 768-1279 landscape `pointer:coarse` blocks
  reach ABOVE 1024px, so without an override they'd inherit the new `lg:`
  desktop layout — added `!important` overrides (`flex-direction: column`,
  full-width `.hero-left`, `.hero-image` forced to `position: static` +
  `aspect-ratio`) so real iPads in this tier stack too, while a same-width
  desktop browser window (gated out by `pointer: coarse`) stays side-by-side.
  Removed their max-height caps for the same reason as block 1.

### Sizing iterations (from a live screenshot mid-implementation)
The user sent a screenshot showing the title wrapping to 3 rows and asked,
across several rapid messages, for:
1. Mobile title ~20% bigger, occupying fewer rows, full width.
2. Both CTA buttons full width on true mobile.
3. (Final) "text and buttons need to be 20 percent bigger on mobile and
   tablet" — expanding the +20% beyond just the title.

Implemented as:
- H1 base (mobile) clamp scaled ~20% (`clamp(29,7.7vw,56)` →
  `clamp(35,9.24vw,67)`), `max-w-2xl` removed (full width), and the
  `<br>` forcing "word1 / word2" onto separate lines was scoped to only
  show at sm+ (was showing at all sub-lg widths) — at true mobile the
  headline now wraps on its own, which fits more efficiently at the wider,
  bigger-text box than the old fixed break point did.
- Subheadline, and both buttons' height/padding/font-size/min-width/
  icon-size: each mobile+tablet clamp scaled ~1.2x, with an explicit
  `lg:` value added to PIN desktop back to the exact formula from the
  immediately-prior quick-260723-h3v fix. This was necessary because h3v's
  design relied on the sub-lg clamp topping out AT the desktop value by
  1024px (so no separate `lg:` override was needed); scaling sub-lg past
  that ceiling means desktop's lower-lg-range values are now genuinely
  smaller than tablet's upper range — a real size step crossing 1024px,
  which is the correct, expected result of "tablet bigger, desktop
  unchanged," not a re-regression of h3v's dip-fix (that fix was about
  mismatched values at a SHARED boundary between adjacent same-tier
  segments; this is a deliberate tier change).
- Both CTA buttons: `w-full sm:w-auto`/`sm:w-fit` (full width on true
  mobile only).
- The secondary "See Demo" button's padding kept its monotonic-decrease
  shape from h3v (24→20→18px representing mobile→tablet→desktop) rather
  than becoming a clamp, now scaled to 29→24→18px.

### Mid-session verification issue
After this round the user said "not seeing the changes I asked, like it
being full width." Fetched fresh SSR HTML from the dev server and
confirmed `class="hero-h1 w-full ..."` was present exactly as written —
proving the code was correct and being served. Told the user this points
to either a stale cached page or a different environment (nothing pushed
yet, so a deployed site wouldn't show any of today's work), and asked
which URL/port they were viewing.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean after every edit round in
  this sequence.
- `tests/unit/components/landing-page.test.tsx` — 4/5 (the same
  pre-existing flaky AuthDialog timing test seen 3 other times this
  session, confirmed passing in isolation, unrelated).
- Live SSR HTML re-fetched and diffed against the written source after
  each major round — every class confirmed compiled exactly as written,
  no render/runtime errors at any point.
- Could NOT get interactive/visual multi-viewport confirmation (the
  Browser pane can't paint this page — a documented limitation noted in
  several other quick-tasks' SUMMARY files this session, and this
  session's own preview server additionally kept landing on random
  reassigned ports due to a port conflict with another session's server
  on the default port).

## Notes

This is the most structurally invasive of today's hero changes (full
layout paradigm shift below lg, touching 3 existing tuned CSS blocks plus
adding new override logic, on a component with an extensive prior history
of needing multiple iterative passes to get exactly right). Given no
visual verification was possible, a follow-up tuning pass after the user
actually views this on real devices/viewports should be expected — this
was flagged to the user as a real possibility, not claimed as a
guaranteed pixel-perfect result.

Local commit only, not pushed.
