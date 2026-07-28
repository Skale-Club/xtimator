---
phase: 186-webview-design-polish
plan: 02
subsystem: ui
tags: [tailwind, react-pdf, estimate-document, webview-polish, design-tokens, cardTintFill]

# Dependency graph
requires:
  - phase: 186-webview-design-polish
    provides: "Plan 01's desktop-only zebra pattern + brand-tied grand-total emphasis + unified letter-spacing (this plan builds on that same webview surface)"
  - phase: 184-consolidated-pagination-engine
    provides: "blocks-from-model.ts height-formula citations (termsCardBaseHeightPt/signatureBaseHeightPt) this plan proves are untouched"
provides:
  - "cardTintFill(brandColor) — the one shared, guarded brand-tint helper in lib/estimate/document/tokens.ts, consumed identically by both webview templates' terms/signature and the Classic PDF's PdfTermsCard/PdfSignatureBlock"
  - "Terms entries + signature block render with a matching subtle brand tint (Classic: solid fill; Modern: left-accent border, hairline-only by design) in both webview templates"
  - "Classic PDF terms cards + signature block carry the matching tint via an optional cardFill prop, wired at the 2 real call sites in estimate-pdf.tsx only — zero geometry/height-formula impact"
  - "Customer-facing (view-mode) mobile item list and photo grid read as polished cards — zebra now fully retired from every mobile surface across both templates"
  - "POLISH-01 closed in REQUIREMENTS.md with an honest webview-only rationale; milestone v4.23 all 18/18 v1 requirements complete"
affects: [milestone-lifecycle (v4.23 ready for /gsd:complete-milestone), any future phase touching lib/estimate/document/tokens.ts, components/pdf/shared/pdf-terms-section.tsx, or components/pdf/shared/pdf-signature-block.tsx]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cardTintFill(brandColor): string | undefined — regex-validated 6-digit hex, returns undefined (not a garbage color) on malformed input; the ONE place both a webview template and the Classic PDF derive a brand-tint hex-alpha string from, never two independently hand-typed literals/guards"
    - "PDF shared components (PdfTermsCard/PdfSignatureBlock) accept an optional cardFill?: string prop that ONLY ever sets backgroundColor — proven geometry-inert by blocks-from-model.ts's empty git diff and its unmodified test suite"
    - "Classic webview: solid brand-tint fill on terms/signature cards (rounded-lg border + backgroundColor). Modern webview: left-accent border only (border-l-2 + borderLeftColor), matching its documented hairline/accent-only, never-solid-fill template identity (ESTIMATE_DESIGN_TOKENS.modern.solidHeaderFill: false)"
    - "Mobile item lists (customer-facing VIEW mode only, both templates) replaced their divider/zebra classes with a card treatment (mx-*, my-1.5, rounded-lg, border) — zebra is now fully retired from every mobile surface; workspace-editor mobile-EDIT list (item-card-mobile.tsx) already lost its zebra in Plan 186-01 and was untouched here"

key-files:
  created: []
  modified:
    - lib/estimate/document/tokens.ts
    - components/workspace/estimate/estimate-document.tsx
    - components/share/estimate-document-modern.tsx
    - components/pdf/shared/pdf-terms-section.tsx
    - components/pdf/shared/pdf-signature-block.tsx
    - components/pdf/estimate-pdf.tsx
    - tests/unit/estimate/pagination-tokens.test.ts
    - tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap
    - tests/e2e/visual/share.spec.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "cardFill is wired ONLY at estimate-pdf.tsx's 2 live call sites (PdfTermsCard ~578, PdfSignatureBlock ~591) — components/pdf/shared/pdf-terms-section.tsx's exported PdfTermsSection wrapper function is confirmed dead code (neither PDF template calls it) and was left untouched, not wired"
  - "Modern's PDF and webview terms/signature intentionally stay fill-free (hairline/left-accent only) — this is Modern's documented template identity (solidHeaderFill: false), not an oversight or an incomplete propagation"
  - "The two stale ?stripe=success/canceled visual baselines were deleted (not silently) — confirmed during planning that the share page never reads that query param; the tests asserted dead behavior, superseded by the Phase 94 issued-invoice pay-link UI"
  - "POLISH-01 is closed with an honest, scoped rationale: webview-only polish + one geometry-safe PDF token (background-color only); PDF font/box propagation is explicitly deferred as it would require lockstep blocks-from-model.ts formula updates this plan intentionally avoided"

