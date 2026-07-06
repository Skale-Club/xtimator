---
phase: quick-260704-r2q
plan: 01
subsystem: ui
tags: [wcag, contrast, accessibility, brand-color, react-pdf, vitest]

# Dependency graph
requires:
  - phase: existing
    provides: "lib/color.ts hexToHslTriplet + SYSTEM_COLORS + the three estimate renderers"
provides:
  - "Pure WCAG contrast utility lib/color/contrast.ts (hexToRgb, relativeLuminance, contrastRatio, readableTextColor, ensureReadableOnWhite)"
  - "lib/color converted to a folder module (index.ts re-exports hexToHslTriplet + contrast utils), preserving the @/lib/color import path"
  - "Render-time brand-color contrast correction across PDF, editor document, and client share views"
affects: [estimate-rendering, brand-theming, pdf-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render-time brand-color adaptation: brandText (ensureReadableOnWhite) for text-on-white, brandOnFill (readableTextColor) for foreground over a brand fill; stored brand_primary_color never mutated"
    - "Windows-safe folder-module conversion: file lib/color.ts -> lib/color/index.ts + sibling contrast.ts (a file and same-named directory cannot coexist on Windows)"

key-files:
  created:
    - lib/color/contrast.ts
    - lib/color/index.ts
    - tests/unit/color-contrast.test.ts
  modified:
    - components/pdf/estimate-pdf.tsx
    - components/workspace/estimate/estimate-document.tsx
    - components/share/estimate-view.tsx

key-decisions:
  - "Lightness-only darkening (hue + saturation preserved) to keep brand identity while reaching 4.5:1 on white"
  - "Invalid/missing color input never throws — safe defaults: hexToRgb->null, readableTextColor/ensureReadableOnWhite->'#000000'"
  - "Inline color overrides win over StyleSheet/Tailwind text-white; StyleSheet literals left untouched"

patterns-established:
  - "brandText / brandOnFill derived once per renderer right after brandColor, threaded to sub-components as sibling props"

requirements-completed: [R2Q-01]

# Metrics
duration: 8min
completed: 2026-07-04
---

# Phase quick-260704-r2q Plan 01: Auto-correct Brand Color Contrast Summary

**Render-time WCAG 4.5:1 contrast correction for the brand color across the PDF, editor, and share estimate renderers via a new pure lib/color/contrast.ts utility — light brand colors darken (hue preserved) as text on white and flip to black on brand-filled bars, so nothing disappears; the stored brand_primary_color is never mutated.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-04T23:40:00Z
- **Completed:** 2026-07-04T23:48:00Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 3

## Accomplishments
- New pure module `lib/color/contrast.ts` with five WCAG functions (`hexToRgb`, `relativeLuminance`, `contrastRatio`, `readableTextColor`, `ensureReadableOnWhite`), 22 unit tests green.
- Converted `lib/color.ts` into a folder module (`lib/color/index.ts`) that re-exports `hexToHslTriplet` verbatim plus the contrast utils — all 4 existing `@/lib/color` importers keep resolving.
- Wired `brandText` (text-on-white) and `brandOnFill` (foreground-over-fill) into all three renderers: PDF header/title/totals/terms + section-header fill; editor big-title bar, section bars, company name, grand total, add-section chip; share-view terms/invoice/signature icons + invoice Pay button.
- A light brand color now renders as legible dark text on white and legible black on brand fills; a dark brand color is returned unchanged with white text preserved on its fills.

## Task Commits

Each task was committed atomically:

1. **Task 1: WCAG contrast utility + convert lib/color to folder module + tests** - `379c25de` (feat)
2. **Task 2: Wire contrast correction into the PDF renderer** - `b5e2b080` (feat)
3. **Task 3: Wire contrast correction into editor document + client share views** - `42d5952b` (feat)

_Note: Task 1 was implemented as a single feat commit (pure utility + its tests + the required folder-module restructure are one atomic unit; tests were authored against the behavior spec and verified green before commit)._

## Files Created/Modified
- `lib/color/contrast.ts` - Pure WCAG contrast utilities; documents invalid-input semantics; lightness-only darkening preserves hue/saturation.
- `lib/color/index.ts` - Barrel: `hexToHslTriplet` (moved verbatim) + `export * from './contrast'`; preserves the `@/lib/color` path.
- `tests/unit/color-contrast.test.ts` - Vitest coverage for all five functions (light #FFFACD, dark #1A1A1A, system #406EF1, pure white/black, malformed input, hue preservation).
- `components/pdf/estimate-pdf.tsx` - Derives brandText/brandOnFill once; companyName/nameLink/estimateTitle/grandTotal/estimate-terms use brandText; section-header title uses brandOnFill; border + section fill background keep raw brandColor.
- `components/workspace/estimate/estimate-document.tsx` - Big title bar + section bars use brandOnFill (threaded through SortableDocumentSection -> DocumentSectionBlock); company name, grand total (via DocumentTotals brandText prop), add-section chip use brandText.
- `components/share/estimate-view.tsx` - Terms/invoice/signature icons use brandText; invoice Pay button uses brandOnFill over the fill; green sign button and SignaturePad brandColor prop untouched.

## Decisions Made
- **Lightness-only darkening:** `ensureReadableOnWhite` reduces HSL lightness in ~2% steps (hue + saturation held) until contrast >= 4.5:1 on white, preserving brand identity rather than snapping to black.
- **Never-throw semantics:** invalid/missing hex returns safe defaults (`hexToRgb`->null; `contrastRatio` treats the bad side as black; `readableTextColor`/`ensureReadableOnWhite`->'#000000'); documented in a top-of-file comment.
- **Inline overrides, no StyleSheet edits:** brand-on-fill foregrounds are applied inline so the PDF `sectionTitle` '#ffffff' literal and Tailwind `text-white` classes stay in place (inline wins); no stored color is written.
- **DocumentTotals prop cleanup:** since the grand-total was its only `brandColor` use and it now uses `brandText`, the now-unused `brandColor` prop was dropped from `DocumentTotals` (its call site and type updated) to keep the component clean; `DocumentSectionBlock` keeps `brandColor` because the section-header background still uses it.

## Deviations from Plan
None - plan executed exactly as written. (The only refinement beyond the literal wording was removing the now-unused `brandColor` prop from `DocumentTotals` rather than leaving a dead prop; this is a minor cleanup consistent with the plan's intent, not a behavior change.)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Verification
- `npx vitest run tests/unit/color-contrast.test.ts tests/unit/color.test.ts` -> 22 tests green (new contrast suite + preserved hexToHslTriplet suite).
- `npx tsc --noEmit` -> 17 errors total = the known pre-existing baseline (billing/whatsapp/inngest test files); 0 errors in any file this plan touched.
- Grep confirms `ensureReadableOnWhite` + `readableTextColor` appear in all three renderers.
- `lib/color.ts` removed; `@/lib/color` still resolves via the folder index for its 4 existing importers.
- No StyleSheet color literal changed; stored `brand_primary_color` never written.

## Next Phase Readiness
- Contrast utility is reusable anywhere a stored brand color is rendered (future email templates, dashboards) via `@/lib/color/contrast`.
- No blockers.

## Self-Check: PASSED

- FOUND: lib/color/contrast.ts, lib/color/index.ts, tests/unit/color-contrast.test.ts, 260704-r2q-SUMMARY.md
- REMOVED: lib/color.ts (folder module now owns the @/lib/color path)
- COMMITS FOUND: 379c25de, b5e2b080, 42d5952b

---
*Phase: quick-260704-r2q*
*Completed: 2026-07-04*
