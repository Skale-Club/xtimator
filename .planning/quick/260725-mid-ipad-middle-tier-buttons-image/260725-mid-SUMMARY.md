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

## Follow-up: dropped the pointer:coarse gate

User tests iPad widths by **resizing the desktop browser** (pointer: fine), so
the original `pointer: coarse` gate meant the rule never fired for them. Changed
the media query to width-only `@media (min-width: 820px) and (max-width: 1023px)`
so it applies to any 820-1023px viewport (real iPads AND resized windows). Frozen
boundaries (≤819, ≥1024) unchanged.

### Discovered: dev server serving stale globals.css
While verifying, found the running dev server (9633) serves the OLD rule
(`… orientation: portrait … pointer: coarse`) even after a force-reload, while
the on-disk file is the new width-only version. So the server's global-CSS HMR is
stuck — this is why CSS-only changes (this tier + earlier iPad/tablet CSS)
haven't shown for the user, while .tsx/HMR changes did. Fix = restart the dev
server (`npm run dev` clears `.next`).

## Follow-up (mid2): buttons stacked, text 2/3, image up 20px

User refined the middle tier (the earlier `touch app/globals.css` trick was used
to force the stuck CSS watcher to recompile so these could be verified live):
- CTA buttons → **stacked** (`flex-direction: column`), full-width of the text box
  (replaces the earlier side-by-side).
- Text box (`.hero-left`) → **~2/3 of the screen** (`width: 66.6667%`), anchored
  **left** (`align-self: flex-start`), instead of full width.
- Image → kept 70% + right, and **nudged up 20px** (`margin-top: -20px`).
Verified live at 900px: hero-left 568px (66.67% of the 852px column)/flex-start,
button row flex-direction column, image 596px/flex-end/margin-top -20px.

Correction (user: "not the buttons being 2/3"): only the TEXT box is 2/3 — the
buttons must be COMPACT, not 2/3-wide. Added: button row `align-items:flex-start`
+ `> * { width:auto }` + `button,a { width:auto }` so the buttons (and the
.cta-glow wrapper) shrink to their own min-width (~194/175), stacked + left,
inside the 2/3 box. Verified: button width computes `auto`, row align-items
`flex-start`.

### Dev-server CSS-HMR is intermittently stuck
Confirmed the running server serves stale globals.css after in-place edits; a
`touch app/globals.css` reliably pokes the watcher into recompiling (verified the
served @media condition flips to the fresh one). Real fix if it recurs: restart
`npm run dev`. Not a service-worker cache (no SW controlling this view).

## Notes
- Local commit only, not pushed.
