---
phase: 162-estimate-document-consolidated-pass
verified: 2026-07-08T22:15:00Z
status: human_needed
score: 7/7 must-haves verified (code-level); 5 items pending owner UAT
human_verification:
  - test: "Playwright share.spec.ts visual-baseline regeneration"
    expected: "Owner runs `npx playwright test tests/e2e/visual/share.spec.ts --update-snapshots` locally after seeding SEED_ESTIMATE_TOKEN. Each PNG diff should be an alignment IMPROVEMENT (not a regression). Commit updated PNGs as a follow-up."
    why_human: "Runtime has SEED_ESTIMATE_TOKEN unset → tests test.skip unconditionally; also no live app server on PLAYWRIGHT_BASE_URL. Explicitly deferred to owner-local per 162-03 Task 3 fallback clause. Intentional artifact of the alignment pass per 162-RESEARCH pitfall #3."
  - test: "Alignment pass — visual check across languages at 3 viewports (DOCUX-05)"
    expected: "Open the share page for a seeded estimate in en / pt / es at 360 / 768 / 1440 px; visually confirm no accidental offset or clipping across company header, estimate title band, project/bill-to grid, summary, section headers, and line-item table."
    why_human: "Pixel-fidelity + typographic rhythm across language string-length variation cannot be grep-verified. Structural DOM snapshot (`document-alignment.test.tsx.snap`) covers the DOM shape but not visual density."
  - test: "Mobile line-item editor at 360 / 390 / 430 px viewports (DOCUX-06)"
    expected: "Open estimate editor at each viewport in iOS Safari / Android Chrome (or Chrome DevTools device toolbar). Confirm each row: no clipping, ≥44px tap targets, no glass-card wrapper, matches desktop table language."
    why_human: "Touch-target ergonomics + text-clipping at real device widths are human-eye evaluations; 44px WCAG 2.5.5 targets are RTL-asserted but real-thumb reachability is not."
  - test: "Bill To pencil + client-picker end-to-end (DOCUX-02)"
    expected: "Owner opens an estimate with a linked client → hovers Bill To → sees pencil affordance appear → clicks → sees ClientPicker Popover (billTo variant) → searches / switches / unlinks → confirms Bill To updates without page reload."
    why_human: "Requires live estimate + real client search + owner interaction across the linkProjectToClient / unlinkProjectFromClient server-action round-trip. Unit tests mock the server actions."
  - test: "Gear icon + settings panel end-to-end (DOCUX-01)"
    expected: "Owner opens editor → sees Gear icon on LEFT of pill (`[Gear] linkClientSlot Photos Send`) → clicks → panel opens (Popover ≥768px / Sheet <768px) → toggles each control group (Pricing / Document Sections / Client Presentation) → confirms server saves via next page reload (state persists). Also confirms the PRESENT-05 amber banner appears for sent/viewed estimates."
    why_human: "Requires live editor + tax/discount/deposit override interaction + saveEstimate round-trip + Supabase persistence. Unit tests cover the panel + caller wiring but not end-to-end persistence."
---

# Phase 162: Estimate Document Consolidated Pass — Verification Report

**Phase Goal (ROADMAP v4.18):** "The estimate document itself is fully overhauled in one internally-sequenced pass — a gear-triggered settings panel wired to the Phase 161 model, in-canvas Bill To editing through one consolidated client picker, a reconciled project-name inline-edit affordance, a full alignment pass, and mobile line-item parity with desktop — since 3 of the 4 seeds touch the same 2018-line `estimate-document.tsx` file."

