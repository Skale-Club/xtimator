---
phase: 183-pdf-parity-content
plan: 04
subsystem: pdf
tags: [react-pdf, refactor, de-duplication, design-tokens, brand-fill, tdd-style-test]

# Dependency graph
requires:
  - phase: 183-pdf-parity-content
    provides: "Plan 183-01 baseline-order regression anchor (tests/unit/pdf/estimate-pdf-baseline-order.test.tsx) and fixture module (tests/unit/estimate/fixtures/document-fixtures.ts)"
  - phase: 183-pdf-parity-content
    provides: "Plan 183-03 vendored fonts + widened ESTIMATE_DESIGN_TOKENS.solidHeaderFill"
provides:
  - "components/pdf/shared/* — 6 shared react-pdf layout components (PdfHeader, PdfInfoGrid, PdfFooter, PdfTitleBanner, PdfSectionBlock, PdfTermsSection) consumed by both estimate-pdf.tsx and estimate-pdf-modern.tsx"
  - "Classic PDF's ESTIMATE title now has a solid brandColor-fill banner (closes the one verified PDFPAR-01 gap vs Classic webview benchmark)"
  - "tests/unit/pdf/estimate-pdf-banner-fill.test.tsx — positive (Classic fill) + negative (Modern no-fill, Pitfall-1 guard) style-aware regression test"
affects: [183-06-pdf-signature-caption-wiring, 184-consolidated-pagination-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared react-pdf sub-components invoked as PLAIN FUNCTIONS at their call site (e.g. `{PdfHeader({...})}`), not JSX (`<PdfHeader ... />`) — required so direct-function-call tests (EstimatePDF({...}) with no React renderer) see a fully-resolved View/Text tree instead of an opaque, unresolved custom-component element. Documented in pdf-header.tsx's top comment and referenced by every other shared component."
    - "Per-array-item shared components (PdfSectionBlock) set their own `key` on the outermost returned element, since the caller invokes them as a plain function inside `.map()` rather than via JSX/React.createElement — React never sees the call site to attach a key externally."
    - "Shared components accept only the STYLE VALUES they need as props (styles: {...}); per-template StyleSheet.create() blocks stay in each template file untouched — only JSX structure is centralized, not visual values."

key-files:
  created:
    - components/pdf/shared/pdf-header.tsx
    - components/pdf/shared/pdf-info-grid.tsx
    - components/pdf/shared/pdf-footer.tsx
    - components/pdf/shared/pdf-title-banner.tsx
    - components/pdf/shared/pdf-section-block.tsx
    - components/pdf/shared/pdf-terms-section.tsx
    - tests/unit/pdf/estimate-pdf-banner-fill.test.tsx
  modified:
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx

key-decisions:
  - "Wired all 6 shared components via direct function invocation (`{PdfHeader({...})}`) instead of the plan's literal JSX examples (`<PdfHeader .../>`), because tests/unit/estimate/_pdf-text-walker.ts (imported by the pre-existing baseline-order test, owned by concurrent Plan 183-05 / outside this plan's file scope) only resolves React-pdf's own Text/View primitives — it does not invoke nested custom function components. Direct invocation guarantees EstimatePDF({...})'s returned tree is fully resolved with zero output/order change, keeping the baseline-order test green without touching any file outside this plan's declared scope."
  - "PdfSectionBlock sets its own `key={section.id}` on its outermost View internally (rather than expecting the caller to pass a `key` prop through React.createElement), since it's invoked as a plain function inside `.map()` — the caller never goes through JSX/createElement for this element, so React's list-reconciliation key must be embedded by the component itself."
  - "PdfTitleBanner/PdfTermsSection use `Fragment` (imported from 'react') to return multiple sibling nodes from a plain function call — confirmed via the walker that Fragments are transparently traversed (their `props.children` is walked like any other node)."
  - "Computed companyAddress/clientAddress internally inside PdfHeader/PdfInfoGrid via formatAddress(), rather than passing them as extra props — removes the now-dead local computations and their formatAddress import from both templates, keeping the prop surface smaller than the plan's literal listing."
  - "Imported DocumentSection type for PdfSectionBlock's props from lib/estimate/document/model.ts (a pre-existing, non-plan-owned Phase 182 file) instead of duplicating a local interface — EstimateWithSections's section shape is a structural superset, so no template code needed to change to satisfy it."

requirements-completed: [PDFPAR-01, ENGINE-03]

# Metrics
duration: 15min
completed: 2026-07-28
---

# Phase 183 Plan 04: Shared PDF Layout Components Summary

**Extracted the 5 structurally-duplicated regions (header, info grid, footer, title, section block, terms) from the ~708-line Classic/Modern PDF template pair into 6 shared `components/pdf/shared/*` components, and closed Classic PDF's one verified title-banner gap (solid `backgroundColor: brandColor` fill matching Classic webview's benchmark) while leaving Modern's hairline/accent-only title and section headers provably unchanged.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-28T03:09:00-04:00 (approx.)
- **Completed:** 2026-07-28T03:24:01-04:00
- **Tasks:** 3 completed
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Created `components/pdf/shared/pdf-header.tsx`, `pdf-info-grid.tsx`, `pdf-footer.tsx` — company header (logo/name/contact/address/language badge), Project/Bill-To info grid, and page-number footer, each parameterized by per-template `styles.*` values and (Classic-only) dynamic color overrides
- Created `components/pdf/shared/pdf-title-banner.tsx` — the ONE intentional visual change: Classic's ESTIMATE title now renders inside a `View` with `backgroundColor: brandColor` + padding, text colored `brandOnFill`, matching Classic webview's `estimate-document.tsx:1476-1486` benchmark; Modern's hairline text + rule is reproduced byte-for-byte unchanged, driven by `ESTIMATE_DESIGN_TOKENS.<template>.solidHeaderFill`
- Created `components/pdf/shared/pdf-section-block.tsx` — section header + table header + zebra-striped item rows + subtotal, with the Classic fill vs. Modern no-fill section-header divergence preserved exactly as a `solidFill`-driven branch
- Created `components/pdf/shared/pdf-terms-section.tsx` — the outer-visibility-gated Estimate Terms/Payment Terms/Timeline/Warranty/Notes block, identical on both templates
- Wired all 6 into both `estimate-pdf.tsx` (708 → 552 lines) and `estimate-pdf-modern.tsx` (710 → 564 lines) — removed JSX now lives once, not twice
- Added `tests/unit/pdf/estimate-pdf-banner-fill.test.tsx` with a purpose-built style-aware local tree walker: positive assertion that Classic's title has an ancestor View with `backgroundColor: brandColor`, and a whole-tree negative assertion that Modern has NO node anywhere with a brand-color background fill (the explicit Pitfall-1 guard)
- Kept the Plan 183-01 baseline-order regression test green throughout — text content and order are byte-identical to before the refactor (the one exception, the new Classic title `View` wrapper, does not add/remove/reorder any `<Text>` node)

