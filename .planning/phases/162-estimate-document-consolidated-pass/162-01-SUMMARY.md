---
phase: 162-estimate-document-consolidated-pass
plan: 01
subsystem: testing

tags: [vitest, testing-scaffold, it-todo, wave-0, docux]

# Dependency graph
requires:
  - phase: 161-per-estimate-presentation-settings
    provides: "resolvePresentationSettings + UPDATE_PRESENTATION_SETTINGS reducer action (referenced in DOCUX-01 panel todos)"
provides:
  - "7 vitest test-file scaffolds under tests/unit/{clients,components,estimate}/ that map 1:1 to DOCUX-01..06 requirements in 162-VALIDATION.md"
  - "63 aggregated it.todo(...) placeholders that downstream plans (162-02..05) will convert to real RED assertions"
  - "162-VALIDATION.md nyquist_compliant + wave_0_complete flags flipped to true — the phase's Nyquist gate is unblocked"
affects: [162-02-client-picker-consolidation, 162-03-bill-to-and-inline-project-name, 162-04-gear-and-settings-panel, 162-05-mobile-line-item-parity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "it.todo(...) scaffolding as the Wave-0 pattern — files load cleanly under vitest without importing not-yet-existing modules, so downstream RED tests just replace `it.todo(...)` with real `it(...)` calls"

key-files:
  created:
    - tests/unit/clients/client-picker.test.tsx
    - tests/unit/estimate/document-bill-to.test.tsx
    - tests/unit/components/presentation-settings-panel.test.tsx
    - tests/unit/components/estimate-floating-actions.test.tsx
    - tests/unit/estimate/inline-project-name.test.tsx
    - tests/unit/estimate/document-alignment.test.tsx
    - tests/unit/estimate/mobile-line-item.test.tsx
  modified:
    - .planning/phases/162-estimate-document-consolidated-pass/162-VALIDATION.md

key-decisions:
  - "No dead imports — every scaffold file uses only `import { describe, it } from 'vitest'`; downstream plans (162-02..05) add the real component/module imports when they convert each `it.todo` to `it`"
  - "GUARD-03 static-grep tests documented as prose in scaffold comments (not as runtime assertions) — they live in downstream plans' acceptance criteria per 162-VALIDATION.md line 44"

patterns-established:
  - "Wave-0 test scaffolding: minimal `describe(...)` + `it.todo(...)` blocks that load cleanly under vitest, cost ~0 runtime, and give downstream plans exact file paths to target with `-t` filter arguments"
  - "Test-file frontmatter comments: every scaffold names the downstream plan that owns each todo cluster (162-02/03/04/05), so the RED→GREEN handoff is self-documenting"

requirements-completed: [DOCUX-01, DOCUX-02, DOCUX-03, DOCUX-04, DOCUX-05, DOCUX-06, DOCUX-07]

# Metrics
duration: 4min
completed: 2026-07-08
---

# Phase 162 Plan 01: Wave-0 Test Scaffolds Summary

**7 vitest scaffold files with 63 aggregated `it.todo(...)` placeholders — the Nyquist gate for Phase 162 is unblocked; downstream plans 162-02..05 can now drive RED→GREEN cycles against real file paths without any test-file authorship work of their own.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-08T19:46:57Z
- **Completed:** 2026-07-08T19:51:35Z
- **Tasks:** 3
- **Files modified:** 8 (7 created + 1 VALIDATION frontmatter flip)

## Accomplishments

- Created all 7 Wave-0 test files at the exact paths 162-VALIDATION.md's Per-Task Verification Map references — every `npx vitest run tests/unit/... -t "..."` command in the map is now runnable (prints todos instead of "file not found"), which is the Nyquist-gate precondition for the phase.
- Distributed 63 `it.todo(...)` placeholders across the 7 files exactly matching the plan spec: 9 (client-picker) + 7 (document-bill-to) + 11 (presentation-settings-panel) + 6 (estimate-floating-actions) + 12 (inline-project-name) + 9 (document-alignment) + 9 (mobile-line-item) = 63.
- Flipped `nyquist_compliant: false` → `true` and `wave_0_complete: false` → `true` in 162-VALIDATION.md frontmatter (lines 5-6), signaling downstream plans they can consume the map.
- Full 7-file vitest run: 63 tests reported as "todo" (test files "skipped" — vitest's semantics for a suite where every case is `.todo`), exit code 0, ~2.8s runtime — well within the phase's 20s per-task feedback-latency budget.

## Task Commits

1. **Task 1: Create client-picker + Bill To test scaffolds (DOCUX-02, DOCUX-03)** — `523b6da6` (test)
2. **Task 2: Create panel + floating-actions test scaffolds (DOCUX-01)** — `f336e0da` (test)
3. **Task 3: Create inline-project-name + document-alignment + mobile-line-item scaffolds + flip VALIDATION frontmatter (DOCUX-04/05/06)** — `20f88344` (test)

## Files Created/Modified

- `tests/unit/clients/client-picker.test.tsx` — 9 `it.todo`s covering the 4 variants (card/button/inline/billTo), link + unlink server actions, search filter, and CommandEmpty for the consolidated ClientPicker (DOCUX-02, DOCUX-03)
- `tests/unit/estimate/document-bill-to.test.tsx` — 7 `it.todo`s covering pencil hover/focus reveal, edit-mode gating, popover wiring, and the `DocumentClient.id` contract (DOCUX-02)
- `tests/unit/components/presentation-settings-panel.test.tsx` — 11 `it.todo`s covering the responsive Popover/Sheet branch, section-visibility Switch, Tax/Discount/Deposit RadioGroup wiring, GUARD-03 dispatch guard, the PRESENT-05 sent-or-viewed banner, and the tax-mode-off preservedRate contract (DOCUX-01)
- `tests/unit/components/estimate-floating-actions.test.tsx` — 6 `it.todo`s covering the leftmost gear button (order `[Gear] linkClientSlot Photos Send`), prop-gated render, aria-label, and Settings icon sizing (DOCUX-01)
- `tests/unit/estimate/inline-project-name.test.tsx` — 12 `it.todo`s covering the thin-solid `border-b` underline (replacing `decoration-dotted`), transparent-default + `foreground/40` hover/focus, and the full ProjectTitle validation contract (empty / >200 char / no-op / error retry / autofocus / escape / maxLength / aria-label / double-submit guard) for DOCUX-04
- `tests/unit/estimate/document-alignment.test.tsx` — 9 `it.todo`s covering section padding `px-6 sm:px-10` across all 5 nested surfaces, vertical rhythm on info grid / DocumentTotals / Terms, and a `mode="view"` DOM snapshot for DOCUX-05
- `tests/unit/estimate/mobile-line-item.test.tsx` — 9 `it.todo`s covering the no-glass-card invariant, `INLINE_INPUT_CLS` transparent inputs, 44px touch targets, row-structure classes, and props-signature parity for DOCUX-06
- `.planning/phases/162-estimate-document-consolidated-pass/162-VALIDATION.md` — flipped `nyquist_compliant` + `wave_0_complete` to `true` in frontmatter

## Decisions Made

- **No dead imports.** Every scaffold imports only `{ describe, it }` from vitest — not the not-yet-existing components (`components/clients/client-picker.tsx`, `components/workspace/estimate/presentation-settings-panel.tsx`, etc.). Downstream plans (162-02/03/04/05) add the real imports as they land the components. This keeps the scaffold files loadable today without touching component code that doesn't exist yet.
- **Comment-first ownership handoff.** Each scaffold file's top-of-file comment names the downstream plan that owns the todo cluster (162-02 for ClientPicker + Bill To, 162-03 for InlineProjectName + alignment, 162-04 for gear + settings panel, 162-05 for mobile line-item). Self-documenting RED→GREEN handoff without needing to cross-reference 162-VALIDATION.md every time.
- **GUARD-03 as static grep, not runtime assertion (in the plan).** Per 162-VALIDATION.md line 44, the "panel never dispatches UPDATE_TAX_RATE / UPDATE_DISCOUNT / UPDATE_DEPOSIT" invariant is enforced by a static grep in 162-04's acceptance criteria (not a runtime RTL assertion). The scaffold captures this in a comment above the corresponding `it.todo` and adds a parallel runtime `it.todo` for the future dispatch-spy test — belt-and-suspenders coverage without duplicating enforcement.

## Deviations from Plan

None - plan executed exactly as written. The plan-authored EXACT-content of each scaffold was written verbatim; the `it.todo(...)` counts, `describe(...)` block names, and vitest run outputs all match the plan's acceptance criteria and the aggregate 63-todo target.

### Note on `grep -c "it.todo"` acceptance criteria

Two of the plan's per-task `grep -c "it.todo"` numbers (Task 1 client-picker "= 9", Task 2 panel "= 11") were expressed as literal string counts — but the plan's own EXACT-content includes 2 additional occurrences of the literal string `it.todo` inside the top-of-file comments (`"convert these it.todo entries"` + `"Every it.todo maps"`) in `client-picker.test.tsx`, so a plain `grep -c "it.todo"` returns 11 there, not 9. The equivalent `grep -c "it\.todo("` (which is what the plan actually intended — counting real `it.todo(...)` calls) returns exactly 9 and 11 respectively, matching the plan's intent and the vitest run's own reported todo count. No test-file content was changed; the mismatch is a plan-authorship rounding on the grep pattern, not a deviation from the intended scaffold. All 7 files match the plan's EXACT-content verbatim.

## Issues Encountered

None — vitest happily loaded all 7 files, reported 63 todos, and exited 0 on every run (Task 1 pair, Task 2 pair, Task 3 triple, and the final full-7 verification). Pre-commit `gitleaks` scan clean on all 3 commits (0 leaks). LF→CRLF warnings from git on Windows are cosmetic and pre-existing across the repo.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **162-02 (ClientPicker consolidation)** can now start: it will target `tests/unit/clients/client-picker.test.tsx` with `-t "renders card variant"` / `-t "renders billTo variant"` / `-t "unlink"` etc. filters, convert each of the 9 `it.todo`s to real `it(...)` tests, and land `components/clients/client-picker.tsx` in the same commit sequence.
- **162-03 (Bill To pencil + InlineProjectName)** can now start: targets `tests/unit/estimate/document-bill-to.test.tsx` (7 todos) + `tests/unit/estimate/inline-project-name.test.tsx` (12 todos) + `tests/unit/estimate/document-alignment.test.tsx` (9 todos).
- **162-04 (Gear icon + PresentationSettingsPanel)** can now start: targets `tests/unit/components/estimate-floating-actions.test.tsx` (6 todos) + `tests/unit/components/presentation-settings-panel.test.tsx` (11 todos).
- **162-05 (Mobile line-item)** can now start: targets `tests/unit/estimate/mobile-line-item.test.tsx` (9 todos).
- **Nyquist gate cleared:** every `<automated>` row in 162-VALIDATION.md's Per-Task Verification Map now resolves to a real file path; the phase can execute end-to-end feedback loops <20s per task per the sampling contract.

## Self-Check: PASSED

All 7 scaffold files verified present on disk at their VALIDATION.md paths.
All 3 task commits verified in `git log` (`523b6da6`, `f336e0da`, `20f88344`).
VALIDATION.md frontmatter confirmed: `nyquist_compliant: true` + `wave_0_complete: true` at lines 5-6.
Full 7-file vitest verification run: 63 todos across 7 files, exit code 0, 2.80s runtime.

---
*Phase: 162-estimate-document-consolidated-pass*
*Completed: 2026-07-08*
