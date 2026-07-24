---
phase: quick-260723-fx1
status: complete
date: 2026-07-23
commit: 3235aea9
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

## Follow-up commit (`2f912c93`)

Re-verifying the full-width work after moving on to other tasks (user:
"dont forgert about the full width talk") surfaced a gap: the primary
"Start" button had been extended to `w-full lg:w-auto` (item 2 above), but
the secondary "See Demo" button right next to it in the same row was never
given the matching update — it was still `w-full sm:w-fit`, meaning from
640px onward it would shrink to fit-content while Start stayed full-width.
Fixed to `w-full lg:w-fit`, matching Start exactly. Verified the same way
(tsc clean, SSR HTML confirms the class, tests 4/5 same flaky unrelated
test).

## Second follow-up commit (`3235aea9`) — the actual root cause

The user reported still not seeing full-width buttons after both prior
fixes and asked to "analyze and calculate" rather than re-guess. The
Browser pane cannot run layout for this route — confirmed for the 4th
time this session via `getBoundingClientRect()` returning `0x0` for
every hero element despite `document.readyState: "complete"`, a fully
populated DOM (25 body children), and correct `getComputedStyle` values
— so pixel measurement from that tool was a dead end. Instead hand-traced
the CSS cascade at a 390px viewport, ancestor by ancestor: outer
container 390-48(px-6)=342px → `.hero-content` gets 342px via default
flex `align-items: normal` (≈stretch) behavior → `.hero-left` is
explicitly `w-full` of that → 342px, definite.

The actual bug: the CTA button row (direct parent of both buttons) sits
inside `.hero-left`, which sets `items-center` (not stretch) — so any
child WITHOUT its own explicit width shrink-wraps to content instead of
filling the parent. The row itself never had `w-full`, so it shrank to
fit its buttons' natural size, and the buttons' `width: 100%` (verified
correct via `getComputedStyle`) resolved against that already-shrunk box
— 100% of a content-sized box does nothing visually. Added `w-full
lg:w-auto` to the row itself. Confirmed via a live user screenshot after
this landed: both buttons now visibly span full width, edge to edge.

Also verified (same cascade-tracing method) that the H1 was NOT affected
by this bug — it's a direct child of `.hero-left`, which already has an
explicit `w-full` with no shrink-wrapping layer in between, so its box
was already correctly full-width. The user then asked about the title
"needing to be full width too"; explained that the box is confirmed
full-width and the visual gap around shorter lines is inherent to large
centered text (each line is only as wide as its own characters, unlike a
solid-color button that visibly fills its whole box) — not the same
class of bug, and asked what specifically they want if this isn't it
(bigger font, left-aligned, etc.).

## Notes

Local commits only, not pushed.