**Verified:** 2026-07-08T22:15:00Z
**Status:** `human_needed`
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (from ROADMAP + REQUIREMENTS)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Gear icon opens a settings panel (Popover ≥768px / Sheet <768px) wired to the Phase 161 model | ✓ VERIFIED (code) / ? PENDING (E2E) | `presentation-settings-panel.tsx` created; `estimate-editor.tsx:466-482` dispatches `UPDATE_PRESENTATION_SETTINGS`; gear button at `estimate-floating-actions.tsx:61-70` |
| 2 | Bill To block gets in-canvas pencil affordance via consolidated ClientPicker | ✓ VERIFIED (code) / ? PENDING (E2E) | `estimate-document.tsx:1788-1791` renders `<ClientPicker variant="billTo">`; `client-picker.tsx` line 41 defines the 4-variant union |
| 3 | The four legacy client-picker implementations consolidate into ONE component | ✓ VERIFIED | `components/clients/client-picker.tsx` with 4 variants; `link-client-button.tsx` + `link-client-card.tsx` deleted; DOCUX-03 grep gate: 0 hits |
| 4 | Project-name inline-edit uses thin solid underline (no dotted) + ProjectTitle validation contract | ✓ VERIFIED | `estimate-document.tsx:1475` — `border-b border-transparent hover:border-foreground/40 focus-visible:border-foreground/40`; 0 `decoration-dotted` hits; `handleRenameProject` throws + toasts (Option B, line 282-283) |
| 5 | Full alignment pass unifies section padding + vertical rhythm | ✓ VERIFIED (code) / ? PENDING (visual UAT + Playwright regen) | `SECTION_PX = 'px-6 sm:px-10'` at `estimate-document.tsx:450`; 6 grep hits (1 def + 5 consumers); DOM snapshot committed at `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` |
| 6 | Mobile line-item editor matches desktop document-native language (no glass card) | ✓ VERIFIED (code) / ? PENDING (device UAT) | `item-card-mobile.tsx` — 0 `variant="glass"`; 1 `const INLINE_INPUT_CLS`; 4 `bg-transparent`; 3 `min-h-[44px]` |
| 7 | Confirmed-dead `section-card.tsx` + `item-row.tsx` removed | ✓ VERIFIED | Both files DELETED; cross-directory grep for `section-card\|item-row` returns 0 hits; also `price-badge.test.tsx` (sole external importer) DELETED |

