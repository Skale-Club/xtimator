---
phase: 183-pdf-parity-content
plan: 02
subsystem: api
tags: [supabase, signature, pdf, react-pdf, typescript, vitest]

# Dependency graph
requires:
  - phase: 182-shared-document-engine-send-path-fix
    provides: lib/estimate/document/ (model/labels/tokens/format), lib/pdf/render-estimate-pdf.ts shared resolver
provides:
  - lib/queries/estimate-signature.ts — the ONE widened, dependency-free loadLatestSignedSnapshot query (signer_name/signature_data/signed_at/signed_content/signed_total)
  - DocumentSignature type + optional signature field on EstimateDocumentData, EstimateWithSections, EstimatePdfContext
  - signedBy label (en/pt/es) on DocumentLabels
  - isPercentageDiscount() shared predicate for the discount_type spelling fragmentation
  - signerName/signedAt/signatureImageDataUrl threaded onto ShareEstimateData for both share-token and public-token loaders
affects: [183-05-webview-signature-photo-captions, 183-06-pdf-signature-photo-captions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-query extraction with a transitional bare re-export (import kept permanent, re-export deleted once callers repoint) to avoid a tsc red-window across a 2-task boundary"
    - "Type-cast-at-call-site (ComponentType<Props & { extra }>) to thread a not-yet-declared prop into a component file owned by a concurrently-executing sibling plan, avoiding a same-wave file collision"

key-files:
  created:
    - lib/queries/estimate-signature.ts
    - lib/estimate/discount-display.ts
    - tests/unit/estimate/discount-display.test.ts
  modified:
    - lib/estimate/document/model.ts
    - lib/estimate/document/labels.ts
    - lib/queries/share.ts
    - lib/queries/estimate.ts
    - lib/pdf/render-estimate-pdf.ts
    - tests/unit/estimate/document-label-parity.test.ts
    - tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap
    - tests/unit/share-query.test.ts
    - tests/unit/pdf/render-estimate-pdf-resolver.test.ts
    - tests/unit/whatsapp/pdf-delivery.test.ts

key-decisions:
  - "Skipped the plan's optional 'also re-export LatestSignedSnapshotRow type' step — grep confirmed zero external importers of the type, so no re-export was needed"
  - "Cleaned up the now-unused SignedContentSnapshot type import in share.ts after relocating LatestSignedSnapshotRow (direct byproduct of the same edit, not scope creep)"

patterns-established:
  - "isPercentageDiscount(discountType) — the one predicate future rendering tasks (183-05/183-06) import instead of inline === 'percentage' checks"

requirements-completed: [PDFPAR-01, PDFPAR-02]

# Metrics
duration: 15min
completed: 2026-07-28
---

# Phase 183 Plan 02: Signature Query Widening + Discount Predicate Summary

**Widened the one shared `loadLatestSignedSnapshot` query to surface signer name/signature image/signed date to all 4 document surfaces, extracted it into a dependency-free `lib/queries/estimate-signature.ts`, and added the `isPercentageDiscount()` predicate Wave 2/3 rendering tasks will consume.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-28T02:50:00Z (approx)
- **Completed:** 2026-07-28T03:03:08-04:00
- **Tasks:** 3
- **Files modified:** 13 (3 created, 10 modified)

## Accomplishments
- `DocumentSignature` type + optional `signature` field on `EstimateDocumentData`, `EstimateWithSections`, and `EstimatePdfContext` — one shape shared across all 4 surfaces
- `signedBy` label added to all 3 languages, label-parity snapshot regenerated (45 -> 46 keys)
- `isPercentageDiscount()` — framework-free predicate covering both the schema ('percentage') and totals-engine-internal ('percent') spellings
- `loadLatestSignedSnapshot` relocated to `lib/queries/estimate-signature.ts` and widened to select `signer_name`/`signature_data`, with zero red-window across the Task 2 -> Task 3 boundary (transitional re-export pattern)
- `share.ts`'s two loaders (`getEstimateByShareToken`, `getEstimateByPublicToken`) now thread `signerName`/`signedAt`/`signatureImageDataUrl`
- `lib/queries/estimate.ts`'s `fetchEstimateWithSections` replaced its inline `.select('id')` existence check with the shared, widened query (via `requireServiceClient()`), gaining the full `signature` field alongside the existing `hasSignature` boolean
- `lib/pdf/render-estimate-pdf.ts` threads `signature` into the PDF component tree via an explicit type cast, with zero edits to either PDF template file (reserved for Plan 183-06)

## Task Commits

Each task was committed atomically:

1. **Task 1: DocumentSignature model type, signedBy label, isPercentageDiscount predicate** - `be33f778` (feat)
2. **Task 2: Widen the shared signature query, extract it out of share.ts (transitional re-export)** - `a5046960` (feat)
3. **Task 3: Thread signature into the PDF resolver + workspace-editor loader; retire the transitional re-export** - `c55701a5` (feat)

_Note: Task 2's own `<verify>` ran the whole-repo tsc gate plus the two share.ts-mocking test suites before commit, per the plan's no-red-window requirement._

## Files Created/Modified
- `lib/queries/estimate-signature.ts` - New home for the widened `loadLatestSignedSnapshot`/`LatestSignedSnapshotRow`, dependency-free
- `lib/estimate/discount-display.ts` - `isPercentageDiscount(discountType)` predicate
- `lib/estimate/document/model.ts` - `DocumentSignature` interface + optional `signature` field on `EstimateDocumentData`
- `lib/estimate/document/labels.ts` - `signedBy` label in en/pt/es
- `lib/queries/share.ts` - Relocated query body, permanent local import + (now-deleted) transitional re-export, widened `ShareEstimateData['estimate']` with 3 new signature fields
- `lib/queries/estimate.ts` - `fetchEstimateWithSections` sources signature via the shared query; `signature?: DocumentSignature | null` added to `EstimateWithSections`
- `lib/pdf/render-estimate-pdf.ts` - `EstimatePdfContext.signature`, derived in `resolveEstimatePdfContext`, threaded via type-cast in `renderEstimatePdf`
- `tests/unit/estimate/discount-display.test.ts` - 5 cases covering `isPercentageDiscount`
- `tests/unit/estimate/document-label-parity.test.ts` + `.snap` - 46-key count + regenerated snapshot
- `tests/unit/share-query.test.ts` - 2 new cases (signature present / absent)
- `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` - Mock repoint + 2 new signature-derivation cases
- `tests/unit/whatsapp/pdf-delivery.test.ts` - Mock repoint only

## Decisions Made
- Skipped re-exporting `LatestSignedSnapshotRow` as a type from `share.ts` — grep confirmed no external file imports that type name, so the plan's conditional step was a no-op
- Removed the now-unused `SignedContentSnapshot` type import from `share.ts` after relocating the interface that consumed it (direct cleanup of the same edit, not separate scope)

## Deviations from Plan

None - plan executed exactly as written. The only adjustments (skipping the conditional type re-export, removing a now-dead import) were both anticipated/conditional steps in the plan's own action text, not unplanned work.

## Issues Encountered
None. Both `tsc -p tsconfig.ci.json --noEmit` checks (after Task 2 and after Task 3) were clean throughout, including after the concurrently-executing Plan 183-03's interleaved commits touching `components/pdf/*` and `lib/estimate/document/tokens.ts` — no transient same-wave tsc errors were observed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The one shared, widened signature query and `DocumentSignature` type are now available to Plan 183-05 (webview) and Plan 183-06 (PDF templates), which will consume `signature`/`isPercentageDiscount` in their JSX.
- `render-estimate-pdf.ts`'s type-cast pattern (`PDFComponent as ComponentType<EstimatePDFProps & { signature?: ... }>`) is a deliberate, documented placeholder — Plan 183-06 should add the real, permanent `signature?: DocumentSignature | null` field to `EstimatePDFProps` in both PDF component files once it owns them (Wave 3, after Plan 183-04 restructures them in Wave 2). The cast remains harmless if left in place.
- No blockers.

---
*Phase: 183-pdf-parity-content*
*Completed: 2026-07-28*

## Self-Check: PASSED

- FOUND: lib/queries/estimate-signature.ts
- FOUND: lib/estimate/discount-display.ts
- FOUND: tests/unit/estimate/discount-display.test.ts
- FOUND: .planning/phases/183-pdf-parity-content/183-02-SUMMARY.md
- FOUND commit: be33f778 (Task 1)
- FOUND commit: a5046960 (Task 2)
- FOUND commit: c55701a5 (Task 3)
