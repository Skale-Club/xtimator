---
phase: 182-shared-document-engine-send-path-fix
plan: 02
subsystem: estimate-document
tags: [typescript, react-pdf, i18n, vitest, refactor]

# Dependency graph
requires:
  - phase: 182-01
    provides: "lib/estimate/document/{model,labels,format,tokens}.ts — the shared document engine module"
provides:
  - "All 4 estimate document renderers (webview edit/view, share webview, Classic PDF, Modern PDF) now source labels, formatAddress, formatDate, and page/font tokens from lib/estimate/document/* — zero per-surface duplicate declarations remain"
  - "estimate-editor.tsx's page-mode wrapper also derives its geometry from tokens.ts (LETTER_HEIGHT_PX / LETTER_WIDTH_PX), closing the ENGINE-02 gap discovered live during 182-01"
  - "Both PDF StyleSheets reference ESTIMATE_DESIGN_TOKENS.classic/.modern for font family — ENGINE-03 per-template token layer established (full StyleSheet de-duplication deferred to Phase 183 / PDFPAR-01)"
affects: [183-pdf-parity, 184-pagination]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type re-export + local import pair: a file that both consumes shared types internally AND must keep re-exporting them for external import sites needs `import type {...} from 'module'` PLUS a separate bare `export type {...}` (not `export type {...} from 'module'`, which does not create a local binding under ECMAScript re-export semantics)"
    - "Geometry values move from Tailwind arbitrary-value classes (`min-h-[1056px]`, `max-w-[816px]`) to inline styles once the value must come from a shared JS constant — Tailwind cannot interpolate a JS constant into an arbitrary-value class string at build time"

key-files:
  created: []
  modified:
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - components/share/estimate-document-modern.tsx
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx
    - tests/unit/estimate/document-page-view.test.tsx
    - tests/unit/estimate/pt-px-conversion-source.test.ts

key-decisions:
  - "export type {...} from '...' does not create a usable local binding in the same file (ECMAScript re-export semantics) — fixed by adding a parallel `import type {...} from '@/lib/estimate/document/model'` alongside the bare `export type {...}` re-export in estimate-document.tsx, so its own internal usages (EstimateDocumentProps, sub-component prop types) keep compiling while the 13 existing downstream import sites keep resolving unchanged"
  - "ENGINE-03 partially delivered — per-template token layer established; structural de-duplication of the PDF template pair completes in Phase 183 (PDFPAR-01)"

requirements-completed: [ENGINE-01, ENGINE-02, ENGINE-03]

# Metrics
duration: 20min
completed: 2026-07-28
---

# Phase 182 Plan 02: Renderer Adoption of the Shared Document Engine Summary

