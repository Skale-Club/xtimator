---
phase: quick-260718-h4l
status: complete
date: 2026-07-18
commit: 78cfbe3c
files_modified:
  - components/landing/how-it-works-section.tsx
  - app/globals.css
---

# Summary: How-it-works cards keep halo only, drop blue SVG line art

## What changed

- **how-it-works-section.tsx**: deleted the three decorative card backgrounds — `SoundWaveBackground` (52 animated waveform bars + the `WAVEFORM_BARS` precompute, card 1 "Record audio"), `SpeechBubbleBackground` (bubble outline + 6 typing dots, card 2), and `CameraBackground` (camera outline/lens/flash + its corner glow, card 3). Replaced with a single static `HaloBackground`: a centered primary radial-gradient div (`ellipse 62% 55% at 50% 45%`, 0.35 → 0.12 → transparent) rendered unconditionally behind every card image. `StepCard` lost its `showWave`/`showPhotos`/`showCursor` props; both call sites (desktop 3-col grid and phone Ticker) updated.
- **globals.css**: removed the now-orphaned keyframes `bar-pulse`, `cam-flash-unit`, `bubble-dot-1..6` (lines 5-45; used only by the deleted components).

Per user request with screenshot of the Record audio card: "remove blue lines from cards, i just need the halo". Static halo is inherently reduced-motion-safe (no animation left in the image slots).

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- `tests/unit/components/landing-page.test.tsx` — 5/5 (only pins step titles, not the art)
- Rendered HTML from the live dev server (localhost:9633, same worktree, hot-reloaded): 0 matches for `bar-pulse` / camera-outline path / `bubble-dot` / the 400×150 waveform viewBox; 9 matches for the halo gradient = 3 grid cards + 6 ticker cards (3 steps × 2 loop duplication). Screenshot verification skipped per the n7d gotcha (dev CSP blocks Turbopack eval → landing page can't paint in the Browser pane).

## Environment note

`.claude/launch.json` (gitignored) `autoPort` flipped `false` → `true` so this session's preview server could coexist with another chat's server on 9633. Second `next dev` on the shared `.next` dir still dies, so cross-checking via the running server's HTML was used instead.