## Task Commits

Each task was committed atomically:

1. **Task 1: PdfHeader + PdfInfoGrid + PdfFooter — extract and wire into both templates** - `899e781e` (feat)
2. **Task 2: PdfTitleBanner + PdfSectionBlock (Classic banner fix, Correction 1) — extract and wire** - `39601c2a` (feat)
3. **Task 3: PdfTermsSection — extract and wire into both templates** - `74ba1419` (feat)
4. **Post-completion: type shared-component styles with react-pdf `Style`** - `366a67a3` (fix) — requested by the orchestrator after the wave-2 boundary `tsc` gate caught bare-`object` style props; see Deviation 3 below

_No TDD RED/GREEN split — these are refactor-and-fix tasks per the plan's `type="auto"` designation, not `tdd="true"`._

## Files Created/Modified
- `components/pdf/shared/pdf-header.tsx` - Shared company header (logo, name+link, phone/email/website joined with `  |  `, address, language badge); optional `headerBorderColor`/`companyNameColor` for Classic's dynamic brand overrides
- `components/pdf/shared/pdf-info-grid.tsx` - Shared Project/Bill To grid; `clientNameFontFamily` prop carries each template's bold-token value
- `components/pdf/shared/pdf-footer.tsx` - Shared "Page N of M" fixed footer
- `components/pdf/shared/pdf-title-banner.tsx` - `solidFill`-branched ESTIMATE title: Classic gets a NEW solid brand-fill banner; Modern's hairline/rule treatment is unchanged
- `components/pdf/shared/pdf-section-block.tsx` - Shared section header + table + rows + subtotal; `solidFill` drives Classic's brand-fill header vs. Modern's no-override header (both behaviors unchanged from before, just relocated)
- `components/pdf/shared/pdf-terms-section.tsx` - Shared outer-gated terms block (Estimate Terms/Payment/Timeline/Warranty/Notes)
- `tests/unit/pdf/estimate-pdf-banner-fill.test.tsx` - Style-aware walker; Classic-positive + Modern-negative brand-fill assertions
- `components/pdf/estimate-pdf.tsx` - Classic template now composes the 6 shared components; removed dead `companyAddress`/`clientAddress` locals and now-unused `Link`/`formatAddress`/`formatPhoneForDisplay` imports
- `components/pdf/estimate-pdf-modern.tsx` - Modern template now composes the 6 shared components; same dead-code cleanup as Classic

