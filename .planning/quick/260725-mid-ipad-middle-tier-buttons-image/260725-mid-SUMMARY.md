---
phase: quick-260725-mid
status: complete
date: 2026-07-25
files_modified:
  - app/globals.css
---

# Summary: iPad "middle" tier (820-1023px portrait) — compact buttons + smaller right-aligned image

Added a NEW hero tier for the middle iPad widths, between the two frozen zones
the user explicitly wanted untouched.

## Scope (per user)
- 🔒 Frozen: the screenshot view (~770px) and everything smaller — untouched.
- 🔒 Frozen: ≥1024px real iPads on the desktop side-by-side layout — untouched.
- 🎯 Target: portrait iPads **820-1023px** (`pointer: coarse`) — the "in between".

## Change (globals.css)
New `@media (min-width: 820px) and (max-width: 1023px) and (orientation:
portrait) and (pointer: coarse)` block, placed AFTER the 640-1023 portrait block
so it wins for the 820-1023 overlap. It overrides ONLY buttons + image:
- **CTA buttons** → `flex-direction: row` + `width: auto` (compact, side-by-side,
  desktop-like) instead of the stacked `flex-direction: column; width: 100%`.
- **Image** → `width: 70%` (30% smaller) + `align-self: flex-end` (pinned right,
  overriding the parent's `align-items: center`); stays STACKED below the text.
Everything else (text, headline, fonts, spacing) inherits the 640-1023 block, so
the ≤819 frozen view and the ≥1024 desktop view are byte-for-byte unaffected.

## Assumptions (need user confirmation)
- **Lower boundary = 820px.** The exact screenshot width was never provided;
  820px (iPad Air / Pro-11" portrait) is safely above the ~770px screenshot so
  the frozen small view stays frozen. If the screenshot is a different width,
  it's a one-number change to the `min-width`.
- **Portrait only.** Landscape iPads in this range are uncommon (most are ≥1024 =
  desktop); the landscape coarse block was left as-is.

## Verification
- Served-CSS check: the media block compiled cleanly and is present with the
  correct rules (buttons row/auto, image flex-end/70%); page loads fine.
- NO on-device/visual check possible: the rule is `pointer: coarse` (real iPads)
  and the Browser pane reports `pointer: fine`, so it can't render this layout.
  **Needs the user's on-device (real iPad portrait, 820-1023px) verification.**

## Notes
- Local commit only, not pushed.
