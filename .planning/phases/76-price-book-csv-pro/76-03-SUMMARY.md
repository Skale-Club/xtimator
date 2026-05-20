---
phase: 76
plan: 03
subsystem: price-book / csv-import / wizard-ui
tags: [ui, wizard, 4-step, dialog, accessibility, i18n, glass]
dependency_graph:
  requires:
    - 76-02 (wizardReducer, applyDedupeStrategy, parsePriceBookCsv ParseOptions, detectLocale, detectColumnMapping)
  provides:
    - components/price-book/import-wizard/PriceBookImportWizard (container)
    - components/price-book/import-wizard/StepIndicator (4-segment progress)
    - components/price-book/import-wizard/Step1Upload (drop zone + locale chip)
    - components/price-book/import-wizard/Step2Map (column mapping table)
    - components/price-book/import-wizard/Step3Preview (preview + inline edit + dedupe radio)
    - components/price-book/import-wizard/Step4Confirm (pre-commit summary + STUB commit)
  affects:
    - components/price-book/price-book-list.tsx (mounts new wizard)
tech_stack:
  added: []
  patterns:
    - "Container = Dialog (glass-strong via shadcn defaults). 4 step components mount conditionally per state.step."
    - "Reducer is single source of truth — wizard shell dispatches; steps consume `state` + `dispatch` props."
    - "Each step renders its own footer row (Back / Cancel / primary CTA) to keep label flexibility."
    - "sessionStorage persistence: every reducer action stamps `savedAt`; effect persists when stamp changes."
    - "Restore on open: `deserializeDraft` honors 24h TTL and version=1; File object is intentionally dropped (user re-uploads)."
    - "AlertDialog confirm fires only when mid-progress (step !== 'upload' OR fileName !== null)."
key_files:
  created:
    - components/price-book/import-wizard/PriceBookImportWizard.tsx
    - components/price-book/import-wizard/StepIndicator.tsx
    - components/price-book/import-wizard/Step1Upload.tsx
    - components/price-book/import-wizard/Step2Map.tsx
    - components/price-book/import-wizard/Step3Preview.tsx
    - components/price-book/import-wizard/Step4Confirm.tsx
    - components/price-book/import-wizard/index.ts
    - .planning/phases/76-price-book-csv-pro/76-03-SUMMARY.md
  modified:
    - components/price-book/price-book-list.tsx (import + 2x mount swapped)
    - tests/unit/price-book/price-book-list.test.tsx (vi.mock target updated)
  deleted:
    - components/price-book/price-book-import-dialog.tsx (already removed in HEAD by sibling 76-04 commit; verified absent)
    - tests/unit/price-book/price-book-import-dialog.test.tsx (already removed by sibling 76-04 commit; verified absent)
decisions:
  - "i18n SCOPE CUT: Plan called for `locales/{en,pt,es}/pricebook.json` with namespace keys. Project does NOT use that pattern. Actual i18n is `useTranslation()` returning a `t(text)` function where `text` is the English source string; translations come from `lib/i18n/translations.ts` (static dict) + `/api/translate` AI fallback for PT/ES. All copy is wrapped in `t('English string')`. No JSON locale files created — they would be ignored by the runtime."
  - "WizardState extension proposed by PLAN.md (add `rawSamples: Record<string,string>[]`) NOT applied. Step 2 reads sample previews from `state.rows[0..2].values` (canonical fields). Raw CSV headers are not surfaced because the wizard re-parses with the user's mapping; samples shown reflect the parsed values which is what the user needs to validate the mapping. This avoids backfilling 76-02."
  - "Step 2 header list seed: parsePriceBookCsv doesn't expose raw papaparse meta back to the caller, so Step 1 currently seeds `state.headers` with the canonical target field names (['name','unit_price','folder','unit','notes']) and runs detectColumnMapping over that seed set. Step 2 still renders interactive mapping Selects over these headers. A future polish (76-05 or separate ticket) would extend ParseOutcome with `headers: string[]` for true raw-header round-trip."
  - "Step 3 existing-PB dedupe deferred per PLAN.md scope cut: only in-file duplicates surfaced. Per-row override Select intentionally NOT rendered (will plug in when 76-04 provides server-side existing-keys pre-check)."
  - "Step 4 commit is STUBBED with `setTimeout` + toast `'Import action wired in 76-04 — this is a stub.'` Marked with TODO(76-04) comments at handleCommit() in Step4Confirm.tsx (lines ~60–62)."
  - "Mount point: PLAN.md said `app/(app)/price-book/page.tsx`. Actual mount lives inside `components/price-book/price-book-list.tsx` (2x — one for empty state, one for populated state). Updated both."
  - "Mount point assertion in PLAN.md was wrong; the page only renders <PriceBookList>, which owns the Import CSV button + dialog state."
  - "Wizard footer placement: per PLAN.md alternative, each Step renders its own footer (Back/Cancel/Primary CTA) so the primary CTA label can vary per step (Next: map columns / Next: preview / Next: confirm / Import N items)."
