---
phase: 183-pdf-parity-content
plan: 03
subsystem: pdf
tags: [react-pdf, fonts, ofl, inter, lora, design-tokens, tdd]

# Dependency graph
requires:
  - phase: 182-shared-document-engine-send-path-fix
    provides: lib/estimate/document/tokens.ts (ESTIMATE_DESIGN_TOKENS), shared PDF resolver
provides:
  - Vendored, OFL-licensed Inter (Classic) and Lora (Modern) static TTF fonts under public/fonts/
  - lib/pdf/register-fonts.ts — single Font.register call site for all 4 font faces
  - Widened EstimateDesignTokens.solidHeaderFill static per-template flag
  - Real renderToBuffer smoke test proving vendored fonts load in react-pdf/fontkit
affects: [183-04-shared-pdf-layout-components, 184-consolidated-pagination-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Font vendoring: static-weight TTFs sourced from Google's gstatic CDN (not the google/fonts GitHub source repo, which only ships variable-axis fonts) because react-pdf/fontkit requires static per-weight instances"
    - "Font.register centralized in one module (lib/pdf/register-fonts.ts), imported for side effects by every PDF template — single source of truth for family-name-to-file mapping"
    - "EstimateDesignTokens widened additively — new solidHeaderFill boolean lets future shared components read template identity without re-deciding Classic-vs-Modern styling logic"

key-files:
  created:
    - public/fonts/inter/Inter-Regular.ttf
    - public/fonts/inter/Inter-Bold.ttf
    - public/fonts/inter/OFL.txt
    - public/fonts/lora/Lora-Regular.ttf
    - public/fonts/lora/Lora-Bold.ttf
    - public/fonts/lora/OFL.txt
    - public/fonts/README.md
    - lib/pdf/register-fonts.ts
    - tests/unit/pdf/register-fonts.test.ts
  modified:
    - lib/estimate/document/tokens.ts
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx

key-decisions:
  - "Sourced font binaries from fonts.gstatic.com (Google's font-serving CDN) rather than the google/fonts GitHub repo, since the GitHub source files are variable-axis ([wght].ttf) with no static per-weight instances that Font.register/fontkit can load"
  - "Font files placed under public/fonts/ (not assets/fonts/) because only public/, .next/standalone, and .next/static survive the Dockerfile's runner-stage COPY steps into the deployed image"
  - "Classic and Modern registered as independently-named families ('Inter'/'Inter-Bold', 'Lora'/'Lora-Bold') mirroring the existing Helvetica/Helvetica-Bold convention, rather than one family with fontWeight variants"
  - "solidHeaderFill added now (Plan 183-03) instead of deferred to Plan 183-04, since 183-04's shared PdfSectionBlock/title-banner components need this flag and it keeps tokens.ts changes in one place"

requirements-completed: [PDFPAR-01, ENGINE-03]

# Metrics
duration: 10min
completed: 2026-07-28
---

# Phase 183 Plan 03: Vendored PDF Fonts Summary

**Classic PDF template now renders in Inter (matching the web's next/font/google Inter) and Modern renders in Lora (a real OFL serif TTF), both registered via one shared `Font.register` module, proven end-to-end by a real `renderToBuffer()` smoke test.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-28T02:52:00-04:00 (approx.)
- **Completed:** 2026-07-28T03:00:09-04:00
- **Tasks:** 2 completed
- **Files modified:** 12 (9 created, 3 modified)

## Accomplishments
- Vendored 4 real, magic-byte-verified TTF files (Inter Regular/Bold v20, Lora Regular/Bold v37) plus their OFL.txt licenses and a sourcing README, all under `public/fonts/` (the only path that survives the Docker standalone build)
- Centralized `Font.register` into one module (`lib/pdf/register-fonts.ts`), imported for side effects by both `estimate-pdf.tsx` and `estimate-pdf-modern.tsx` — a 1-line addition to each file, zero JSX/StyleSheet structural change
- Swapped `ESTIMATE_DESIGN_TOKENS` values: Classic `Helvetica`/`Helvetica-Bold` → `Inter`/`Inter-Bold`; Modern `Times-Roman`/`Times-Bold` → `Lora`/`Lora-Bold`
- Widened `EstimateDesignTokens` with a new static `solidHeaderFill` boolean (`true` for Classic, `false` for Modern) that Plan 183-04's shared section-block/title-banner components will consume
- Added a real (non-mocked) `renderToBuffer` smoke test that renders `<Text>` nodes in all 4 registered families and asserts a non-empty `%PDF`-prefixed buffer — proving the vendored TTF bytes are valid and loadable by react-pdf's fontkit engine, following full TDD RED → GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor Inter + Lora TTFs with OFL licenses and a sourcing README** - `7cd30fdc` (feat)
2. **Task 2 (RED): Add failing renderToBuffer smoke test** - `db58221a` (test)
2. **Task 2 (GREEN): Font.register module + widened design tokens + template imports** - `0dd4bb9f` (feat)

_TDD task 2 produced two commits (test → feat); no refactor commit was needed — the GREEN implementation matched the plan's exact snippets with no cleanup required._

## Files Created/Modified
- `public/fonts/inter/Inter-Regular.ttf`, `public/fonts/inter/Inter-Bold.ttf` - Vendored Inter v20 static TTFs (66592 / 66788 bytes, verified TrueType magic bytes)
- `public/fonts/lora/Lora-Regular.ttf`, `public/fonts/lora/Lora-Bold.ttf` - Vendored Lora v37 static TTFs (47396 / 47112 bytes, verified TrueType magic bytes)
- `public/fonts/inter/OFL.txt`, `public/fonts/lora/OFL.txt` - SIL Open Font License 1.1 text for each family
- `public/fonts/README.md` - Source URLs, versions (v20/v37), vendor date, and rationale for using gstatic.com over the GitHub source repo
- `lib/pdf/register-fonts.ts` - The one `Font.register` call site for Inter, Inter-Bold, Lora, Lora-Bold
- `lib/estimate/document/tokens.ts` - `ESTIMATE_DESIGN_TOKENS` font values swapped to Inter/Lora; `EstimateDesignTokens` widened with `solidHeaderFill`
- `components/pdf/estimate-pdf.tsx`, `components/pdf/estimate-pdf-modern.tsx` - Added `import '@/lib/pdf/register-fonts'` side-effect import (1 line each)
- `tests/unit/pdf/register-fonts.test.ts` - Real `renderToBuffer` smoke test for all 4 registered font families

## Decisions Made
- Font binaries sourced from Google's gstatic CDN (not the google/fonts GitHub repo) because the GitHub source is variable-axis and has no static per-weight instances usable by `Font.register`
- Fonts placed under `public/fonts/` — verified via the Dockerfile's runner-stage `COPY --from=builder .../app/public ./public` that this is the only font-file path guaranteed to survive into the deployed container
- `solidHeaderFill` landed in this plan (not deferred to 183-04) since 183-04's shared components need it and tokens.ts is already being touched here

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Task 2's `tsc -p tsconfig.ci.json --noEmit` initially reported 2 errors, but both were confined to `lib/queries/share.ts` — a file owned by the concurrently-executing Plan 183-02 (Wave 1 sibling), which was mid-edit at the time. Per the plan's documented "Same-wave tsc note," this was a transient artifact: polled `git status`/`git log` until 183-02 committed its `lib/queries/share.ts` changes (commit `a5046960`), then re-ran `tsc` with zero errors. No files outside this plan's scope were edited.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `lib/pdf/register-fonts.ts` and the widened `EstimateDesignTokens.solidHeaderFill` flag are ready for Plan 183-04's shared `PdfSectionBlock`/title-banner components to consume without re-touching tokens.ts
- Both PDF templates now render in fonts matching the webview benchmark (Inter for Classic, Lora for Modern), closing the font-parity gap PDFPAR-01 called out
- Phase 184's pagination/measurement work can reuse this same registered font set per the CONTEXT.md sequencing note ("do not have two font sources")

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 9 key-files (7 font/license/README assets + register-fonts.ts + register-fonts.test.ts) verified present on disk. All 3 task commits (7cd30fdc, db58221a, 0dd4bb9f) verified present in git log.
