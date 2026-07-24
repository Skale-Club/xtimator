---
phase: quick-260723-h3v
status: complete
date: 2026-07-23
commit: 7840d973
files_modified:
  - components/landing/hero-section.tsx
  - app/globals.css
---

# Summary: Hero breakpoint proportion fix

## What changed

User praised the hero's largest breakpoint (screenshot: big bold headline,
46px buttons, generous spacing) but said going down through breakpoints the
text/button/spacing got "unproportional."

Diagnosed by hand-computing every clamp()/breakpoint value at the actual
transition widths (640, 768, 1024px): the H1 dropped from 49.2px (base's
own top, at viewport=639) to 35.2px right at 640, then from 42px (sm's own
cap, at 767) to 34.6px right at 768 — text visibly shrinking as the
viewport GREW, at two separate spots. The subheadline dropped from 16.8px
(mobile) to 14px at 640, then jumped to 18px at 1024. Both CTA buttons sat
completely flat at their small `size="default"` value across the ENTIRE
0-1023px range, then jumped abruptly to full desktop size in one step
exactly at 1024px — the single biggest source of "unproportional," since
the headline was at least somewhat scaling via clamp() in that range while
the buttons weren't moving at all.

Fixed by replacing the fragmented per-breakpoint values with continuous
`clamp(FLOOR, SLOPE·vw, CEILING)` formulas for H1, subheadline, both
buttons (height/padding/font-size/min-width/icon-size), and the CTA gap.
Every formula was individually verified by hand:
- FLOOR equals the current 375px mobile value exactly (confirmed for all 8
  formulas) — mobile is provably unchanged.
- CEILING reaches the old `lg:` breakpoint value by 1024px (confirmed for
  all 8) — the desktop look the user said looks great is provably
  unchanged.
- Only the 640-1024px middle changes, from dip-then-jump to smooth growth.

One property breaks the "always grows" pattern by design: the "See Demo"
button's horizontal padding is 24px on mobile but only 18px on desktop
(smaller padding at the larger size — an existing intentional choice, not
something this fix should override). The bug there wasn't "flat then
jump" but "dropped too far": `sm:px-4`(16px) undershot below the eventual
18px target before correcting back up at lg. Fixed with a monotonic step
down instead (24 → `sm:px-5`(20px) → `lg:px-[18px]`), matching the intended
direction without the overshoot.

Also checked components/ui/button.tsx before computing padding for the
primary "Start" button — its `has-[>svg]:px-3` conditional means the TRUE
base padding (with the ArrowRight icon present) is 12px, not the naive
16px `px-4` default. Used 12px as that formula's floor.

Separately noticed and fixed one inconsistency in the real-touch-tablet
(`pointer: coarse`) CSS: the landscape 768-1279px block gave buttons a
40px height at 15px font, while the portrait 640-1023px block (same
`pointer: coarse` gate) pairs that same 15px font with 44px — no comment
explained the smaller value, and landscape tablets in that width tier have
at least as much room as portrait ones. Matched to the proven 44px/15px
pairing.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- `tests/unit/components/landing-page.test.tsx` — 4/5 (1 pre-existing
  flaky AuthDialog timing test, confirmed passing in isolation both
  before and after this change — unrelated, seen twice earlier in this
  session too).
- Live SSR HTML (fetched from a dev server on the repo's default port,
  reachable from this session despite the Browser pane's own preview
  server landing on a different port due to a port conflict with another
  session) confirms every new clamp() class compiled exactly as written
  in the rendered output, with no runtime/render error markers.
- Could not get interactive/visual Browser-pane confirmation (screenshot
  at multiple viewport widths) — the landing page has a known
  Turbopack-eval/CSP-related rendering limitation in this repo's dev
  environment, documented in several other quick-tasks' SUMMARY files
  this session. Relied on hand-verified math plus SSR class-name
  confirmation instead, consistent with how prior hero-section quick-tasks
  in this repo's history handled the same limitation.

## Notes

Local commit only, not pushed.
