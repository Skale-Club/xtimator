---
phase: 182-shared-document-engine-send-path-fix
plan: 01
subsystem: estimate-document
tags: [typescript, i18n, vitest, react-pdf, static-grep-testing]

# Dependency graph
requires: []
provides:
  - "lib/estimate/document/model.ts — canonical document-model types (DocumentCompany, CompanyDefaults, DocumentClient, DocumentItem, DocumentSection, DocumentPhoto, EstimateDocumentData)"
  - "lib/estimate/document/labels.ts — LABELS (45-key DocumentLabels superset, en/pt/es) + LANG_INDICATOR"
  - "lib/estimate/document/format.ts — formatDate (local-midnight fix) + formatAddress + DATE_LOCALE"
  - "lib/estimate/document/tokens.ts — LETTER page geometry (612x792pt / 816x1056px) + ESTIMATE_DESIGN_TOKENS per template"
  - "State-tolerant label-parity test + committed snapshot + geometry static-grep test + import-boundary purity test"
affects: [182-02, 183-pdf-parity, 184-pagination]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure framework-agnostic shared module (lib/estimate/document/) with zero React/react-pdf/DOM imports, importable from both 'use client' components and server routes"
    - "State-tolerant regex-extraction test: branches per-file on whether a local label map still exists, so a later plan deleting that map never requires editing the test and never creates an intra-plan red window"
    - "it.fails for known-red static-grep assertions — keeps CI green today while proving the documented defect exists; converts to plain it() once the defect is fixed"

key-files:
  created:
    - lib/estimate/document/model.ts
    - lib/estimate/document/labels.ts
    - lib/estimate/document/format.ts
    - lib/estimate/document/tokens.ts
    - tests/unit/estimate/document-format.test.ts
    - tests/unit/estimate/document-label-parity.test.ts
    - tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap
    - tests/unit/estimate/pt-px-conversion-source.test.ts
    - tests/unit/estimate/document-engine-boundary.test.ts
  modified: []

key-decisions:
  - "model.ts relocates ONLY the webview-side document-model types this phase; the two PDF files' local CompanyInfo/ClientInfo interfaces stay local (PDF-only optional fields + client.id gap) — full unification deferred to Phase 183 per the plan's explicit scope note"
  - "Geometry test declares estimate-document.tsx and estimate-editor.tsx assertions via it.fails since both still carry hand-copied 816/1056 literals today — proves the ENGINE-02 gap exists while keeping the commit green; Plan 182-02 converts both to plain it()"

patterns-established:
  - "Pattern 2 (superset-union label record): LABELS carries every key any of the 4 renderers use; each consumer destructures only what it renders"

requirements-completed: [ENGINE-01, ENGINE-02, ENGINE-03]

# Metrics
duration: 22min
completed: 2026-07-28
---

# Phase 182 Plan 01: Shared Document Engine Foundation Summary

**Created `lib/estimate/document/{model,labels,format,tokens}.ts` — one framework-agnostic source for document types, 45-key i18n labels, the local-midnight-fixed date/address formatters, and LETTER page geometry + per-template font tokens, proven against live renderer source by a state-tolerant test suite that survives Plan 182-02's renderer migration without ever being edited again.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-28T04:01:00Z (approx)
- **Completed:** 2026-07-28T04:23:23Z
- **Tasks:** 3
- **Files modified:** 9 (all new)

