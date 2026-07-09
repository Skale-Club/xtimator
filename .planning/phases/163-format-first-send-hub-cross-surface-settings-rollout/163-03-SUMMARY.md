---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
plan: 03
subsystem: rendering
tags: [presentation-settings, cross-surface, resolver-rollout, pdf, whatsapp, plain-text, tdd]

# Dependency graph
requires:
  - phase: 161-presentation-settings
    provides: resolvePresentationSettings + isSectionVisible resolver (consumed at every render boundary)
  - phase: 162-presentation-settings-panel
    provides: classic renderer's Phase 162 gates (summary/payment_terms/timeline/warranty_terms/notes/photos) — Wave 2 closes the 'sections' gap left open at estimate-document.tsx:1602
  - phase: 163-01
    provides: Wave 0 cross-surface parity + structural-grep test (RED→GREEN target)
provides:
  - All 6 render/format sources import resolvePresentationSettings and gate output on isSectionVisible
  - Line-items block at classic estimate-document.tsx:1602 now WRAPS existing empty-item filter with isSectionVisible('sections')
  - buildItemsBreakdown widened with optional trailing resolvedSettings? arg
  - formatEstimateForWhatsApp widened with optional trailing presentation_settings? arg (no signature-object migration)
  - Wave 0 cross-surface test transitions RED → GREEN across all 4 `it` blocks
  - Two Wave 0 @ts-expect-error markers removed (grep count = 0)