patterns-established:
  - "Brand-tint card treatment: one shared cardTintFill() helper feeds both a webview template's inline style and a PDF component's optional cardFill prop — no template re-derives its own hex-alpha literal or hex-validity regex"
  - "Zebra striping is now fully retired from every mobile surface (both templates, both edit and view modes) across the whole estimate document system — it survives ONLY as a desktop-table-only pattern (Plan 186-01)"

requirements-completed: [POLISH-01]

# Metrics
duration: 15min
completed: 2026-07-28
---

# Phase 186 Plan 02: Terms/Signature Tint, Mobile/Photo Card Polish & Milestone Close-out Summary

**Shared `cardTintFill(brandColor)` token in `lib/estimate/document/tokens.ts` tints terms/signature cards identically across both webview templates and the Classic PDF (2 real call sites only), retires mobile-list zebra entirely, and closes POLISH-01 — milestone v4.23's last requirement — with zero pagination-geometry drift.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-28T13:50:00-04:00 (approx.)
- **Completed:** 2026-07-28T14:02:26-04:00
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Added `cardTintFill(brandColor)` + `CARD_TINT_ALPHA_HEX` to `lib/estimate/document/tokens.ts` — a regex-validated (`/^#[0-9a-fA-F]{6}$/`), defensively-typed helper that returns `undefined` on malformed/non-hex input, so a bad tenant `brandColor` safely omits the fill everywhere instead of rendering a garbage color
- Classic webview: all 5 terms wrapper divs (Estimate Terms/Payment/Timeline/Warranty/Notes) and a new inner div inside the signature block's existing pagination-anchor wrapper now show `rounded-lg border border-border/50 p-4` + an inline `backgroundColor: cardTintFill(brandColor)` — the outer signature wrapper's own className/data-page-block-id was left byte-unchanged
- Modern webview: the 4 terms divs and a new inner div inside the signature block gained `border-l-2 pl-4` + `borderLeftColor: brandColor` — a left-accent only, matching Modern's documented hairline/no-solid-fill template identity
- Classic PDF: `PdfTermsCard` and `PdfSignatureBlock` (`components/pdf/shared/*`) gained an optional `cardFill?: string` prop that ONLY sets `backgroundColor`, wired at the 2 real, live call sites in `estimate-pdf.tsx` (`case 'terms-card'` ~578, `case 'signature'` ~591) via `cardTintFill(brandColor)`. `PdfTermsSection` (dead code, uncalled by either template) was left untouched; `estimate-pdf-modern.tsx` was not edited at all, so Modern's PDF stays fill-free by omission
- Photo tiles gained a visible frame in both templates (`ring-1 ring-border/50` Classic, `border border-[#e4e4e7]` Modern) without touching `pdf-photo-grid.tsx` or any width-affecting property
- The customer-facing (view-mode) mobile stacked item list in both templates replaced its divider/zebra classes with a card treatment (`mx-4 my-1.5 rounded-lg border border-border/40` Classic; `mx-6 my-1.5 rounded-lg border border-[#e4e4e7]` Modern) — zebra is now fully retired from every mobile surface; `item-card-mobile.tsx` (workspace-editor mobile EDIT list) was untouched, its own zebra removal having already shipped in Plan 186-01
- The two stale `?stripe=success`/`?stripe=canceled` visual baselines in `tests/e2e/visual/share.spec.ts` were deleted with a documented reason (confirmed dead: neither `app/estimate/[token]/page.tsx` nor `actions.ts` reads that query param); the file's own coverage-matrix docblock corrected from 12 to 10 baselines total
- `.planning/REQUIREMENTS.md`: POLISH-01 checkbox flipped to `[x]`, traceability row updated with the honest rationale sentence, coverage footer corrected to 18/18 mapped and complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Terms/signature tint (webview both templates) + Classic PDF propagation via shared, guarded token** - `8dce94c9` (feat)
2. **Task 2: Photo grid frame + customer-facing mobile stacked-item-list card treatment** - `12fc5351` (feat)
3. **Task 3: Milestone close-out — stale visual-baseline handling + REQUIREMENTS.md** - `0f660def` (docs)

_All 3 tasks committed with pre-commit hooks enabled (sole-executor mode, per plan)._