**Score:** 7/7 code-level truths verified. 5 UAT items pending owner sign-off.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/clients/client-picker.tsx` | 4-variant consolidated picker (card/button/inline/billTo) with Unlink footer | ✓ VERIFIED | Line 41: `type ClientPickerVariant = 'card' \| 'button' \| 'inline' \| 'billTo'`; consumed by `client-tab.tsx:53`, `overview-tab.tsx:78`, `estimate-document.tsx:1788` |
| `components/workspace/estimate/presentation-settings-panel.tsx` | Popover/Sheet responsive gear panel with 3 control groups | ✓ VERIFIED | Created (~350 lines); GUARD-03 grep gates all zero (see below); imported + wired in `estimate-editor.tsx:18,466` |
| `components/workspace/estimate/estimate-floating-actions.tsx` | Gear button as LEFTMOST child of Pill | ✓ VERIFIED | Lines 61-70: `<Pill>{onOpenSettings && (<button ... aria-label="Settings"><Settings/></button>)} ...` |
| `components/workspace/estimate/estimate-editor.tsx` | settingsOpen state + panel render + UPDATE_PRESENTATION_SETTINGS dispatch + hasEstimateBeenSentOrViewed | ✓ VERIFIED | Line 216: `useState(false)`; line 466-482: panel JSX with all 5 wired props; line 275-287: handleRenameProject throws + toasts (Option B) |
| `components/workspace/estimate/estimate-document.tsx` | Resolver-driven visibility + Bill To pencil + InlineProjectName reconciled + SECTION_PX | ✓ VERIFIED | Line 373: `presentation_settings: PresentationSettings \| null`; line 450: `const SECTION_PX = 'px-6 sm:px-10'`; line 1475: thin-solid border-b affordance; line 1788-1791: billTo ClientPicker |
| `components/workspace/estimate/item-card-mobile.tsx` | Doc-native rebuild — no glass card, INLINE_INPUT_CLS, 44px targets | ✓ VERIFIED | 0 `variant="glass"`; 1 `const INLINE_INPUT_CLS`; 4 `bg-transparent`; 3 `min-h-[44px]` |
| `components/share/estimate-view.tsx` | presentation_settings threaded through classic share renderer | ✓ VERIFIED | Line 157-158: `presentation_settings: (estimate as ...).presentation_settings ?? null` |
| `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` | Post-alignment mode="view" DOM baseline | ✓ VERIFIED | File exists; captured in commit `7c384426` (162-03 Task 3 GREEN) |
| 7 Wave-0 test files (63 assertions) | All 7 files exist with 0 remaining `it.todo` markers, 63 real `it(...)` blocks | ✓ VERIFIED | client-picker (9) + document-bill-to (7) + presentation-settings-panel (11) + estimate-floating-actions (6) + inline-project-name (12) + document-alignment (9) + mobile-line-item (9) = 63 real its, 0 todos |

### GUARD-03 Static Verification (STRICT)

Target file: `components/workspace/estimate/presentation-settings-panel.tsx`

| Grep Pattern | Expected | Actual | Status |
|--------------|----------|--------|--------|
| `UPDATE_TAX_RATE\|UPDATE_DISCOUNT\|UPDATE_DEPOSIT` | 0 | 0 | ✓ PASS |
| `recalculate\|compute-totals` | 0 | 0 | ✓ PASS |

**GUARD-03 verdict:** The panel file carries ZERO references to the forbidden reducer actions AND ZERO imports from the totals engine. The dispatch boundary lives exclusively at the caller (`estimate-editor.tsx:470-475`) which emits the single `UPDATE_PRESENTATION_SETTINGS` write.

### Atomic Retirement Static Verification (STRICT)

Target file: `components/workspace/estimate/estimate-document.tsx`

| Grep Pattern | Expected | Actual | Status |
|--------------|----------|--------|--------|
| `AddDetailsPopover` | 0 | 0 | ✓ PASS |
| `\brevealed\b\|setRevealed` | 0 | 0 | ✓ PASS |
| `toggleField\|isFieldVisible\|OptionalFieldKey` | 0 | 0 | ✓ PASS |

**Atomic-retirement verdict:** ALL six retired identifiers (AddDetailsPopover component + `revealed` Set + `setRevealed` setter + `toggleField` closure + `isFieldVisible` closure + `OptionalFieldKey` type) are gone in a single commit (`2fe93bf1`) alongside the resolver switch. PITFALLS #1 + #8 discipline satisfied — no parallel-mechanism window.

### Client-Picker Consolidation Static Verification (STRICT)

| Grep | Expected | Actual | Status |
|------|----------|--------|--------|
| `grep -rE 'LinkClientInline\|LinkClientButton\|LinkClientCard' components/ app/ lib/ \| grep -v 'client-picker.tsx'` | (empty) | (empty) | ✓ PASS |

**Consolidation verdict:** Zero external references to any of the three retired names outside the consolidated picker file. Delete-outright discipline (no re-export shims) held.

### Dead-Code Deletion Static Verification (STRICT)

| File | Expected | Actual | Status |
|------|----------|--------|--------|
| `components/workspace/estimate/section-card.tsx` | DELETED | DELETED | ✓ PASS |
| `components/workspace/estimate/item-row.tsx` | DELETED | DELETED | ✓ PASS |
| `tests/unit/estimate/price-badge.test.tsx` | DELETED | DELETED | ✓ PASS |
| `grep -rE 'section-card\|item-row' components/ app/ lib/ tests/` | (empty) | (empty) | ✓ PASS |

Additionally verified deleted (from 162-02 scope):
| File | Expected | Actual | Status |
|------|----------|--------|--------|
| `components/workspace/link-client-button.tsx` | DELETED | DELETED | ✓ PASS |
| `components/workspace/link-client-card.tsx` | DELETED | DELETED | ✓ PASS |

### Resolver Primacy Cross-Check (162-04 Deviation Defensibility)

162-04 documents a Rule-1 deviation: the layered `(isEditable || data[field] != null)` clause on top of `isSectionVisible(resolvedSettings, key)` per section (5 occurrences in `estimate-document.tsx`).

**Is the resolver still the ONE source of truth for section visibility?**

Grep evidence on `estimate-document.tsx`:
- `resolvePresentationSettings` = 5 occurrences
- `isSectionVisible(resolvedSettings, ...)` = 7 call sites (6 sections + hasTerms composition)
- `presentation_settings: PresentationSettings | null` = 1 (interface declaration)
- `isEditable || data[.] != null` fallback = 5 (matching resolver calls per section)

**Verdict: DEFENSIBLE.** The resolver is still the primary gate. The layered check is:
1. **Additive, not substitutive.** If `isSectionVisible(...)` returns FALSE, the section is hidden unconditionally — the fallback never runs.
2. **Content-nullability, not owner-preference.** The fallback only engages when the resolver says TRUE, and only in view mode with null content. In edit mode, the resolver is the sole gate.
3. **Symmetric to `visibleSections` line-item filter.** The document surface already suppresses empty line-item sections in view mode — the fallback extends the same rendering optimization to legacy estimates whose `presentation_settings` is null (100% of pre-Phase-162 rows).
4. **Necessary for byte-identical share-page regression preservation.** Executing the plan literally would flip every empty labelled section from "auto-hidden" to "visible-with-empty-label" for every pre-Phase-162 estimate — an immediate silent share-page regression for existing customers.

`presentation_settings` remains the sole owner-driven override state; content-nullability is a rendering optimization that composes with it. PRESENT-04's "one place decides visibility" invariant holds — the resolver is that one place, and its output is what the fallback gates on.

### Requirements Coverage

| Req | Source Plan | Description | Status | Evidence |
|-----|-------------|-------------|--------|----------|
| **DOCUX-01** | 162-04 | Gear icon → PresentationSettingsPanel (Popover ≥768px / Sheet <768px) exposing Pricing / Sections / Client-Presentation controls | ✓ SATISFIED (code) / ? UAT PENDING | `presentation-settings-panel.tsx` (350 lines, 3 fieldset groups, matchMedia branch); `estimate-floating-actions.tsx:61-70` gear leftmost; `estimate-editor.tsx:466-482` GUARD-03 caller boundary; 17/17 panel + floating-actions unit tests green; GUARD-03 grep gates all zero |
| **DOCUX-02** | 162-02, 162-03 | Bill To in-canvas pencil affordance (hover/focus reveal) → compact ClientPicker Popover → link/switch/unlink | ✓ SATISFIED (code) / ? UAT PENDING | `estimate-document.tsx:1788-1791` renders `<ClientPicker variant="billTo" currentClientId={client.id ?? null}>`; group-scoped hover/focus reveal; `DocumentClient.id: string` widened end-to-end (interface + overview-tab + estimate-view + share.ts); 7/7 document-bill-to tests green |
| **DOCUX-03** | 162-02 | Legacy `LinkClientInline` / `LinkClientButton` / `LinkClientCard` (+ inline block in estimate-document.tsx) consolidated into ONE shared component | ✓ SATISFIED | `components/clients/client-picker.tsx` created with 4-variant union; `link-client-button.tsx` + `link-client-card.tsx` DELETED (no shims); dead inline `LinkClientInline` + `ClientSearchList` block purged from estimate-document.tsx; DOCUX-03 grep gate returns 0 hits; 9/9 client-picker tests green |
| **DOCUX-04** | 162-03 | Project-name inline-edit uses thin solid `border-b` (not `decoration-dotted`) + reconciles ProjectTitle validation contract | ✓ SATISFIED | `estimate-document.tsx:1475` — `border-b border-transparent hover:border-foreground/40 focus-visible:border-foreground/40`; 0 `decoration-dotted` hits; `handleRenameProject` throws + toasts (Option B, `estimate-editor.tsx:275-287`); 12/12 inline-project-name tests green |
| **DOCUX-05** | 162-03 | Full alignment pass — `px-6 sm:px-10` across section-scoped surfaces + unified vertical rhythm | ✓ SATISFIED (code + DOM snap) / ? Playwright PENDING | `SECTION_PX` constant at `estimate-document.tsx:450`; 5 consumers via template interpolation; vertical rhythm unified (`py-6`, `py-6 sm:py-8`); DOM snapshot committed at `document-alignment.test.tsx.snap`; 9/9 alignment tests green; Playwright visual baselines DEFERRED to owner-local per plan permission (Task 3 fallback) |
| **DOCUX-06** | 162-05 | Mobile line-item editor matches desktop document-native table language (no `<Card variant="glass">`, transparent inputs, 44px targets) | ✓ SATISFIED (code) / ? viewport UAT PENDING | `item-card-mobile.tsx` — 0 `variant="glass"`, 0 Card imports, 1 `INLINE_INPUT_CLS` const, 4 `bg-transparent` inputs, 3 `min-h-[44px]` (trash button + Switch container + Switch label); doc-native `<div>` outer with `border-b border-border/50 last:border-b-0 even:bg-muted/20 px-6 sm:px-10`; 9/9 mobile-line-item tests green |
| **DOCUX-07** | 162-05 | Confirmed-dead `section-card.tsx` + `item-row.tsx` removed | ✓ SATISFIED | Both files DELETED atomically in commit `ed726f30`; also deleted sole external importer `tests/unit/estimate/price-badge.test.tsx`; cross-directory grep for `section-card\|item-row` in `components/ app/ lib/ tests/` returns 0 hits |

**Orphaned requirements check:** All 7 DOCUX-01..07 IDs declared in phase requirements are accounted for. Cross-referenced against REQUIREMENTS.md Phase-162 mapping — no ID appears in REQUIREMENTS.md's Phase 162 line that isn't claimed by one of the 5 plans.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test files load and report `it(...)` counts | `for f in tests/unit/{clients,components,estimate}/*.test.tsx; ...` | 63 real it()s / 0 todos across the 7 Wave-0 files | ✓ PASS |
| Deleted files gone from tree | `test -f {section-card,item-row,link-client-button,link-client-card,price-badge.test}.tsx` | All return DELETED | ✓ PASS |
| GUARD-03 grep zero | `grep -cE 'UPDATE_TAX_RATE\|UPDATE_DISCOUNT\|UPDATE_DEPOSIT\|recalculate\|compute-totals' presentation-settings-panel.tsx` | 0 | ✓ PASS |
| ClientPicker consumed at all 4 variant sites | `grep -rn 'ClientPicker' components/` | client-tab (card), overview-tab (button), estimate-document (billTo), client-picker.tsx (definition) | ✓ PASS |
| Full test suite (per plan self-checks) | Aggregate: 162-02 9/9, 162-03 28/28, 162-04 17/17, 162-05 9/9 = 63 plan-scoped tests green; 424 estimate+components regression green | Reported passing across all 5 SUMMARY self-checks | ✓ PASS (reported) |
| tsc CI-config clean | `npx tsc --noEmit -p tsconfig.ci.json` (per plan self-checks) | 0 non-test errors identical to baseline | ✓ PASS (reported) |

### Anti-Patterns Found

Full anti-pattern scan on the 8 modified/created source files across the 5 plans:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | (none flagged that alter goal achievement) | — | — |

Notes:
- Multiple in-code comments intentionally reference plan/requirement IDs (DOCUX-01/02/03/04/06, PRESENT-04/05, PITFALLS #1 #8, GUARD-03) as documentation — not TODO/FIXME markers, correctly classified as info-only.
- `return null` occurrences in `estimate-document.tsx` are legitimate view-mode empty-section suppressions after resolver + content-nullability check, not stub returns.
- Pre-existing test failures documented in `deferred-items.md` (warning-regressions on project-workspace.tsx dialog description; Windows parallel-import flakes on cleanup-route-auth / empty-output-guards / transcribe-fallback / company-action; integration test needing live Supabase) are NOT introduced by Phase 162 and are out of scope.

### Human Verification Required

Five items are gated to owner action rather than automated verification:

1. **Playwright visual-baseline regeneration** — 162-03 Task 3 fallback clause explicitly permits deferral. `SEED_ESTIMATE_TOKEN` unset in this runtime → `share.spec.ts:25` unconditional `test.skip`. Owner regenerates PNGs locally and sanity-checks that every diff is an alignment improvement, not a regression.

2. **Alignment visual UAT across 3 viewports × 3 languages** (DOCUX-05, from 162-VALIDATION.md Manual-Only table) — pixel fidelity across en/pt/es string-length variation is not grep-verifiable.

3. **Mobile line-item viewport UAT at 360 / 390 / 430 px** (DOCUX-06, from 162-VALIDATION.md Manual-Only table) — touch-target ergonomics + real-thumb reachability at real device widths.

4. **Bill To pencil + ClientPicker end-to-end owner flow** (DOCUX-02, from 162-VALIDATION.md Manual-Only table) — live estimate + real client search + linkProjectToClient / unlinkProjectFromClient round-trip.

5. **Gear icon + settings panel end-to-end owner flow** (DOCUX-01, from 162-VALIDATION.md Manual-Only table) — Pricing / Sections / Client-Presentation control interaction + saveEstimate round-trip + Supabase persistence + PRESENT-05 banner gate.

### Gaps Summary

**No code-level gaps.** All 7 DOCUX-01..07 requirements have satisfying artifacts in the tree; all 5 grep gates are zero; all 7 Wave-0 test files converted to real assertions (63 total, 0 remaining `it.todo`); all 5 deleted files confirmed gone from the tree; the 162-04 resolver-primacy deviation is defensible (additive content-nullability fallback, not resolver replacement).

The only outstanding items are the 5 owner UAT/deferred-regen items documented above — all pre-declared in `162-VALIDATION.md`'s Manual-Only Verifications table (4 items) plus the Playwright regen (1 item deferred per plan permission).

---

## Verdict Summary

**Phase 162 achieved its goal at the code level.** All seven DOCUX-01..07 requirements have concrete satisfying artifacts on disk; every strict static grep gate — GUARD-03 on the settings panel (0/0), atomic retirement of the six local-visibility identifiers on `estimate-document.tsx` (0/0/0), client-picker consolidation across `components/ app/ lib/` (empty), and dead-code deletion of `section-card.tsx` + `item-row.tsx` + `price-badge.test.tsx` (all DELETED + 0 external references) — is clean. The 162-04 layered `(isEditable || data[field] != null)` guardrail is defensible because it is additive to the resolver check (not a replacement): the resolver remains the sole owner-driven override state, and the fallback only engages in view mode with null content to preserve byte-identical share rendering for pre-Phase-162 estimates (`presentation_settings: null`). Sixty-three RTL assertions across seven test files back the seven requirements at the unit-test tier. The remaining five items (Playwright share.spec.ts baseline regen deferred to owner-local per 162-03 Task 3 permission; three visual/E2E UAT rows from `162-VALIDATION.md`'s Manual-Only Verifications table for DOCUX-01/02/05/06) are the phase's declared human-verification surface and are enumerated in the `human_verification` frontmatter rather than counted as gaps.

---

_Verified: 2026-07-08T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
