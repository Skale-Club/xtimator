---
phase: quick-260723-bg1
status: complete
date: 2026-07-23
commit: e6f5f0e8
files_modified:
  - app/admin/landing/actions.ts
  - app/admin/landing/landing-editor.tsx
  - app/manifest.ts
  - components/landing/hero-section.tsx
  - components/landing/landing-page.tsx
  - lib/platform-config.ts
  - lib/schemas/admin.ts
---

# Summary: Hero background image/video (separate from hero image)

## What changed

User asked for a new admin field distinct from the existing hero image:
a background image OR video, with video support added. Confirmed via
AskUserQuestion before implementing: full-bleed section backdrop (not
just replacing the decorative mesh — everything including the existing
hero image sits on top), video autoplay+muted+looping, sensible size
defaults (picked 8MB for image, 20MB for video, MP4/WebM).

- **Data model** (`lib/platform-config.ts`): `heroBackgroundType`
  (`'none'|'image'|'video'`, required — matches the existing
  `howItWorksAnimations` pattern, since zod's `.optional().default()`
  resolves to a *required* field in the inferred TypeScript type, not
  optional as the schema syntax might suggest), `heroBackgroundImageUrl`,
  `heroBackgroundPosition` (optional, no default), `heroBackgroundVideoUrl`.
  Both URLs persist independently of which type is active, so toggling
  the admin selector back and forth doesn't lose an uploaded asset.
- **Schema** (`lib/schemas/admin.ts`): `heroBackgroundImageFileSchema`
  (8MB — bigger than the other hero images since a full-bleed backdrop
  needs to look good stretched across the whole section width) and
  `heroBackgroundVideoFileSchema` (20MB, MP4/WebM only).
- **Server action** (`app/admin/landing/actions.ts`): background image
  converts to WebP via the shared `convertImageToWebp` helper (same
  pipeline as every other landing image this session). Background video
  is NOT converted — there's no video transcoding step in this stack
  (would need ffmpeg) — validated and stored as-is.
- **Admin UI** (`landing-editor.tsx`): a None/Image/Video type selector;
  the image case reuses `HeroImageUploader` + `ImagePositionEditor` (cover
  fit, 16:9 — a full-bleed backdrop, unlike the foreground hero image
  which uses contain/1:1); the video case is a simple upload + `<video>`
  preview with client-side size/format validation before the file ever
  reaches the server action.
- **Public render** (`hero-section.tsx`): the background renders as the
  section's bottom-most layer, REPLACING the decorative gradient/dot mesh
  when active — a judgment call, since layering an abstract dot pattern
  over a real photo/video would look wrong. `'none'` (the default, and
  what every existing landing_content row already has) keeps the exact
  current decoration. Added a `bg-black/40` scrim over both image and
  video backgrounds — not explicitly requested, but necessary for text
  contrast against an arbitrary admin-uploaded photo/video (white text
  could otherwise become illegible against a bright image). Video uses
  `playsInline` — required for iOS Safari, without it autoplay is blocked
  entirely and playback would force fullscreen instead of acting as a
  background.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- `tests/unit/components/landing-page.test.tsx` +
  `tests/unit/landing-actions.test.ts` — 12/12.
- Live SSR HTML confirms a clean render with the default (`bgType: 'none'`)
  row every existing landing_content row currently has — no visual change
  for anyone until an admin explicitly opts into a background.

## Notes

- The `bg-black/40` scrim is a design judgment call for text legibility,
  not something explicitly requested — worth flagging to the user in case
  they want it lighter/removed once they've uploaded a real background
  and can see it.
- Local commit only, not pushed.