## Files Created/Modified
- `lib/estimate/document/tokens.ts` - New `CARD_TINT_ALPHA_HEX` constant + `cardTintFill(brandColor)` guarded helper (regex-validated hex, `undefined`-safe fallback)
- `components/workspace/estimate/estimate-document.tsx` - Classic terms/signature cards gain brand-tint fill via `cardTintFill`; photo tile gains `ring-1 ring-border/50`; mobile item row loses zebra/divider classes, gains `mx-4 my-1.5 rounded-lg border border-border/40`
- `components/share/estimate-document-modern.tsx` - Modern terms/signature gain a left-accent border (`border-l-2` + `borderLeftColor: brandColor`); photo tile gains `border border-[#e4e4e7]`; mobile item row gains `mx-6 my-1.5 rounded-lg border border-[#e4e4e7]`
- `components/pdf/shared/pdf-terms-section.tsx` - `PdfTermsCardProps` gains optional `cardFill?: string`; root View's style merges `backgroundColor` in alongside the existing `marginTop` conditional
- `components/pdf/shared/pdf-signature-block.tsx` - `PdfSignatureBlockProps` gains optional `cardFill?: string`; root View's style merges `backgroundColor` in alongside its fixed `marginTop: 16`
- `components/pdf/estimate-pdf.tsx` - Imports `cardTintFill`; wires `cardFill: cardTintFill(brandColor)` at the `PdfTermsCard` and `PdfSignatureBlock` call sites only
- `tests/unit/estimate/pagination-tokens.test.ts` - New `describe('cardTintFill (Phase 186, POLISH-01)', ...)` block: valid-hex case + malformed-input `undefined` fallback case
- `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` - Reviewed, intentional updates: terms-card className/style addition (Task 1), mobile-row className swap from divider/zebra to card classes (Task 2)
- `tests/e2e/visual/share.spec.ts` - Removed the 2 stale `?stripe=success`/`?stripe=canceled` visual tests with a documented reason; docblock coverage-matrix corrected from 12 to 10 baselines total
- `.planning/REQUIREMENTS.md` - POLISH-01 checkbox + traceability row + coverage footer, all reflecting 18/18 complete

## Decisions Made
- `cardFill` wiring scoped strictly to `estimate-pdf.tsx`'s 2 live call sites; `PdfTermsSection` (confirmed dead code via grep — neither PDF template calls it) was deliberately left untouched rather than "fixed"
- Modern's PDF and webview terms/signature intentionally stay fill-free — matches its documented `solidHeaderFill: false` template identity, not an oversight
- Used a merged-object style pattern (`style={{ ...(a ? {...} : {}), ...(b ? {...} : {}) }}`) instead of an array-with-`undefined`-entries pattern for the two PDF shared components' `View` styles — react-pdf's own `Style | Style[]` type doesn't accept `undefined` array members even though its runtime `compact()` filters them; the merged-object form satisfies both the type-checker and the runtime identically
- POLISH-01 closed with an explicitly scoped, honest rationale rather than an over-claiming one: webview-only polish + one geometry-safe PDF background-color token; PDF font/box propagation is deferred, would require lockstep `blocks-from-model.ts` formula changes this plan intentionally did not make

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `View` style typed as `Style | Style[]` rejects `undefined` array entries**
- **Found during:** Task 1 (PDF shared component `cardFill` wiring)
- **Issue:** The plan's action text described merging a `backgroundColor` entry "as an additional array entry alongside its existing conditional style" (i.e. `style={[a, b]}` with possibly-`undefined` entries). `npx tsc -p tsconfig.ci.json --noEmit` failed: react-pdf's `View` prop type is `Style | Style[]`, and TS does not allow `undefined` as an array member of `Style[]` even though the library's own runtime `compact()` (in `@react-pdf/stylesheet`) safely filters `null`/`undefined` entries at render time.
- **Fix:** Switched both `pdf-terms-section.tsx`'s `PdfTermsCard` and `pdf-signature-block.tsx`'s `PdfSignatureBlock` to a single merged-object style (`style={{ ...(topMarginPt ? {...} : {}), ...(cardFill ? {...} : {}) }}`) instead of an array literal — identical runtime behavior (an omitted key when the condition is false), satisfies the type-checker.
- **Files modified:** components/pdf/shared/pdf-terms-section.tsx, components/pdf/shared/pdf-signature-block.tsx
- **Verification:** `npx tsc -p tsconfig.ci.json --noEmit` clean; `tests/unit/pdf` (22 files, 143 tests) and the plan's full verification suite all pass unmodified
- **Committed in:** 8dce94c9 (Task 1 commit)

