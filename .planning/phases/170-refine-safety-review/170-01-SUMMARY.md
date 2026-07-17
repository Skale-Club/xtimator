---
phase: 170-refine-safety-review
plan: 01
subsystem: ui
tags: [react, reducer, useReducer, diffing, jaccard-similarity, sonner, estimate-engine]

# Dependency graph
requires:
  - phase: 165-02
    provides: "editEpoch monotonic dirty-tracking (centralized dirty() helper) + MARK_SAVED's temp-id remap (idMap) + server-totals adoption, which APPLY_REFINEMENT's merge composes on top of; runSave's `Promise<boolean>` contract (true/false on lock/conflict/error) that onBeforeRefine reuses verbatim."
provides:
  - "lib/estimate/refine-merge.ts: pure mergeRefinement(current, refined) -> {mergedSections, diff} — the ONE util shared by the review dialog's preview and the reducer's apply."
  - "Two-pass item matching per section: pass 1 exact normalized-description match; pass 2 section-relative positional pairing of the leftovers under a token-overlap (Jaccard) similarity guard (>=0.25) — preserves id/created_at for a REWORDED line instead of classifying it as remove+add."
  - "RefineDiff: changed/added/removed line buckets + field-level flags (summary old/new, notes/timeline/payment_terms/warranty_terms booleans) so a narrative-only refine still renders a non-empty review."
  - "REFINE-01: RefineEstimateDialog's onBeforeRefine (== runSave) flush gate, awaited before the POST when isDirty; a failed flush aborts before the route is ever reached."
  - "REFINE-02: a post-POST review screen (Apply/Discard) computed from a LIVE currentContent ref (not a dialog-open snapshot) — the reducer's APPLY_REFINEMENT re-runs the SAME mergeRefinement on Apply, so what was reviewed is exactly what lands."
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared pure diff/merge util imported by BOTH a UI component (preview) and a reducer case (apply) via a type-only import back-reference (refine-merge.ts imports EditorItem/EditorSection/RefinementPayload as `import type` from use-estimate-reducer.ts, which in turn imports the runtime mergeRefinement function from refine-merge.ts) — safe because the type-only side is erased at compile time, so there is no runtime import cycle."
    - "Live-value-via-ref for an async callback that must observe post-await state: RefineEstimateDialog's currentContentRef is reassigned every render (`ref.current = currentContent`, same idiom as estimate-editor.tsx's stateRef) so the async `submit` body reads the POST-FLUSH content, not the value closed over when the callback was invoked."
    - "Jaccard token-overlap similarity as a cheap, dependency-free guard for positional-pairing disambiguation (only ever run over a section's already-pass-1-deduped leftovers, so the candidate set is small)."

key-files:
  created:
    - lib/estimate/refine-merge.ts
    - tests/unit/estimate/refine-merge.test.ts
    - tests/unit/workspace/refine-review.test.tsx
  modified:
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/refine-estimate-dialog.tsx
    - components/workspace/estimate/estimate-editor.tsx

key-decisions:
  - "Two-pass matching (not description-only): pass 1 handles verbatim-untouched/reordered/price-qty-only-changed rows by exact normalized description; pass 2 pairs the LEFTOVERS positionally (section-relative index) under a Jaccard similarity guard (threshold 0.25) so a REWORDED line — the case a refine most often produces — keeps its id/created_at instead of being torn down as remove+add. Below the guard, a pass-2 candidate pair is treated as an unrelated replace (removed+added), not force-matched."
  - "isManuallyEdited is preserved on a matched row when its unit_price is unchanged (cent-rounded compare) and reset to false only when the price actually changed — the AI echoing a price back verbatim must not silently un-pin a manual override it never touched."
  - "Advanced-pricing fields (taxable/tax_category/discount/cost/markup_pct) on a merged item use the SAME `refined-value ?? default` fallback the pre-existing APPLY_REFINEMENT used (not `refined ?? current ?? default`) — preserves the exact contract already documented there (the refine route already feeds the current per-item state into the AI's context, so the AI is expected to echo it back)."
  - "Section matching stays single-pass (exact normalized title only, no positional fallback) — a refine rewording an entire SECTION title is far rarer than rewording a line and was out of scope for v1 per the plan's interface."
  - "The changed-line diff entry's `description` field shows the NEW (refined) description, not the old one — RefineDiff has no separate oldDescription/newDescription pair, and the new description is what the user is being asked to confirm."
  - "The dialog's submit button is relabeled 'Preview changes' (was 'Apply changes') since it no longer applies directly — it now only produces the reviewable diff; the review screen's own button is 'Apply changes'. No test elsewhere asserted the old label (verified by grep before renaming)."
  - "`MergeCurrentContent`'s summary/notes/timeline/payment_terms/warranty_terms fields are typed `string | null` (not the interface sketch's literal `string`) to match the real `EstimateEditorState` shape those fields actually have — a direct fidelity match to what the plan itself required this util to consume, not a scope change."