## Decisions Made
- Direct-function-call wiring (not JSX) for all 6 shared components — see key-decisions above for the full rationale (keeps the out-of-scope `_pdf-text-walker.ts`-based baseline-order test green without touching any file outside this plan's `files_modified` list)
- `PdfSectionBlock` self-assigns `key={section.id}` since it's invoked as a plain function inside `.map()`, not via JSX
- Computed `companyAddress`/`clientAddress` internally in the shared components (via `formatAddress`) rather than threading them as extra props, trimming dead code from both templates in the process
- Reused the pre-existing `DocumentSection` type from `lib/estimate/document/model.ts` for `PdfSectionBlock`'s props instead of declaring a new local interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired shared components via direct function invocation instead of JSX**
- **Found during:** Task 1 (PdfHeader/PdfInfoGrid/PdfFooter wiring)
- **Issue:** The plan's action text shows JSX call-site examples (e.g. `<PdfTitleBanner .../>`). But `tests/unit/pdf/estimate-pdf-baseline-order.test.tsx` (which this plan's own verify step and success criteria require to "stay green throughout") calls `EstimatePDF({...})` directly with no React renderer, then walks the tree with `tests/unit/estimate/_pdf-text-walker.ts`'s `collectTextNodes` — a helper owned by concurrently-executing Plan 183-05 (`tests/unit/estimate/**` is out of this plan's file scope). That walker only recognizes react-pdf's own `Text`/`View` primitives; it does not invoke nested custom function components, so any region wired via JSX (`<PdfHeader ... />`) would appear as an opaque, unresolved element to the walker — silently dropping that region's text from the collected array and breaking the baseline-order test.
- **Fix:** Wired every shared component as a direct function call at its use site (e.g. `{PdfHeader({...})}` instead of `<PdfHeader .../>`). Since these are plain, hookless function components, calling them directly is valid React and returns an already-resolved element (or Fragment/array), which splices into the parent tree exactly as if the JSX had been expanded — with zero output difference, but now the direct-call test infra sees a fully resolved tree at every position.
- **Files modified:** components/pdf/estimate-pdf.tsx, components/pdf/estimate-pdf-modern.tsx, and documented via a top-of-file comment in every components/pdf/shared/*.tsx file
- **Verification:** `npx vitest run tests/unit/pdf tests/unit/estimate/document-engine-boundary.test.ts` — 25/25 tests pass, including both baseline-order tests (Classic + Modern) with zero text-order change
- **Committed in:** 899e781e, 39601c2a, 74ba1419 (part of each task's commit)

**2. [Rule 1 - Bug] Removed now-dead `companyAddress`/`clientAddress` locals and their unused imports from both templates**
- **Found during:** Task 1
- **Issue:** After extracting PdfHeader/PdfInfoGrid (which compute these internally via `formatAddress`), the original per-template `const companyAddress = formatAddress(company)` / `const clientAddress = client ? formatAddress(client) : null` locals became dead code, along with the `formatAddress`, `Link`, and `formatPhoneForDisplay` imports that were only used by the now-removed inline JSX.
- **Fix:** Deleted the dead locals and unused imports from both `estimate-pdf.tsx` and `estimate-pdf-modern.tsx`.
- **Files modified:** components/pdf/estimate-pdf.tsx, components/pdf/estimate-pdf-modern.tsx
- **Verification:** Both files still compile and all scoped tests pass; no remaining references to the removed identifiers (confirmed via grep)
- **Committed in:** 899e781e (Task 1 commit)

**3. [Rule 1 - Bug] Typed shared-component style props with react-pdf's `Style` instead of bare `object`**
- **Found during:** Wave-2 boundary gate (`npx tsc -p tsconfig.ci.json --noEmit`, run by the orchestrator after both 183-04 and 183-05 completed)
- **Issue:** All 6 `components/pdf/shared/*.tsx` files declared their `styles: {...}` prop fields as the bare TypeScript `object` type. `object` does not satisfy react-pdf's `Text`/`View`/`Link`/`Image` `style?: Style | Style[]` prop type, producing TS2769 ("Type 'object' is not assignable to type 'Style'") at every call site across all 6 files once the scoped `tsconfig.ci.json` gate ran.
- **Fix:** Imported `type { Style } from '@react-pdf/types'` (a real, declared dependency of `@react-pdf/renderer`, confirmed resolvable — not an incidental hoist) and replaced every `object`-typed style field with `Style` across `PdfHeaderStyles`, `PdfInfoGridStyles`, `PdfFooterStyles`, `PdfTitleBannerStyles`, `PdfSectionBlockStyles`, `PdfTermsSectionStyles`. No call-site changes were needed in `estimate-pdf.tsx`/`estimate-pdf-modern.tsx` — their `StyleSheet.create()` output already structurally satisfies `Style`.
- **Files modified:** components/pdf/shared/pdf-header.tsx, pdf-info-grid.tsx, pdf-footer.tsx, pdf-title-banner.tsx, pdf-section-block.tsx, pdf-terms-section.tsx
- **Verification:** `npx tsc -p tsconfig.ci.json --noEmit` exits clean (0 errors); `npx vitest run tests/unit/pdf tests/unit/estimate/document-engine-boundary.test.ts` stays green (25/25) — types only, zero behavior/output change
- **Committed in:** `366a67a3`

---

**Total deviations:** 3 auto-fixed (1 blocking-tests fix, 1 dead-code cleanup, 1 post-hoc type fix requested at the wave-2 boundary gate)
**Impact on plan:** All three changes were necessary for correctness (types) or to satisfy the plan's own explicit requirements (baseline-order test green, no dead code). No scope creep — no file outside this plan's declared `files_modified` list (plus the wave-boundary type fix, still scoped to `components/pdf/shared/*`) was touched.

## Issues Encountered

None — all three tasks' acceptance criteria and verify commands passed on the first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `components/pdf/shared/*` now provides 6 reusable react-pdf layout primitives that Plan 183-06 (PDF signature block + photo caption wiring) can compose alongside, without re-touching the header/info-grid/footer/title/section/terms regions this plan consolidated
- Classic PDF's ESTIMATE title banner-fill gap (the one verified PDFPAR-01 divergence from the webview benchmark) is closed; Modern's hairline treatment is provably unchanged via a dedicated negative regression test
- Both PDF templates shrank meaningfully (Classic 708→552 lines, Modern 710→564 lines) with the extracted structure now living once under `components/pdf/shared/*`
- Plan 183-05 (webview signature block + photo captions, `components/workspace/**`/`components/share/**`/`tests/unit/estimate/**`) completed concurrently in the same wave (commits `6accec8c`, `dff6d60d`) — this plan touched zero files in that scope; the orchestrator's full-suite run at the wave-2 boundary (including `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` and whole-repo `tsc`) is the authoritative joint check for both plans, per this plan's own Wave-2 boundary note and the parallel-execution instructions this plan was run under

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 10 key files verified present on disk (6 shared components, 1 new test, 2 modified templates, this SUMMARY). All 4 commits (899e781e, 39601c2a, 74ba1419, 366a67a3) verified present in `git log`. Final `npx tsc -p tsconfig.ci.json --noEmit` exits 0; final `npx vitest run tests/unit/pdf tests/unit/estimate/document-engine-boundary.test.ts` is 25/25 green.