**2. [Rule 1 - Bug] Documentation comment for the removed stale visual tests literally matched its own "must be gone" grep check**
- **Found during:** Task 3 (`share.spec.ts` stale-baseline removal)
- **Issue:** The plan's Task 3 verification requires `grep -c "stripe=success\|stripe=canceled"` to return `0` and `grep -c "10 baselines total"` to return exactly `1`. My first draft of the intentional-removal comment quoted the literal `?stripe=success`/`?stripe=canceled` strings and repeated the phrase "10 baselines total" a second time (in the removal-rationale comment, in addition to the docblock) — both self-defeating the plan's own verification gates.
- **Fix:** Rephrased the removal comment to describe the query param and the baseline-count correction without repeating the exact literal substrings the grep checks are asserting against.
- **Files modified:** tests/e2e/visual/share.spec.ts
- **Verification:** `grep -c "stripe=success\|stripe=canceled"` → 0; `grep -c "12 baselines total"` → 0; `grep -c "10 baselines total"` → 1; `npx playwright test tests/e2e/visual/share.spec.ts --list` still parses cleanly (30 tests, down from 36)
- **Committed in:** 0f660def (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs introduced by following the plan's prose literally, caught and fixed before commit)
**Impact on plan:** Both fixes were necessary for the plan's own stated verification gates to pass (typecheck clean, exact grep counts) and involved zero scope creep — no additional files touched beyond the ones the plan already listed.

## Issues Encountered
None beyond the two auto-fixed deviations above — every other verification step (snapshot diffs, full `tests/unit/estimate`/`tests/unit/pdf`/`tests/unit/pagination` suites, `blocks-from-model.ts` empty-diff check, `git diff --stat` file-count check) passed on the first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Milestone v4.23 (Unified Estimate Document Engine) readiness:** All 18/18 v1 requirements — ENGINE-01/02/03, PDFPAR-01/02/03/04, PGBRK-01/02/03/04/05, PGMODE-01/02/03/04/05, POLISH-01 — are now complete across Phases 182-186, with 0 orphans and 0 duplicates (`.planning/REQUIREMENTS.md`'s Traceability table and Coverage footer both reflect this). The webview remains the design benchmark; the Classic PDF is unified with it through the shared `lib/estimate/document/tokens.ts` engine (fonts, page geometry, line-height, photo chunking, and now the brand-tint card color all derive from one module). Zero PDF-geometry drift was introduced by this polish phase — `lib/estimate/pagination/blocks-from-model.ts` has a provably empty `git diff` across both of this plan's tasks, and its own test suite (`tests/unit/pagination/blocks-from-model.test.ts`) needed zero changes. The two stale `?stripe=` visual baselines were resolved intentionally (documented, not silently deleted), with the file's own coverage-matrix docblock corrected. Milestone v4.23 is ready for `/gsd:complete-milestone`.

**Classic-vs-PDF terms-card divergence (documented, not a defect — Warning 8 from the plan):** The webview's terms entries are visually separated by `space-y-4` gaps on their parent container (each card's own `rounded-lg border` renders as a distinct box with breathing room between them), while the PDF's terms cards abut directly with only a first-card top-margin bonus (`termsCardFirstBonusPt`, 24pt Classic / 32pt Modern — see `lib/estimate/pagination/blocks-from-model.ts`'s `TEMPLATE_LITERALS`). This is a pre-existing structural difference between the two renderers (predates this plan, e.g. the PDF's per-card atomic restructure from Phase 184 Plan 04) and was neither introduced nor changed here. "Matching tint" in this plan's scope means the SAME brand-tint background color/accent appears behind each terms/signature region in both renderers — it does NOT mean the two renderers produce byte-identical card boundary/spacing geometry, which remains out of scope (per ROADMAP's own "Pixel-perfect DOM↔PDF parity" out-of-scope entry).

**PDF font/box propagation deferred (recorded in REQUIREMENTS.md's traceability row, honest scope statement):** This plan propagated exactly one cross-surface value to the PDF — the brand-tint `backgroundColor` — because it is provably geometry-inert (confirmed via `blocks-from-model.ts`'s empty diff and its unmodified height-formula test suite). Any further PDF-side propagation of webview polish (font-size/weight, padding, border-width changes) would require lockstep updates to `blocks-from-model.ts`'s `termsCardBaseHeightPt`/`signatureBaseHeightPt` formulas and is explicitly out of this plan's scope — a future phase, not a gap in this one.

No blockers. Suggest `/gsd:verify-work` followed by `/gsd:complete-milestone` for v4.23.

---
*Phase: 186-webview-design-polish*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 10 modified files verified present on disk with the expected changes, and all 3 task commits (8dce94c9, 12fc5351, 0f660def) verified present in `git log`.
