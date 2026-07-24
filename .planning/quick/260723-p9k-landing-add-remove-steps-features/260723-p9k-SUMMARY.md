---
phase: quick-260723-p9k
status: complete
date: 2026-07-23
commit: ce676699
files_modified:
  - lib/schemas/admin.ts
  - app/admin/landing/actions.ts
  - app/admin/landing/landing-editor.tsx
  - components/landing/how-it-works-section.tsx
  - components/landing/features-section.tsx
---

# Summary: Add/remove buttons for How It Works steps and Features cards

## What changed

User showed screenshots of the numbered "1 2 3" / "1 2 3 4" selector tabs
on /admin/landing and asked for a "+" beside the numbers to add more.

Investigated first: Features already allowed 1-6 items in the schema (just
needed the UI). How It Works was hard-locked to exactly 3
(`howItWorksSteps: z.array(...).length(3)`), and each of the 3 cards has a
*specific* matching animation tied to its exact copy (waveform for "Record
audio", typing dots for "Write it down", camera flash for "Upload photos")
— not a generic per-item effect. Asked the user how a 4th+ step should
look; confirmed: allow growth, extras get the halo-only background (no
animation exists for them yet).

- `lib/schemas/admin.ts`: `howItWorksSteps` relaxed from `.length(3)` to
  `.min(3).max(6)`.
- `app/admin/landing/actions.ts`: the step-image-upload loop was hardcoded
  `for (let i = 0; i < 3; i++)` — fixed to iterate the actual array length
  (mirrors the features loop, which was already dynamic).
- `how-it-works-section.tsx` / `features-section.tsx`: each has a mobile
  `Ticker` with a hardcoded `halfWidth` sized for the original fixed count
  (888 = 3×296 for steps, 1216 = 4×304 for features) — the seamless-loop
  scroll math breaks visibly (a jump/glitch) if the real item count no
  longer matches. Both now compute `halfWidth` from `steps.length` /
  `features.length`.
- `landing-editor.tsx`: `handleAddStep`/`handleRemoveStep`/
  `handleAddFeature`/`handleRemoveFeature` call the existing
  `useFieldArray` append/remove (already present, just unexposed in the
  UI) and mirror the same insert/filter into the parallel
  `stepImages`/`currentStepUrls` and `featureImages`/`currentFeatureUrls`
  state arrays — these track per-index upload state OUTSIDE
  react-hook-form and would desync (wrong image tied to wrong step) on
  insert/delete otherwise. Bumps the uploader remount key on every
  add/remove to avoid stale local preview state in a shifted-index
  uploader instance.
- UI: dashed "+" button after the numbered buttons (disabled at 6 on both
  tabs), destructive "Remove" button in the active item's detail panel
  header (hidden at the schema floor — 3 for steps, 1 for features).

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean.
- `tests/unit/components/landing-page.test.tsx` + `landing-actions.test.ts`
  — 12/12.
- Live dev server: `/admin/landing` correctly 307-redirects unauthenticated
  requests with no server error (confirms the route compiles — full
  interactive verification blocked by the same documented dev-CSP/
  Turbopack-eval limitation noted in this session's other landing-page
  SUMMARYs). Public `/` SSR HTML re-checked after the ticker-width changes:
  no error markers, all 3 restored animations still present, step/feature
  titles all render.

## Notes

- Local commit only, not pushed.