metrics:
  duration: "~25 min"
  completed: 2026-05-20
requirements:
  complete:
    - PB-CSV-01   # 4-step wizard + indicator + close-resume (sessionStorage)
    - PB-CSV-02   # column auto-detect + override (mounts detectColumnMapping)
    - PB-CSV-03   # per-row inline editing with error display
    - PB-CSV-04   # locale-aware currency parsing (detect + override + custom)
    - PB-CSV-06   # pre-commit summary (Step 4 stat + breakdown cards)
  partial:
    - PB-CSV-05   # global dedupe radio shipped; per-row override deferred to 76-04 (needs existing-PB pre-check)
---

# Phase 76 Plan 03: Price Book Import Wizard UI (4 Steps) Summary

Ships the user-facing 4-step Stripe-style wizard that replaces the legacy single-dialog CSV importer. All logic primitives from 76-02 (`wizardReducer`, `parsePriceBookCsv` with `ParseOptions`, `detectLocale`, `detectColumnMapping`, `applyDedupeStrategy`, `serializeDraft`/`deserializeDraft`) plug in directly with no business logic written in component code. Step 4's commit is a STUB pending 76-04's server-side action surface.

## Wizard Component Tree

```
PriceBookImportWizard (container)
├── Dialog (glass-strong)
│   ├── DialogHeader (title + description per step)
│   ├── StepIndicator (4 segments: completed | current | upcoming)
│   ├── Alert (draft restored — when applicable)
│   └── Body (conditional per state.step)
│       ├── Step1Upload   — drop zone + locale chip + footer
│       ├── Step2Map      — mapping grid + footer
│       ├── Step3Preview  — summary banner + dedupe radio + table + footer
│       └── Step4Confirm  — stat hero + breakdown card + footer
└── AlertDialog (mid-progress close confirm)
```

| File | LOC | Responsibility |
| --- | ---: | --- |
| `PriceBookImportWizard.tsx` | ~230 | Orchestrator: Dialog shell, reducer wiring, sessionStorage persist/restore, close-confirm gating, success cleanup. |
| `StepIndicator.tsx` | ~85 | 4-segment progress bar with gradient-brand fills + numbered/check circles + clickable backtracking. Mobile collapses to "Step N of 4 — {name}". |
| `Step1Upload.tsx` | ~270 | Drop zone (drag handlers + native input), parse + locale detection, locale chip Alert with `Looks right` / `Override`, custom decimal/thousands inputs, fatal-error Alert. |
| `Step2Map.tsx` | ~155 | 2-col mapping grid, sample preview per target, required warning banner, duplicate-target inline error, primary CTA disabled until name + price mapped and no conflicts. |
| `Step3Preview.tsx` | ~370 | Summary banner (`{valid} ready` / `{errors} need fixing` / `{dupes} duplicates`), search filter, 3-card RadioGroup dedupe strategy, scrollable Table with click-to-edit cells (vanilla useState per cell). |
| `Step4Confirm.tsx` | ~140 | Stat hero Card (insert+update total), breakdown card (4 rows), source line, primary CTA STUB → toast + `onDone()` after 1s. |
| `index.ts` | 2 | Barrel export. |