## Accomplishments
- `lib/estimate/document/model.ts` + `labels.ts` — pure types and the 45-key `LABELS` i18n record (en/pt/es) plus `LANG_INDICATOR`, transcribed verbatim from live renderer source
- `lib/estimate/document/format.ts` + `tokens.ts` — the FIXED `formatDate` (local-midnight normalization), `formatAddress`, and LETTER page geometry (612×792pt / 816×1056px) defined exactly once, plus per-template (`classic`/`modern`) font-family design tokens
- Wave-0 validation suite: a state-tolerant label-parity test (regex-extracts today's `DOC_LABELS`/`PDF_LABELS` from the 4 renderer files and diffs them against `LABELS` key-for-key; will automatically switch to an import-adoption check per file once Plan 182-02 deletes each local map, with zero edits to the test itself), a permanently-locking committed snapshot of `LABELS`' exact values, a static-grep geometry test (digit-boundary regex, `it.fails` on the two known-dirty files), and an import-boundary purity test proving zero React/react-pdf/`components/*` imports in the shared module

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/estimate/document/model.ts and labels.ts** - `baf0fdb0` (feat)
2. **Task 2: Create lib/estimate/document/format.ts and tokens.ts** - `8a6d685d` (feat)
3. **Task 3: Wave-0 validation tests** - `766b548a` (test)

_Note: Task 3 is `tdd="true"` in the plan, but since the target files already existed from Tasks 1-2 (RED→GREEN was effectively already crossed), it was executed as a single test-authoring commit that verified GREEN on first run — no separate RED commit was meaningful here since there was no implementation left to write._

## Files Created/Modified
- `lib/estimate/document/model.ts` - Canonical document-model types (DocumentCompany, CompanyDefaults, DocumentClient, DocumentItem, DocumentSection, DocumentPhoto, EstimateDocumentData), relocated verbatim from `estimate-document.tsx`
- `lib/estimate/document/labels.ts` - `LABELS: Record<EstimateLanguage, DocumentLabels>` (45-key superset of `DOC_LABELS`/`PDF_LABELS`) + `LANG_INDICATOR`
- `lib/estimate/document/format.ts` - `formatDate` (local-midnight fix), `formatAddress`, `DATE_LOCALE`
- `lib/estimate/document/tokens.ts` - `PT_PER_PX`/`PX_PER_PT`/`LETTER_WIDTH_PT`/`LETTER_HEIGHT_PT`/`LETTER_WIDTH_PX`/`LETTER_HEIGHT_PX` + `ESTIMATE_DESIGN_TOKENS`
- `tests/unit/estimate/document-format.test.ts` - formatDate/formatAddress behavior tests
- `tests/unit/estimate/document-label-parity.test.ts` - state-tolerant per-renderer label parity + union-of-keys + LANG_INDICATOR + permanent snapshot lock
- `tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap` - committed snapshot locking `LABELS`' exact values
- `tests/unit/estimate/pt-px-conversion-source.test.ts` - static-grep geometry-literal source-of-truth test (3 clean sources as `it()`, 2 dirty sources as `it.fails`)
- `tests/unit/estimate/document-engine-boundary.test.ts` - proves zero React/react-pdf/`components/*` imports across all 4 shared-module files

## Decisions Made
- Followed the plan's Claude's-discretion scope note exactly: `model.ts` does NOT fold in the two PDF files' local `CompanyInfo`/`ClientInfo` interfaces this phase (they carry PDF-only optional fields and the PDF call sites' `client` object lacks the `id` field `DocumentClient` requires) — deferred to Phase 183, no scope creep.
- No deviations from the plan's exact file contents were needed — all `read_first` source files matched the plan's transcribed content byte-for-byte (verified live before writing each shared file), so every label string, geometry constant, and font-family pair was copied as specified with zero corrections needed.

## Deviations from Plan

None — plan executed exactly as written. All read_first source files (estimate-document.tsx, estimate-pdf.tsx, estimate-pdf-modern.tsx, estimate-document-modern.tsx, estimate-editor.tsx, presentation-settings.ts, templates/registry.ts, resolve-estimate-language.ts) were read and verified to match the plan's transcribed content before each file was written.

## Issues Encountered
None. All three tasks passed verification on the first run: `npx tsc -p tsconfig.ci.json --noEmit` was clean throughout, and the Task 3 test run produced exactly the expected result (28 passed, 2 expected-fail via `it.fails`, 1 snapshot written) with no unexpected failures or errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `lib/estimate/document/{model,labels,format,tokens}.ts` is ready for Plan 182-02 to wire into all 4 renderers (`estimate-document.tsx`, `estimate-document-modern.tsx`, `estimate-pdf.tsx`, `estimate-pdf-modern.tsx`), deleting each renderer's local label map / formatAddress / formatDate / DATE_LOCALE copy.
- `tests/unit/estimate/document-label-parity.test.ts` requires ZERO edits from Plan 182-02 — its per-renderer branches self-adapt as each local map is deleted across Plan 182-02's task commits.
- `tests/unit/estimate/pt-px-conversion-source.test.ts`'s two `it.fails` entries (`estimate-document.tsx`, `estimate-editor.tsx`) are ready to be converted to plain `it()` by Plan 182-02 once those files reference `tokens.ts` instead of their hardcoded 816/1056 literals.
- No blockers. This plan touched zero files outside `lib/estimate/document/` and `tests/unit/estimate/` — verified via `git diff --stat` against the 9 expected new files only.

---
*Phase: 182-shared-document-engine-send-path-fix*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 9 created files verified present on disk (`lib/estimate/document/{model,labels,format,tokens}.ts`, `tests/unit/estimate/{document-format,document-label-parity,pt-px-conversion-source,document-engine-boundary}.test.ts`, `tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap`). All 3 task commits (`baf0fdb0`, `8a6d685d`, `766b548a`) verified present in `git log --oneline --all`.
