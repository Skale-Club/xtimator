---
phase: quick-260723-fx1
status: complete
date: 2026-07-23
commit: 73d43f16
files_modified:
  - components/landing/hero-section.tsx
---

# Summary: Hero desktop-image regression + full-width scope fixes

Note: the commit itself (`73d43f16`) used the `quick-260723-h3v` tag by
mistake — this fix batch is actually a follow-up to `quick-260723-m2q`
(the mobile/iPad stacking work), not `h3v` (the proportion fix). Recorded
correctly here under its own slug.

## What changed

Three issues surfaced via live screenshots after the m2q hero
restructuring landed:

1. **Critical regression: desktop hero image had disappeared entirely.**
   The original `.hero-image` container relied on `bottom: 0` persisting
   from its `sm:` breakpoint all the way through `lg:` (set once, never
   overridden by a later breakpoint) to give the absolutely-positioned box
   a resolvable height. When m2q rewrote that container's classes for the
   new stacked/in-flow mobile layout, the entire class string was
   replaced and an `lg:bottom-0` equivalent was never re-added — leaving
   the desktop box with `top` set but no `bottom`, `height: auto`, and a
   percentage-height child (`h-full`) — a circular sizing dependency that
   collapses to zero. Restored as `lg:bottom-0`.
2. **Full-width scope was too narrow.** Buttons were only full-width
   below 640px (`sm:w-auto`/`sm:w-fit` reverted them at tablet widths),
   but per the user's own testing, "mobile" extends further than that
   breakpoint — confirmed explicitly ("for ipad too"). Changed both
   buttons' width reversion from `sm:` to `lg:`, so full-width now covers
   the whole stacked range (phone + iPad); the H1 was already
   unconditionally full-width, no change needed there. Also flattened the
   hero's own horizontal page padding (removed `sm:px-8`, which was
   *increasing* side padding right when more usable width was wanted) so
   padding stays flat through the stacked range and only grows at true
   desktop (`lg:px-10`, unchanged).
3. **No-image path missing center alignment.** The CTA button row (when
   `heroImageUrl` is null) was missing `items-center` — the row itself
   was centered as a block by its parent, but the buttons within it
   weren't necessarily centered relative to each other. Added
   `items-center`, matching the has-image path's earlier fix.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- `tests/unit/components/landing-page.test.tsx` — 4/5 (the same
  pre-existing flaky AuthDialog timing test seen throughout this session,
  unrelated).
- Live SSR HTML re-fetched and confirmed `lg:bottom-0` present in the
  compiled output, no render/runtime errors.

## Notes

Local commit only, not pushed.
