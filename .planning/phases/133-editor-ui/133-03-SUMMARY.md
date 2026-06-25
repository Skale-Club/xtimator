---
phase: 133-editor-ui
plan: 03
subsystem: estimate-editor
tags: [editor, deposit, balance-due, i18n, reducer, totals-panel, PUI-01]
requires:
  - "133-01: saveEstimate accepts deposit_type/deposit_value + recomputes balance_due (computeEstimateTotals)"
  - "133-02: per-line discount/taxable controls + EstimateDocumentData per-line carry"
provides:
  - "Editor totals panel deposit control (none/percent/amount) + Balance Due line"
  - "Reducer deposit state + UPDATE_DEPOSIT action + preview deposit/balance_due math"
  - "Converters thread deposit_type/deposit_value into the saveEstimate payload"
  - "i18n labels deposit/depositNone/depositPct/depositAmount/balanceDue (en/pt/es)"
affects:
  - components/workspace/estimate/use-estimate-reducer.ts
  - components/workspace/estimate/estimate-document.tsx
  - components/workspace/estimate/estimate-editor.tsx
  - components/share/estimate-view.tsx
tech-stack:
  added: []
  patterns:
    - "Optimistic reducer preview mirrors the server engine math byte-for-byte (GUARD-03)"
    - "Wide reducer string narrowed to the engine domain ('none'|'percent'|'amount') at the save boundary"
    - "Deposit row reuses the discount row's shadcn Select + MoneyInput / percent-input idiom"
key-files:
  created: []
  modified:
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - components/share/estimate-view.tsx
decisions:
  - "Deposit type domain LOCKED to 'none'|'percent'|'amount' (DB CHECK + engine), distinct from discount's 'percentage'|'fixed' — never conflated"
  - "Save payload sends deposit_type/deposit_value ONLY; server recomputes balance_due (server authoritative, GUARD-03)"
  - "Share-view fed retrocompat deposit defaults to avoid a crash; full share-doc deposit rendering deferred to Phase 134"
metrics:
  duration: ~5m
  completed: 2026-06-25
  tasks: 3
  files: 4
  commits: 3
---

# Phase 133 Plan 03: Editor Summary Panel — Deposit + Balance Due + i18n Summary

Added the deposit controls (none / percent / amount) and a Balance Due line to the estimate editor totals panel, wired through the reducer (preview math mirroring the server engine) and the converters into the `saveEstimate` payload, with i18n labels (en/pt/es). Completes PUI-01 — the editor now exposes per-line discount/taxable (Plan 02) + global discount + deposit controls, all recomputed server-side (Plan 01).

## What Shipped

- **Reducer** (`use-estimate-reducer.ts`): `EstimateEditorState` gains `deposit_type: string`, `deposit_value: number | null`, `deposit: number`, `balance_due: number`. New `UPDATE_DEPOSIT` action + case (mirrors `UPDATE_DISCOUNT`). `recalculate` computes the preview deposit (percent → `round2(total × value/100)`, amount → `round2(value)`, none → 0) and `balance_due = round2(total − deposit)`, mirroring `compute-totals.ts` L177-190 exactly. Both `initState` branches seed the fields; estimate branch reads the server row with casts; deposit defaults to `'none'` (retrocompat no-op).
- **Totals panel** (`estimate-document.tsx`): `EstimateDocumentData` widened with the four deposit fields. `DOC_LABELS` + `DocLabels` gain `deposit`/`depositNone`/`depositPct`/`depositAmount`/`balanceDue` in en/pt/es. After the grand total, a Deposit row (Select none/percent/amount + MoneyInput for amount / percent `<input>` for percent, showing `-fmt(deposit)` when > 0) and a Balance Due line that renders only when a deposit is set. Deposit `'none'` → no value input, no Balance Due line → byte-identical to today.
- **Converters** (`estimate-editor.tsx`): `stateToDocumentData` carries the deposit preview to the panel; `stateToSavePayload` sends `deposit_type`/`deposit_value` only (server recomputes `balance_due`). Reducer's wide `string` narrowed to the engine domain at the save boundary.
- **Share view** (`estimate-view.tsx`): fed retrocompat deposit defaults so the now-required `EstimateDocumentData` fields are satisfied without crashing; view-mode Balance Due stays hidden (`balance_due === total`) until Phase 134 renders the full share-doc deposit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Share view constructor needed the new required fields**
- **Found during:** Task 2 (widening `EstimateDocumentData`)
- **Issue:** `components/share/estimate-view.tsx` also builds an `EstimateDocumentData`; widening the interface made it fail tsc (missing deposit fields). Not listed in `files_modified`.
- **Fix:** Seeded the four deposit fields with retrocompat reads/defaults (`deposit_type` → 'none', `balance_due` → total). Keeps the share view byte-identical (Balance Due hidden) until the Phase-134 full render.
- **Files modified:** components/share/estimate-view.tsx
- **Commit:** 3287b24b

**2. [Rule 3 - Blocking] Narrow deposit_type at the save boundary**
- **Found during:** Task 3 (tsc on estimate-editor.tsx)
- **Issue:** `SaveEstimateInput.deposit_type` is the narrow union `'none'|'percent'|'amount'|null`, but the reducer field is `string` — TS2345 on the `saveEstimate` call.
- **Fix:** Cast `state.deposit_type as 'none' | 'percent' | 'amount'` in `stateToSavePayload` (the engine + DB CHECK enforce the domain; the Select only emits these three values).
- **Files modified:** components/workspace/estimate/estimate-editor.tsx
- **Commit:** f78f14ac

## Deferred Issues (out of scope — pre-existing)

Two tsc errors exist on the clean tree before this plan (confirmed via `git stash`), in test files this plan did not touch:
- `tests/unit/ai/refine-shared-prompt.test.ts(49,78)` — regex flag requires es2018 target.
- `tests/unit/estimate/markup-totals.test.ts(14,37)` — `ComputeTotalsSection` shape mismatch.

Not introduced here; logged, not fixed.

## Mobile Verification (headless — code review)

- Deposit `Select` trigger uses `h-9` (matches the shadcn default trigger used elsewhere in the panel) — adequate tap target.
- Percent input: `inputMode="numeric"`. Amount input: `MoneyInput` (`inputMode="numeric"`, the established money component idiom).
- Deposit row reuses the discount row's `flex-1 min-w-0` + `shrink-0` structure (already renders responsively); Balance Due line uses `flex justify-between` inside the `max-w-xs` panel — no 360px overflow.
- Live in-browser iOS Safari / Android Chrome verification not performed (headless run); recommend a manual pass before release.

## Verification

- `npx vitest run tests/unit/estimate tests/unit/actions tests/unit/services` → 38 files / 233 tests passed.
- `npx tsc --noEmit` clean on all three touched source files (`use-estimate-reducer.ts`, `estimate-document.tsx`, `estimate-editor.tsx`) + `estimate-view.tsx`.

## Commits

- `26456c57` feat(133-03): deposit state + UPDATE_DEPOSIT action + preview math in reducer
- `3287b24b` feat(133-03): deposit Select + value input + Balance Due line in totals panel
- `f78f14ac` feat(133-03): wire deposit through document data + save payload converters

## Self-Check: PASSED

All four modified source files + SUMMARY.md exist; all three task commits present in history.