affects:
  - 163-04-PLAN.md (SendHubDialog — reads presentation_settings unchanged; hub's per-format render calls now go through resolver-gated renderers automatically)
  - 163-05-PLAN.md (delivery-action wiring — no dependency on this plan's changes)
  - 163-06-PLAN.md (deletion sweep — plain-text-sheet + send-actions-menu got interim resolver plumbing; both still on the delete list, plumbing is throwaway)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver call at the render boundary (Phase 162 precedent extended to 5 more surfaces): one resolvePresentationSettings call at the top of each render function; no per-block or per-loop calls; downstream gates read `resolvedSettings` in scope."
    - "Cast-with-fallback for query-type-lagging fields (Phase 161 pattern): `(estimate as { presentation_settings?: unknown }).presentation_settings` in PDF renderers whose prop type (EstimateWithSections) doesn't yet advertise the field — dormant-first-safe."
    - "WRAP not REPLACE for line-items filter: the existing empty-item filter stays intact; the new isSectionVisible gate is a peer wrapper (ternary in classic-document, `&&` in PDF chains). Zero byte-shift on the retrocompat path."
    - "Trailing optional arg for pure formatters (Pitfall 4 avoidance): `formatEstimateForWhatsApp(..., presentation_settings?)` — no signature-object migration; existing callers omit the arg and resolve to defaults."

key-files:
  created: []
  modified:
    - components/workspace/estimate/estimate-document.tsx
    - components/share/estimate-document-modern.tsx
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx
    - lib/utils/estimate-template.ts
    - lib/whatsapp/formatter.ts
    - components/workspace/send/send-actions-menu.tsx
    - components/workspace/send/plain-text-sheet.tsx
    - tests/unit/estimate/presentation-settings-cross-surface.test.tsx

key-decisions:
  - "Modern-share `hasTerms` uses per-key isSectionVisible gates so the outer terms wrapper stays consistent with the inner blocks — no empty terms container renders when every gated term is invisible."
  - "PDF renderers use `isSectionVisible(...) && estimate.sections.map(...).map(...)` (short-circuit-to-nothing) instead of an isEditable-style ternary to zero — chosen because PDFs have no edit mode and the chain is already inline; wrapping in a ternary would inflate the diff without benefit."
  - "Plain-text buildItemsBreakdown returns '' when the toggle hides sections (not a placeholder like `[hidden]`) — matches the resolver contract's 'hidden = absent' semantics used by every other surface."
  - "Send-actions-menu + plain-text-sheet get interim resolver plumbing even though they retire in 163-06 — keeps the Wave 2 shipped state internally consistent (any preview generated during the 163-04..-06 rollout respects the estimate's settings)."

patterns-established:
  - "Every render/format function that takes an EstimateWithSections MUST cast-with-fallback for presentation_settings until the query type is widened. The structural-grep test in the cross-surface test file locks this at 6 files; adding a 7th renderer without the import fails CI."
  - "Terms wrapper conditionals in modern-share + both PDFs use per-key gates in the OR chain — pattern replicated across 3 files. Future renderers with a terms wrapper should follow this shape."

requirements-completed: [SENDHUB-04, SENDHUB-05]

# Metrics
duration: 13m 38s
completed: 2026-07-09
---

# Phase 163 Plan 03: Cross-Surface Presentation-Settings Resolver Rollout Summary

**All 6 render/format surfaces (classic PDF, modern PDF, classic share, modern share, plain-text template, WhatsApp formatter) now call `resolvePresentationSettings` at the render boundary and gate their output on `isSectionVisible`. The Phase 162 gap at `estimate-document.tsx:1602` is closed: the line-items block wraps the existing empty-item filter with `isSectionVisible(resolvedSettings, 'sections')` in the view-mode branch. The Wave 0 cross-surface test transitions from RED to fully GREEN across all 4 `it` blocks (parity A + B, retrocompat C, structural grep D). Both `@ts-expect-error` markers planted by 163-01 Task 2 are removed — the widened signatures make them TS2578-unused.**

## Performance

- **Duration:** 13m 38s
- **Started:** 2026-07-08T23:59:40Z
- **Completed:** 2026-07-09T00:13:18Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- **Task 1 (`935db7e3`)** — Closed the classic renderer line-items gap by wrapping (not replacing) the existing empty-item filter at `estimate-document.tsx:1602-1610` with `isSectionVisible(resolvedSettings, 'sections')` in the view-mode branch; the `isEditable` branch stays unwrapped per the Phase 162 editor-usability pattern. Wired `estimate-document-modern.tsx` with a resolver call at the top of `EstimateDocumentModern` and per-key gates on summary, sections, payment_terms, timeline, warranty_terms, notes, photos. Updated `hasTerms` to use per-key gates so the outer terms wrapper stays consistent with the gated inner blocks.
- **Task 2 (`bbdeda05`)** — Wired classic + modern PDF renderers (`estimate-pdf.tsx` + `estimate-pdf-modern.tsx`) with the cast-with-fallback resolver call and per-key gates on summary, sections, terms wrapper, and photos. Sections chain uses `isSectionVisible(...) && estimate.sections.map(...).map(...)` (short-circuit-to-nothing) to keep the diff minimal. Retrocompat proven: `presentation_settings: null` fixture in existing PDF byte-identity tests stays green (6/6).
- **Task 3 (`64830faf`)** — Widened `buildItemsBreakdown` with an optional trailing `resolvedSettings?: ResolvedPresentationSettings | null` arg (early-return `''` when sections hidden). Widened `formatEstimateForWhatsApp` with an optional trailing `presentation_settings?: PresentationSettings | null` arg (no signature-object migration per Pitfall 4). Sections loop gated on `isSectionVisible('sections')`. Updated interim call sites in `send-actions-menu.tsx` + `plain-text-sheet.tsx` to pass resolved settings. Removed both `@ts-expect-error` markers from the cross-surface test (they became TS2578-unused after the signature widening); updated the file header comment to reflect post-Wave-2 all-GREEN state.
- **Cross-surface test** transitions RED → GREEN across all 4 `it` blocks:
  - **Test A** (sections=false hides item description across all 6 surfaces): GREEN
  - **Test B** (summary=false hides summary across all 6 surfaces): GREEN
  - **Test C** (retrocompat: null → all 6 surfaces emit): GREEN
  - **Test D** (structural grep: all 6 sources import `resolvePresentationSettings`): GREEN
- **Hidden-regression guards all GREEN:** `estimate-pdf-totals` (3/3), `estimate-pdf-modern-totals` (3/3), `whatsapp/formatter` (all), `utils/estimate-template` (all) — 36/36 total.
- **Typecheck clean:** `npx tsc --noEmit -p tsconfig.ci.json` exits 0 across all three commits.
- **`@ts-expect-error` count** in `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` is now `0` (verified via grep).

## Task Commits

1. **Task 1: Close classic line-items gap + wire modern share** — `935db7e3` (feat)
2. **Task 2: Wire classic + modern PDF renderers** — `bbdeda05` (feat)
3. **Task 3: Wire plain-text + WhatsApp; remove @ts-expect-error markers** — `64830faf` (feat)

## Files Created/Modified

**Modified (9):**
- `components/workspace/estimate/estimate-document.tsx` — line-items gap closed at line 1602 (WRAP not REPLACE).
- `components/share/estimate-document-modern.tsx` — resolver import + resolvedSettings call + 7 per-key gates + hasTerms rewrite.
- `components/pdf/estimate-pdf.tsx` — resolver import + cast-with-fallback resolver call + 7 per-key gates + terms wrapper OR chain rewrite.
- `components/pdf/estimate-pdf-modern.tsx` — same pattern as classic PDF.
- `lib/utils/estimate-template.ts` — buildItemsBreakdown optional 2nd arg + early-return path.
- `lib/whatsapp/formatter.ts` — formatEstimateForWhatsApp optional 6th arg + sections-loop gate.
- `components/workspace/send/send-actions-menu.tsx` — passes resolved settings to buildItemsBreakdown at line 91.
- `components/workspace/send/plain-text-sheet.tsx` — same pattern at line 48.
- `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` — 2 @ts-expect-error markers removed + header comment updated.

## Decisions Made

- **WRAP not REPLACE at estimate-document.tsx:1602.** The existing empty-item filter is content-nullability logic that predates presentation-settings; the new resolver gate is orthogonal visibility logic. Nesting the filter inside a ternary that resolves to `[]` when the gate is off preserves both concerns without duplicating either.
- **isEditable branch stays unwrapped.** Phase 162 established that hiding sections in the editor makes the gear-panel toggle unusable (the owner can't see what they're hiding). Only view-mode (share + PDF) applies the resolver gate. The plan's grep gate on `isEditable ? data.sections` proves this branch survived the wrap.
- **Modern-share hasTerms uses per-key gates, not a resolver-agnostic `hasTerms`.** If the wrapper stayed as `data.payment_terms != null || ...`, the terms `<div>` would render when payment_terms is present but hidden — an empty container. The per-key OR chain matches the inner conditionals so the wrapper hides when every gated term is invisible.
- **PDF sections chain uses `isSectionVisible(...) && estimate.sections.map(...).map(...)`** rather than a ternary-to-empty-array. JSX renders `false` as nothing, the whole expression short-circuits when the gate is off, and the existing `.map(...).map(...)` chain stays byte-identical when the gate is on. Ternary would inflate the diff without behavior change.
- **buildItemsBreakdown returns `''` (not a placeholder) when sections are hidden.** Matches the resolver contract's absent-not-placeholder semantics: every other surface hides sections by emitting nothing, so plain-text must too.
- **send-actions-menu.tsx + plain-text-sheet.tsx get interim plumbing despite being on 163-06's deletion list.** Any preview generated during the 163-04..-06 rollout window respects the estimate's settings — no half-shipped state where the hub honors settings but its preview surfaces don't.
- **Header comment in the cross-surface test file rewritten to reflect the post-Wave-2 state.** The pre-Wave-2 comment described the file's expected RED behavior + `@ts-expect-error` markers; both are stale after this plan. Rewriting the comment also brings the grep count for `@ts-expect-error` down to 0 (the stale comment was the only remaining match).

## Deviations from Plan

None. The plan executed exactly as written — every task's action, acceptance criteria, and verification landed on first pass.

The header-comment update in `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` (removing the stale reference to `@ts-expect-error markers below`) was necessary to drive the grep count to 0 as the acceptance criterion requires. The plan's action step described removing the two directives; the header comment mentioned them by name in a paragraph describing the file's Wave 0 state. Rewriting that paragraph is an editorial follow-through on the same acceptance criterion — no scope change.

## Issues Encountered

- Windows line-ending warnings on staging (`LF will be replaced by CRLF`) — normal, no action needed.
- vitest snapshot rewrote `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` with a line-ending-only diff during Task 1's test run. `git checkout --` restored it; commit stayed clean.

## User Setup Required

None — Wave 2 is pure application code + tests. No environment variables, secrets, migrations, or dashboard configuration required.

## Next Phase Readiness

- **Wave 2 complete.** All SENDHUB-04 + SENDHUB-05 requirements met. Cross-surface parity is testable AND enforced (structural grep + runtime parity, two-layer defense).
- **163-04 (SendHubDialog UI)** — unblocked. The hub's per-format render calls (Online Estimate / PDF / Plain Text) now go through resolver-gated renderers automatically; the hub itself doesn't need to invoke `isSectionVisible` at all.
- **163-05 (delivery-action wiring)** — no dependency on this plan's changes; still gated on its Wave 0 RED scaffolds (`delivery-insert-format` + `send-estimate-format-fallback`).
- **163-06 (deletion sweep)** — still on track. `send-actions-menu.tsx` + `plain-text-sheet.tsx` are on the delete list; the interim resolver plumbing added in Task 3 is throwaway. When those files delete, the resolver imports go with them; the resolver contract lives in `lib/estimate/presentation-settings.ts` and is untouched.
- **No blockers.**

## Self-Check: PASSED

Verified via absolute-path existence + git-log grep + vitest sweep + tsc + grep counts:

- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/estimate/estimate-document.tsx` modified (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/share/estimate-document-modern.tsx` modified (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/pdf/estimate-pdf.tsx` modified (Task 2)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/pdf/estimate-pdf-modern.tsx` modified (Task 2)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/lib/utils/estimate-template.ts` modified (Task 3)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/lib/whatsapp/formatter.ts` modified (Task 3)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/send-actions-menu.tsx` modified (Task 3)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/plain-text-sheet.tsx` modified (Task 3)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/estimate/presentation-settings-cross-surface.test.tsx` modified (Task 3)
- FOUND: commits `935db7e3`, `bbdeda05`, `64830faf` in git log
- FOUND: 4/4 GREEN in `npx vitest run tests/unit/estimate/presentation-settings-cross-surface.test.tsx`
- FOUND: 36/36 GREEN in hidden-regression sweep (`estimate-pdf-totals` + `estimate-pdf-modern-totals` + `whatsapp/formatter` + `utils/estimate-template`)
- FOUND: `npx tsc --noEmit -p tsconfig.ci.json` exit 0
- FOUND: `grep -c '@ts-expect-error' tests/unit/estimate/presentation-settings-cross-surface.test.tsx` = 0
- FOUND: all 6 renderers have >=1 `resolvePresentationSettings` occurrence (2, 2, 5, 2, 3, 2)
- FOUND: `isEditable ? data.sections` still matches in `estimate-document.tsx` (isEditable branch preserved)

---
*Phase: 163-format-first-send-hub-cross-surface-settings-rollout*
*Completed: 2026-07-09*