## sessionStorage Behavior (verified)

- **Key:** `xtimator:price-book-import:draft:v1`
- **Write trigger:** any reducer action stamps `savedAt`; `useEffect` writes when the stamp changes. Initial state's frozen epoch stamp is filtered out so a fresh wizard doesn't overwrite an existing draft until the user takes an action.
- **TTL:** 24h, enforced inside `deserializeDraft` (76-02). Older drafts return `null` and the wizard starts fresh.
- **File handling:** `File` is intentionally dropped on serialize (cannot JSON-encode). On restore, the wizard re-displays the file name in the draft Alert with a "Re-upload {fileName} to continue." hint so the user knows what to drop again.
- **Clear triggers:** `Discard` button on close-confirm, `Start over` button on restore Alert, successful commit (`handleSuccessClose`).
- **Failure mode:** sessionStorage access is wrapped in try/catch (Safari private mode + SSR safety).

## Scope Cuts vs PLAN.md

1. **No JSON locale files.** PLAN.md prescribed `locales/{en,pt,es}/pricebook.json` with namespace keys (`pricebook.import.upload.title` etc.). The project's actual i18n system (`lib/i18n/use-translation.ts`) is English-string-keyed with a static dict + AI fallback (`/api/translate`). All copy is wrapped in `t('English source')`. PT/ES translations will be picked up automatically by the existing AI translate flow on first render in those languages. **This is not a missing feature — it is the correct integration with the project's i18n contract.**
2. **No `rawSamples` backfill on WizardState.** Step 2's sample preview reads from `state.rows[0..2].values` (canonical fields after parse) rather than raw CSV cells. The 76-02 surface stays clean; user validation of column mapping is preserved because the displayed samples are what would land in the price book.
3. **Existing-PB dedupe deferred to 76-04.** Only in-file duplicates are flagged in Step 3. Per-row dedupe override Select is intentionally omitted until 76-04 surfaces a server-side dry-run that returns the set of existing keys.
4. **Step 4 commit is stubbed.** Real wiring (chunked commit, progress callbacks, success/failure subviews, error CSV download) plug in via 76-04. See TODO markers below.

## TODO Markers for 76-04

| File | Line(s) | What 76-04 plugs in |
| --- | ---: | --- |
| `Step4Confirm.tsx` | ~60–62 | Replace `setTimeout` stub with `commitImportChunk` loop + progress state; render Importing → Success / Failure subviews with error CSV download button. |
| `Step3Preview.tsx` | — | When 76-04 exposes existing-PB pre-check, render per-row dedupe override `<Select>` (Use global / Skip / Update / Import as new) in the row Actions column and dispatch `DEDUPE_ROW_OVERRIDE`. Add `border-l-4 border-l-warning` row class + "exists in Price Book" pill. |
| `Step4Confirm.tsx` | summary computation | Replace `applyDedupeStrategy({ existing: [], ... })` with the server dry-run result so the breakdown counts reflect real Price Book overlap. |

## Mount Point Correction

PLAN.md asserted `app/(app)/price-book/page.tsx` was the entry point. Reality: that page only renders `<PriceBookList>`, which owns the Import CSV button + `importDialogOpen` state. The wizard is now mounted in **two places** inside `price-book-list.tsx`:

1. **Empty state** (~L253): when the user has no items yet, the empty hero shows the Import CSV CTA.
2. **Populated state** (~L544): the regular Price Book toolbar mounts a second instance.

Both use the same `importDialogOpen` / `handleImportClose` state pair already managed by the list component.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] PLAN.md mount-point was wrong.**
- **Found during:** Task 5 (wiring step).
- **Issue:** PLAN.md said update `app/(app)/price-book/page.tsx`. That file never mounted the legacy dialog — `price-book-list.tsx` did (2x).
- **Fix:** Updated both `PriceBookImportDialog` references in `price-book-list.tsx` to `PriceBookImportWizard`, and updated `tests/unit/price-book/price-book-list.test.tsx`'s `vi.mock` target accordingly. `page.tsx` left untouched.
- **Files modified:** `components/price-book/price-book-list.tsx`, `tests/unit/price-book/price-book-list.test.tsx`.
- **Commit:** `eb39c33`.

