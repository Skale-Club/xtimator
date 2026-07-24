---
phase: quick-260723-a7c
status: complete
date: 2026-07-23
commit: c9aa1a96
files_modified:
  - components/landing/how-it-works-section.tsx
  - app/globals.css
  - lib/platform-config.ts
  - lib/schemas/admin.ts
  - app/admin/landing/landing-editor.tsx
  - components/landing/landing-page.tsx
  - app/manifest.ts
---

# Summary: Restore How-it-works card animations + admin on/off toggle

## Context

The animated card backgrounds were removed on 2026-07-18 in `78cfbe3c`
("keep halo only, drop blue SVG line art") — that removal was already in BOTH
local main and origin/main, so the fast-forward pull the user asked for did
NOT delete them (they were long gone). User confirmed "restore all three", then
asked for an admin toggle to enable/disable them.

## What changed

- **how-it-works-section.tsx**: re-added `WAVEFORM_BARS` + `SoundWaveBackground`
  (card 1 "Record audio"), `SpeechBubbleBackground` (card 2, 6 typing dots),
  `CameraBackground` (card 3 "Upload photos", outline/lens/flash). `HaloBackground`
  is KEPT and rendered unconditionally; the animated SVG layers on top of the halo
  but still behind the z-10 image. `StepCard` regained `showWave`/`showCursor`/
  `showPhotos`. `HowItWorksSection` gained `animationsEnabled?: boolean = true`;
  both call sites (desktop grid + phone Ticker) gate each show* flag with it.
- **globals.css**: re-added keyframes `bar-pulse`, `cam-flash-unit`, `bubble-dot-1..6`
  (between `@source not "../.planning";` and the Photo icon-swap block).
- **platform-config.ts**: `howItWorksAnimations: boolean` added to `LandingContent`,
  to `DEFAULT_LANDING_CONTENT` (`true`), and backfilled `?? true` in `getBranding`
  (mirrors the heroImageUrl backfill) so rows saved before the field default to on.
- **schemas/admin.ts**: `landingContentSchema` gained
  `howItWorksAnimations: z.boolean().optional().default(true)`.
- **landing-editor.tsx**: a Switch `FormField` ("Card background animations") at the
  top of the How It Works tab, bound to `howItWorksAnimations`. Persists through the
  existing `saveLandingContent` (`...parsed.data`) — no action change, no migration.
- **landing-page.tsx**: passes `animationsEnabled={content.howItWorksAnimations}`.
- **manifest.ts**: static-fallback `landingContent` literal gained
  `howItWorksAnimations: true` (required by the type).

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- `tests/unit/components/landing-page.test.tsx` + `tests/unit/landing-actions.test.ts`
  — 12/12.
- Live dev server (localhost:9633) SSR HTML: `bar-pulse` ×156 (52 bars × 3 rendered
  waveform cards), `bubble-dot` ×18 (6 × 3), `cam-flash-unit` ×3, halo gradient ×9
  — all three animations render over the halo when the toggle is on.

## Notes

- Toggle default is ON, so existing installs get the animations back on first load.
- Screenshot verification via the Browser pane skipped — dev CSP blocks Turbopack
  eval so the landing page can't paint in-pane (documented n7d gotcha); verified via
  the running server's SSR HTML instead.
- Commit is LOCAL only (not pushed), per the quick-task convention.