**All 4 estimate document renderers plus the editor's page-mode wrapper now consume `lib/estimate/document/{model,labels,format,tokens}.ts` instead of five independently hand-copied label maps, formatters, and geometry literals — zero visible rendering change except the local-midnight date fix now correctly propagating to the 3 previously-buggy surfaces.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-28T04:24:00Z (approx)
- **Completed:** 2026-07-28T04:43:21Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `estimate-document.tsx`, `estimate-editor.tsx`, and `estimate-document-modern.tsx` (webview + share surfaces) adopt `LABELS`/`formatAddress`/`formatDate`/`LETTER_HEIGHT_PX`/`LETTER_WIDTH_PX` from the shared module — all local `DOC_LABELS`, `DATE_LOCALE`, `formatAddress`, `formatDate`, and the hand-copied `1056`/`816` page-geometry literals are deleted
- `estimate-document.tsx` re-exports `DocumentCompany`/`CompanyDefaults`/`DocumentClient`/`DocumentItem`/`DocumentSection`/`DocumentPhoto`/`EstimateDocumentData` from `lib/estimate/document/model.ts`, so all 13 existing downstream import sites keep resolving unchanged
- `estimate-pdf.tsx` (Classic) and `estimate-pdf-modern.tsx` (Modern) adopt `LABELS`/`LANG_INDICATOR`/`formatAddress`/`formatDate` from the shared module, and both `StyleSheet.create()` blocks reference `ESTIMATE_DESIGN_TOKENS.classic`/`.modern` for `fontFamily`/`fontFamilyBold` instead of bare `'Helvetica'`/`'Helvetica-Bold'`/`'Times-Roman'`/`'Times-Bold'` string literals (including the Modern file's header comment, which named the literals)
- Both Wave-0 `it.fails` geometry entries from Plan 182-01 (`estimate-document.tsx`, `estimate-editor.tsx`) flip to plain `it()` and pass — `tests/unit/estimate/pt-px-conversion-source.test.ts` now has zero `it.fails` entries and zero bare `612`/`792`/`816`/`1056` literals anywhere in any of the 5 renderer/editor files (including comments)
- `tests/unit/estimate/document-label-parity.test.ts` (Plan 182-01, state-tolerant by design) was never edited — it automatically switched all 8 per-renderer/lang branches plus the union-of-keys and `LANG_INDICATOR` checks from live-source extraction to import-adoption assertions as each local map was deleted, and stayed green throughout with zero intra-plan red window

## Task Commits

Each task was committed atomically:

1. **Task 1: Adopt the shared module in the two webview renderers + the editor's page-mode wrapper** - `370cdcfc` (feat)
2. **Task 2: Adopt the shared module in the two PDF renderers** - `74c2f29c` (feat)

**Plan metadata:** (this commit, following STATE/ROADMAP/REQUIREMENTS updates)

_Note: both tasks are `tdd="true"` in the plan, but since the failing/passing state was already established by Plan 182-01's Wave-0 tests (the two `it.fails` geometry entries + the state-tolerant label-parity test), each task was executed as a single commit that flipped the pre-existing RED/pending assertions to GREEN — no separate RED commit was meaningful here since the tests already existed and already encoded the expected pre/post-adoption behavior._

## Files Created/Modified
- `components/workspace/estimate/estimate-document.tsx` - Imports `LABELS as DOC_LABELS`, `formatAddress`, `formatDate`, `LETTER_HEIGHT_PX` from the shared module; re-exports the 7 document-model types from `lib/estimate/document/model.ts` (both imported AND re-exported, to keep both internal and external usages compiling); `pageView`'s `min-h-[1056px]` class moves to an inline `minHeight` style
- `components/workspace/estimate/estimate-editor.tsx` - `LETTER_PAGE_HEIGHT` now aliases `LETTER_HEIGHT_PX`; the page-mode wrapper's `max-w-[816px]` class moves to an inline `maxWidth` style driven by `LETTER_WIDTH_PX`
- `components/share/estimate-document-modern.tsx` - Deletes its own `DocLabels`/`DOC_LABELS`/`DATE_LOCALE`/`formatAddress`/`formatDate`; imports the shared equivalents
- `components/pdf/estimate-pdf.tsx` - Deletes its own `PdfLabels`/`PDF_LABELS`/`DATE_LOCALE`/`LANG_INDICATOR`/`formatAddress`/`formatDate`; imports the shared equivalents; `StyleSheet` font-family values reference `ESTIMATE_DESIGN_TOKENS.classic`; `fmtDate` calls `formatDate(s, language)` directly
- `components/pdf/estimate-pdf-modern.tsx` - Same adoption as Classic, plus its header comment reworded from naming `Times-Roman`/`Times-Bold` literally to `ESTIMATE_DESIGN_TOKENS.modern`
- `tests/unit/estimate/document-page-view.test.tsx` - Two geometry assertions rewritten from `className` checks (`min-h-[1056px]`) to inline-style checks (`root.style.minHeight`)
- `tests/unit/estimate/pt-px-conversion-source.test.ts` - `estimate-document.tsx` and `estimate-editor.tsx` moved from `DIRTY_SOURCES`/`it.fails` into `CLEAN_SOURCES`/`it()`; the now-empty `DIRTY_SOURCES` array and its loop are deleted

## Decisions Made
- `export type {...} from '@/lib/estimate/document/model'` (the plan's literal instruction) does not create a local type binding usable elsewhere in the same file under ECMAScript re-export semantics — confirmed live via `npx tsc -p tsconfig.ci.json --noEmit`, which failed with `TS2304: Cannot find name 'EstimateDocumentData'` etc. across `estimate-document.tsx`'s own `EstimateDocumentProps` interface and sub-component prop types. Fixed by adding a parallel `import type {...} from '@/lib/estimate/document/model'` next to the bare `export type {...}` re-export (no `from` clause on the export) — this satisfies both the file's internal usage and the 13 external downstream import sites, and `tsc` is clean after the fix.
- Followed the plan's ENGINE-03 scope note exactly: only the font-family token layer (`ESTIMATE_DESIGN_TOKENS.classic`/`.modern`) was wired into both PDF StyleSheets this phase. The remaining ~860-line byte-duplicated StyleSheet pair (padding, spacing, color values, JSX structure) is explicitly NOT de-duplicated here — that is Phase 183 (PDFPAR-01)'s job.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `export type {...} from '...'` does not create a local binding**
- **Found during:** Task 1 (estimate-document.tsx re-export of document-model types)
- **Issue:** The plan's literal instruction to replace the local type declarations with a bare `export type { DocumentCompany, ... } from '@/lib/estimate/document/model'` compiles fine as a re-export for EXTERNAL consumers, but does not introduce those names into the current file's own scope — every internal usage (`EstimateDocumentProps`, `SortableDocumentItemRow`'s `item: DocumentItem` prop, etc.) fails with `TS2304: Cannot find name`.
- **Fix:** Added a parallel `import type { DocumentCompany, CompanyDefaults, DocumentClient, DocumentItem, DocumentSection, DocumentPhoto, EstimateDocumentData } from '@/lib/estimate/document/model'` in the top import block, and kept a bare `export type { ... }` (no `from` clause) at the original declaration site so external import sites keep resolving.
- **Files modified:** `components/workspace/estimate/estimate-document.tsx`
- **Verification:** `npx tsc -p tsconfig.ci.json --noEmit` exits 0; all 13 downstream import sites of these types were not touched and continue to compile.
- **Committed in:** `370cdcfc` (Task 1 commit)

**2. [Process] Concurrent-agent file swept into an unscoped `git commit`**
- **Found during:** Task 1's commit step
- **Issue:** The very first `git commit --no-verify -m "..."` (issued without a trailing pathspec) committed all currently-staged files, not just the 5 files this plan's `git add` had just staged. The concurrent Wave-2 executor (Plan 182-04) had staged its own in-progress edit to `components/workspace/send/send-hub-dialog.tsx` in the same shared working tree at that moment, and it was swept into this plan's commit.
- **Fix:** Since nothing had been pushed, ran `git reset --soft HEAD~1` (no content loss — only moves the branch pointer back one commit, all changes remain staged/in the working tree), then `git restore --staged components/workspace/send/send-hub-dialog.tsx` to unstage it (leaving its working-tree edits intact and uncommitted for the other agent to commit under its own plan), then re-ran the commit with an explicit file-list pathspec (`git commit ... -- file1 file2 ...`). Task 2's commit used an explicit pathspec from the start as a precaution.
- **Files modified:** None beyond the git history correction (`send-hub-dialog.tsx`'s working-tree content was never touched by this fix).
- **Verification:** `git show --name-only HEAD` after the fix lists exactly this plan's 5 files; `git status --short` afterward shows `send-hub-dialog.tsx` still modified-but-unstaged, unchanged from before the incident.
- **Committed in:** `370cdcfc` (corrected commit)

---

**Total deviations:** 2 (1 auto-fixed blocking compile issue, 1 process correction for a multi-agent git race condition)
**Impact on plan:** Both were necessary corrections with zero scope creep — no plan-unrelated code changes were introduced, and the concurrent agent's in-progress work was fully preserved (uncommitted, as it should be) rather than either lost or wrongly attributed to this plan.

## Issues Encountered
None beyond the two deviations documented above, both resolved within the same task.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ENGINE-01 and ENGINE-02 are fully closed: all 4 renderers plus the editor's page-mode wrapper import labels/formatAddress/formatDate/page-geometry from `lib/estimate/document/*`; zero local duplicate declarations remain anywhere.
- ENGINE-03 is PARTIALLY delivered per the plan's explicit scope note: both PDF StyleSheets reference `ESTIMATE_DESIGN_TOKENS` for font family, but the full structural de-duplication of the byte-duplicated ~860-line PDF template pair (padding/spacing/color StyleSheet values, JSX structure) is NOT done here — it completes in Phase 183 (PDFPAR-01).
- `tests/unit/estimate/document-label-parity.test.ts` was never edited across either Wave-0 (182-01) or this plan (182-02) — it is now fully in its post-adoption state (all 4 renderers exercise the import-adoption branch) and remains a permanent regression guard (locked further by its committed `LABELS` snapshot).
- This plan is file-disjoint from the concurrent Wave-2 Plan 182-04 (`app/api/estimates/*`, `lib/whatsapp/pdf-delivery.ts`, `send-hub-dialog.tsx`) — no shared files were modified by this plan's commits. The wave-boundary full-suite run (`npx tsc -p tsconfig.ci.json --noEmit` + `pnpm vitest run tests/unit tests/eval`) after both Wave-2 plans land is the authoritative combined check, not yet run as part of this plan.
- No blockers.

---
*Phase: 182-shared-document-engine-send-path-fix*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 7 modified files verified present on disk (`estimate-document.tsx`, `estimate-editor.tsx`, `estimate-document-modern.tsx`, `estimate-pdf.tsx`, `estimate-pdf-modern.tsx`, `document-page-view.test.tsx`, `pt-px-conversion-source.test.ts`). Both task commits (`370cdcfc`, `74c2f29c`) verified present in `git log --oneline --all`.