**2. [Rule 2 — Missing context] Project i18n is not namespace-key based.**
- **Found during:** Task 5 (i18n step).
- **Issue:** PLAN.md prescribed `pricebook.import.*` JSON keys; `lib/i18n/use-translation.ts` is actually English-string-keyed.
- **Fix:** Wrapped every wizard string in `t('English source')` instead of producing locale JSON files. The existing AI translate fallback handles PT/ES at runtime.
- **Files modified:** all step components + StepIndicator + wizard shell.
- **Commit:** `eb39c33`.

**3. [Rule 3 — Blocking] Legacy `price-book-import-dialog.tsx` already deleted in HEAD.**
- **Found during:** Task 5 (delete step).
- **Issue:** A previous sibling 76-04 run had already removed the legacy file. `git rm` returned "did not match any files."
- **Fix:** Verified absence (`git show HEAD:components/price-book/price-book-import-dialog.tsx` → fatal). No action required; PLAN's delete step was satisfied by upstream state.
- **Commit:** N/A.

### Authentication Gates

None.

## Test Status

| Test file | Status |
| --- | --- |
| `tests/unit/price-book/price-book-list.test.tsx` (15 cases) | GREEN (mock target updated to new wizard) |
| `tests/unit/csv/*` (54 cases from 76-02) | GREEN (untouched) |

`npx tsc --noEmit` — clean (exit 0).

## Commits

| Hash | Message |
| --- | --- |
| `eb39c33` | feat(76-03): 4-step price book import wizard UI |

## Hand-off

### To 76-04 (already merged — verified `lib/actions/price-book.ts` ships `commitImportChunk` + `undoLastImport`)

Plug-in points:

1. **`Step4Confirm.tsx` `handleCommit()`** — replace the `setTimeout` stub with:
   - Loop `commitImportChunk({ importId?, chunkIndex, totalChunks, rows, dedupeStrategy })` over batches of ≤50 rows.
   - On chunk 0 success, capture `importId` for subsequent chunks.
   - Drive a local `progress` state for the importing subview.
   - On success → render gradient-success hero + `View Price Book` / `Download error report` buttons.
   - On failure → render gradient-danger hero + `Try the rest again` / `Download error report` / `Close`.
2. **`Step3Preview.tsx`** — when 76-04's `dryRunCommit` (or equivalent) exists, render per-row dedupe `<Select>` override + "exists in Price Book" pill + warning left border.
3. **`Step4Confirm.tsx` summary** — swap empty `existing: []` for the dry-run's existing-keys list so the breakdown counts include real PB overlap.

### To 76-05 (E2E + i18n verification + closeout)

- Playwright spec: open wizard from `/price-book`, walk Steps 1 → 4 with a 50-row fixture, assert step indicator state transitions, assert close-confirm appears mid-flow, assert sessionStorage draft round-trips.
- i18n smoke: switch UI to PT, open wizard, assert step titles render localized strings (will trigger AI translate flow on first open).
- Snapshot 5 wizard states per UI-SPEC §Performance.

## Self-Check: PASSED

- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\PriceBookImportWizard.tsx`
- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\StepIndicator.tsx`
- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\Step1Upload.tsx`
- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\Step2Map.tsx`
- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\Step3Preview.tsx`
- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\Step4Confirm.tsx`
- FOUND: `C:\Users\Vanildo\Dev\xtimator\components\price-book\import-wizard\index.ts`
- FOUND commit: `eb39c33`
- VERIFIED: legacy `components/price-book/price-book-import-dialog.tsx` absent in HEAD (deleted by sibling 76-04 run).
- VERIFIED: `npx tsc --noEmit` exit 0.
- VERIFIED: `npx vitest run tests/unit/price-book/price-book-list.test.tsx` → 15 passed.