requirements-completed: [REFINE-01, REFINE-02]

# Metrics
duration: ~45min
completed: 2026-07-17
---

# Phase 170 Plan 01: Refine Safety & Review Summary

**A shared pure `mergeRefinement` util (two-pass matching: exact description, then similarity-guarded positional pairing of leftovers) replaces refine's blanket temp-id regeneration and now backs both a pre-apply review diff (changed/added/removed + field-level flags) and a pre-POST flush gate, closing audit § G1-G3.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2/2 completed
- **Files modified:** 6 (3 new: 1 source + 2 test files; 3 modified source files)

## Accomplishments

- Closed audit G1 (refine read the PERSISTED estimate, ignoring/discarding unsaved editor edits): `RefineEstimateDialog` now awaits `onBeforeRefine` (== `runSave`) BEFORE the POST whenever the editor is dirty; a lock/conflict/error flush failure aborts before the route is ever reached (no stale-data refine, no silent discard)
- Closed audit G2 (`APPLY_REFINEMENT` regenerated EVERY section/item id as `temp-`, 100% row churn + `created_at` reset on the next save): `lib/estimate/refine-merge.ts`'s `mergeRefinement` two-pass matches refined items back onto the CURRENT rows — pass 1 exact normalized-description, pass 2 section-relative positional pairing of the leftovers guarded by Jaccard token-overlap similarity (>=0.25) — so untouched AND REWORDED rows keep their id/created_at; only genuinely new rows mint `temp-` ids, and dropped rows disappear
- Closed audit G3 (no review-before-apply): the dialog now shows a post-POST review screen (changed/added/removed line buckets with old→new prices, plus field-level summary/notes/timeline/payment_terms/warranty_terms flags so a narrative-only refine never renders an empty diff) with Apply/Discard — Discard is a true no-op (closes, no dispatch); Apply dispatches exactly the reviewed payload
- The SAME `mergeRefinement` util backs both the dialog's preview diff and the reducer's `APPLY_REFINEMENT` apply — what the user reviews is provably what lands (the plan's own key_link contract), verified end-to-end in `refine-review.test.tsx` by feeding the dialog's captured `onApply` payload through the REAL reducer and asserting row-id stability
- `isManuallyEdited` is preserved on a matched row when price is unchanged, reset only when it changed (Info 6) — the AI echoing an untouched manual price back no longer silently un-pins it
- `APPLY_REFINEMENT` keeps the single `editEpoch` bump 165-02 added (via the existing `dirty()` spread) — not dropped, not doubled
- Regression contracts intact: `refine/route.ts` untouched (167-01 credit gate + 164-02 lock guard + preview-only-no-DB-write all still in force); the dialog still renders only when `!isContentReadOnly`

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure merge/diff util (TDD, 16 tests: cases a-k + determinism)** - `90aa6ed6` (feat)
2. **Task 2: Reducer merge + dialog flush + review UI + editor wiring** - `0d833f75` (feat)

_Plan-metadata commit (this SUMMARY + REQUIREMENTS.md/STATE.md/ROADMAP.md) lands separately below._

## Files Created/Modified

- `lib/estimate/refine-merge.ts` (new) — pure `mergeRefinement(current, refined) -> {mergedSections, diff}`; two-pass item matching per matched section, single-pass section-title matching, field-level diff flags
- `tests/unit/estimate/refine-merge.test.ts` (new) — 16 tests covering the plan's mandated cases (a) price-only change, (b) added line, (c) removed line, (d) untouched line, (e) new section, (f) advanced-pricing carry-through (present + absent), (g) reordering, (h) THE key reworded-line case, (i) narrative-only refine + field flags, (j) isManuallyEdited preserve/reset, (k) genuine-replace below the similarity guard, plus a determinism smoke check
- `components/workspace/estimate/use-estimate-reducer.ts` — `APPLY_REFINEMENT` now calls `mergeRefinement` instead of the blanket `temp-` regeneration; keeps the existing single `dirty()` epoch bump
- `components/workspace/estimate/refine-estimate-dialog.tsx` — new props (`isDirty`, `onBeforeRefine`, `currentContent`, `currencyCode`); `onBeforeRefine` flush gate before the POST when dirty; post-POST `pendingReview` state computed via `mergeRefinement` against a live `currentContentRef`; a review screen (changed/added/removed + field flags) with Apply/Discard replacing the old immediate-apply flow; submit button relabeled "Preview changes"
- `components/workspace/estimate/estimate-editor.tsx` — wires `state.isDirty`, `onBeforeRefine={() => runSave()}`, live `currentContent` (sections + summary/notes/timeline/payment_terms/warranty_terms), and `currencyCode` into the dialog; `onApply` unchanged (still `dispatch({type:'APPLY_REFINEMENT', refined})`)
- `tests/unit/workspace/refine-review.test.tsx` (new) — 7 tests: flush-before-POST call ordering, clean-editor skips the flush, a FAILED flush aborts before any fetch call, the review screen renders changed/added/removed + field-level summary, Discard is a true no-op (no `onApply` call), Apply calls `onApply` with exactly the reviewed payload, and an end-to-end check that Apply's captured payload run through the REAL `useEstimateReducer` preserves item-1's and the reworded item-2's ids, drops item-3, and mints a `temp-` id for the genuinely new line

## Decisions Made

See `key-decisions` in the frontmatter above (two-pass matching + similarity threshold; isManuallyEdited preserve/reset rule; advanced-pricing fallback shape kept identical to the pre-existing code; section matching stays single-pass; changed-entry description shows the new value; submit-button relabel).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **`tests/unit/actions/recording-early-return-events.test.ts` has a pre-existing, unrelated failure** (`TypeError: supabase.from(...).select is not a function` in `lib/actions/recording.ts`), confirmed via `git stash` to reproduce identically on the pristine pre-170-01 tree — different action module, untouched file, out of scope. Same finding already documented in 165-02's SUMMARY.
- **`tests/unit/components/landing-page.test.tsx` failed once inside a full `npm test` run but passed cleanly in isolation** — a load-induced timeout flake under this shared multi-session environment, exactly the class of flake `vitest.config.ts`'s own comment documents (generous `testTimeout` "removes the flake without masking real hangs"). Not related to this plan (landing page, auth dialog — no file this plan touched).
- **REQUIREMENTS.md's traceability table and ROADMAP.md had a pre-existing documentation gap for Phases 166 and 169**: both were genuinely complete on disk (166: 2/2 SUMMARYs, AIREL-01..05 all individually checked `[x]`; 169: 2/2 SUMMARYs, CAPT-01..05 all individually checked `[x]`) but ROADMAP.md's `**Plans**: TBD` lines for both phases, and REQUIREMENTS.md's `CAPT-01..05 | 169 | Pending` traceability row, had never been updated — the same class of `roadmap update-plan-progress` tool gap documented in 165-01's SUMMARY (the tool won't overwrite a literal `TBD` line it doesn't recognize), just undiscovered until this milestone-closing plan needed an accurate 32/32 claim. Fixed manually (Rule 2 — required for the correctness of this plan's own deliverable): both ROADMAP.md `**Plans**` lines rewritten with each phase's actual per-plan summary + `**Phase N COMPLETE.**`, and the REQUIREMENTS.md traceability row corrected to `Complete`. Documentation-only, no code changed, sourced entirely from each phase's own existing SUMMARY files.
- One line-ending-only (LF/CRLF) diff briefly appeared on the unrelated, untouched `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` during the session (same shared-environment git-normalization artifact prior 165/167/168 SUMMARYs documented) — confirmed zero content diff (`git diff --ignore-space-at-eol` empty) and never staged by either task commit (explicit pathspecs used throughout, never `git add -A`).

## Next Phase Readiness

- **Phase 170 is now complete (1/1 plan) — REFINE-01 and REFINE-02 are both closed.**
- **Milestone v4.19 (Integrity & Reliability Hardening) is now fully shipped: 32/32 requirements complete across all 7 phases (164-170).**
- `lib/estimate/refine-merge.ts` is a general-purpose, dependency-free identity-preserving merge/diff primitive; reusable if a future milestone adds per-line accept/reject (FUT-03) on top of the same two-pass matching.
- Deferred, non-blocking finding for a future hygiene pass (not this milestone): the pre-existing `recording-early-return-events.test.ts` failure noted above (unrelated file, reproduces on the pristine pre-170-01 tree).

## Self-Check: PASSED

All created files confirmed on disk; both task commit hashes (`90aa6ed6`, `0d833f75`) confirmed present in `git log --oneline --all`.

---
*Phase: 170-refine-safety-review*
*Completed: 2026-07-17*
