---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
plan: 01
subsystem: testing
tags: [vitest, testing-library-react, react-pdf, static-grep, scaffolding, tdd]

# Dependency graph
requires:
  - phase: 161-presentation-settings
    provides: resolvePresentationSettings + isSectionVisible resolver (consumed by cross-surface scaffold)
  - phase: 163-02
    provides: phase163 migration + bundled migration-contract test (Wave 0 slot 4/7)
  - phase: 134-pdf-text-totals
    provides: PDF tree-walk helper prototype (collectTextNodes/flattenText) — extracted here
provides:
  - Shared _pdf-text-walker helper (collectTextNodes + flattenText) for all @react-pdf/renderer element-tree tests
  - SENDHUB-04/-05 cross-surface parity + structural-grep test with 3 RED gates for Wave 2
  - SENDHUB-03 delivery-insert-format static grep test with 3 RED gates for Wave 3
  - SENDHUB-02 SMS + WhatsApp format-fallback contract scaffolds (3 RED contract tests)
  - SENDHUB-01/-06 SendHubDialog RTL contract scaffold (6 RED gates for Wave 3)
  - Wave 0 gate marker: 163-VALIDATION.md nyquist_compliant + wave_0_complete flipped to true
affects:
  - 163-03-PLAN (cross-surface resolver rollout — cross-surface + structural-grep tests are its gate)
  - 163-04-PLAN (SendHubDialog UI — send-hub-dialog contract scaffold is its gate)
  - 163-05-PLAN (delivery-action wiring — delivery-insert + SMS + WhatsApp scaffolds are its gates)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 static-grep scaffolding: cheap file-contents assertions that RED today and GREEN once Wave 2/3 wires the production surface. Zero mocks, zero fixtures, byte-cheap."
    - "PDF text-walker as a shared _underscore-prefixed helper: not a test file, importable by any tests/unit/estimate/ or tests/unit/pdf/ file. Reference-equality fallback + displayName check so minified/dev builds both work."
    - "@ts-expect-error markers on Wave-2 signature extensions (buildItemsBreakdown 2nd arg, formatEstimateForWhatsApp trailing arg) — self-flip from suppressed to genuine when the production signature widens."
    - "Structural grep test as SENDHUB-04's PRIMARY gate — 6 renderers, 6 required imports, single readFileSync loop. Catches settings-drift even when runtime assertions pass trivially (see pitfall #1 in RESEARCH)."

key-files:
  created:
    - tests/unit/estimate/_pdf-text-walker.ts
    - tests/unit/estimate/presentation-settings-cross-surface.test.tsx
    - tests/unit/estimate/delivery-insert-format.test.ts
    - tests/unit/api/send-sms-format-fallback.test.ts
    - tests/unit/whatsapp/send-estimate-format-fallback.test.ts
    - tests/unit/workspace/send-hub-dialog.test.tsx
  modified:
    - .planning/phases/163-format-first-send-hub-cross-surface-settings-rollout/163-VALIDATION.md

key-decisions:
  - "PDF walker helper: keep `displayName === 'Text'` check per plan grep contract, AND add PDFText reference-equality fallback — makes the retrocompat test genuinely GREEN today and future-proofs against minifier stripping of displayName."
  - "Skip re-creating tests/unit/db/phase163-migration-contract.test.ts — 163-02 already bundled it (Rule 3 blocking fix documented in 163-02-SUMMARY). Wave 0 slot 4/7 already satisfied on disk."
  - "Static-grep-only scaffolds for SMS + WhatsApp + SendHubDialog: it.todo behavior slots enumerate Wave-2/3 RTL assertions without mocking scaffolds today. Each file has at least one REAL contract assertion so scaffolds are not trivially all-green."
  - "as any + Record<string, unknown> for the cross-surface fixture at consumption points — matches plan action point 3 discretion. Renderers only touch fields we assert against."

patterns-established:
  - "Wave 0 scaffold shape: file exists + typecheck clean + at least one REAL RED assertion. it.todo blocks fill in behaviors that need Wave 2/3 seams to test properly."
  - "Structural grep + walk-the-tree parity: one static-grep it block enforces imports across N files; one runtime test block asserts identical output across all N surfaces. Two-layer defense."

requirements-completed: [SENDHUB-01, SENDHUB-02, SENDHUB-03, SENDHUB-04, SENDHUB-05, SENDHUB-06]

# Metrics
duration: 10m
completed: 2026-07-08
---

# Phase 163 Plan 01: Wave 0 Test Scaffolding for Send Hub + Cross-Surface Settings Summary

**6 Wave 0 test scaffolds created (7th bundled by 163-02) — 15 RED gates now stand between Waves 2/3 and the phase's SENDHUB-01..06 acceptance criteria, plus a shared PDF tree-walker helper that both classic + modern PDF tests and the cross-surface parity test can reuse without duplication.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-08T22:45:00Z
- **Completed:** 2026-07-08T22:55:00Z
- **Tasks:** 4 (plan) + VALIDATION.md flip (user-prompt success criterion)
- **Files created:** 6
- **Files modified:** 1 (163-VALIDATION.md)

## Accomplishments

- Shipped the shared `_pdf-text-walker.ts` helper — extracted from `tests/unit/pdf/estimate-pdf-totals.test.tsx:22-51` with a displayName check + reference-equality fallback. Both existing PDF byte-identity tests (`estimate-pdf-totals` + `estimate-pdf-modern-totals`) stay green — they keep their inlined copies.
- SENDHUB-04/-05 cross-surface parity test with 4 `it` blocks (3 parity + 1 structural grep): 3 RED today, 1 GREEN retrocompat. Structural grep enumerates the 6 renderer file paths and asserts each imports `resolvePresentationSettings` — Wave 3's PRIMARY gate.
- SENDHUB-03 delivery-insert-format grep test: 3 RED (send, send-sms, whatsapp/send-estimate all missing `format:`) + 1 GREEN (lib/actions/estimate.ts skip-until-Wave-3 escape hatch).
- SENDHUB-02 SMS + WhatsApp format-fallback contract scaffolds: 3 RED contract assertions (send-sms route missing `format` reference; whatsapp missing `effectiveDeliveryFormat` + `params.format === 'pdf'/'plain_text'` branches) + 4 it.todo slots.
- SENDHUB-01/-06 SendHubDialog contract scaffold: 6 RED file-contents assertions (component file doesn't exist yet; card testids + no-Tabs + no-Share-Export + markAsSentAction + LanguageFlagChip all absent) + 2 it.todo behavior slots.
- 163-VALIDATION.md frontmatter flipped: `nyquist_compliant: true` + `wave_0_complete: true`; Wave 0 Requirements checklist ticked 7/7.
- Hidden-regression sweep clean: 36/36 tests GREEN across `estimate-pdf-totals`, `estimate-pdf-modern-totals`, `whatsapp/formatter`, `utils/estimate-template`.

## Task Commits

1. **Task 1: Extract shared PDF tree-walker helper** — `ebfbd705` (test)
2. **Task 2: Cross-surface parity + structural-grep test** — `51dbef88` (test) — also revises the helper with a reference-equality fallback
3. **Task 3: Delivery-insert-format static grep test** — `ce219deb` (test) — migration-contract test slot already satisfied by 163-02's bundled test
4. **Task 4: SMS + WhatsApp + SendHubDialog scaffolds** — `75eb9d9e` (test)

## Files Created/Modified

- `tests/unit/estimate/_pdf-text-walker.ts` — shared PDF tree-walker helper (collectTextNodes + flattenText). Displayname check + PDFText reference-equality fallback.
- `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` — 4 it blocks: 3 parity (sections hidden / summary hidden / retrocompat null) across ALL 6 surfaces + 1 structural grep enforcing resolver imports.
- `tests/unit/estimate/delivery-insert-format.test.ts` — grep audit of every `.from('estimate_deliveries').insert({...})` payload across 4 source files, gates on `format:` key presence.
- `tests/unit/api/send-sms-format-fallback.test.ts` — SMS route source-code contract test + 2 it.todo behavior slots.
- `tests/unit/whatsapp/send-estimate-format-fallback.test.ts` — WhatsApp send-estimate source-code contract test (effectiveDeliveryFormat + params.format branches) + 2 it.todo behavior slots.
- `tests/unit/workspace/send-hub-dialog.test.tsx` — SendHubDialog file-existence + component structure grep test (6 REDs) + 2 it.todo RTL smoke behavior slots.
- `.planning/phases/163-format-first-send-hub-cross-surface-settings-rollout/163-VALIDATION.md` — nyquist_compliant + wave_0_complete flipped to true; Wave 0 Requirements checklist all ticked.

## Decisions Made

- **Add a reference-equality fallback to the PDF walker.** The plan's verbatim `displayName === 'Text'` check returned zero text in the vitest/jsdom environment — the retrocompat test would have been a permanent RED (a Wave 0 scaffold that never turns GREEN is a defect, not a scaffold). Added `|| el.type === PDFText` as an additional condition. Preserves the plan's `grep -c "displayName === 'Text'"` == 1 acceptance criterion (grep still finds exactly one occurrence). Makes Test C GREEN today, as the plan intends.
- **Skip re-creating the migration-contract test.** 163-02's Rule-3 fix bundled it; re-writing would create a git conflict for no gain. Wave 0 slot 4/7 already satisfied on disk (verified: `test -f tests/unit/db/phase163-migration-contract.test.ts` exits 0, 4/4 GREEN).
- **Loose typing at fixture boundaries.** Fixtures are `Record<string, unknown>` with `as any` at renderer consumption points — plan action point 3 explicitly authorizes this. The renderers only touch fields we assert against; enumerating the full 40+ field `EstimateWithSections` shape would double the scaffold LOC for zero teeth.
- **@ts-expect-error markers only where Wave 2/3 will genuinely extend a signature.** buildItemsBreakdown's 2nd arg + formatEstimateForWhatsApp's trailing arg both fall into this — the suppression flips to a genuine "unnecessary suppression" error post-Wave-2, which is the desired signal that we forgot to remove them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PDF text walker returned empty via displayName-only check**
- **Found during:** Task 2 (running the cross-surface test to verify RED expectations)
- **Issue:** The plan's verbatim helper implementation uses `displayName === 'Text'` to identify @react-pdf/renderer's Text primitive. In the vitest/jsdom environment (or perhaps due to minification/bundling), the displayName was not exposed on the imported Text component reference at test-time — so `collectTextNodes` collected zero text from EstimatePDF's element tree. This turned Test C (retrocompat, expects SECRET_ITEM_DESCRIPTION PRESENT in `out.classicPdf`) from GREEN into a permanent RED — a Wave 0 scaffold that never turns GREEN is broken by definition.
- **Fix:** Added a reference-equality fallback: `if (displayName === 'Text' || el.type === PDFText)`. Imported `Text as PDFText` from `@react-pdf/renderer` at the top of `_pdf-text-walker.ts`. Both checks are non-exclusive; the displayName check remains (satisfies plan's Task 1 `grep -c "displayName === 'Text'"` == 1 acceptance criterion).
- **Files modified:** `tests/unit/estimate/_pdf-text-walker.ts`
- **Verification:** After fix, Test C is GREEN (retrocompat with null presentation_settings emits SECRET across all 6 surfaces). Tests A + B + D remain RED (Wave 2 wiring gates). Grep count for `displayName === 'Text'` still equals 1.
- **Committed in:** `51dbef88` (Task 2 commit — bundled with the cross-surface test that surfaced the issue)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug).
**Impact on plan:** Fix preserves plan's Task 1 acceptance criteria (grep count unchanged), makes the plan's Task 2 acceptance criteria genuine (Test C now GREEN as the plan intends, not permanently RED). No scope creep.

## Issues Encountered

- Windows line-ending warnings on staging (`LF will be replaced by CRLF`) — normal, no action needed.

## User Setup Required

None — Wave 0 scaffolds are pure test files; no environment variables, secrets, or dashboard configuration required.

## Next Phase Readiness

- **Wave 0 complete.** All 7 scaffold slots on disk: 6 created here + 1 (migration-contract) bundled by 163-02. VALIDATION.md's nyquist_compliant + wave_0_complete flags flipped.
- **Wave 2 gates ready.** 163-03 (cross-surface resolver rollout) has:
  - 3 parity assertions across 6 renderers (`presentation-settings-cross-surface.test.tsx`)
  - 1 structural grep enforcing resolver imports at each renderer boundary
  - Retrocompat safety net (null presentation_settings must keep byte-identity)
- **Wave 3 gates ready.**
  - `delivery-insert-format.test.ts` catches any INSERT site that forgets `format:` (send, send-sms, whatsapp/send-estimate + Wave-3-only markAsSentAction site)
  - `send-sms-format-fallback.test.ts` gates the SMS route's `format` request-body field addition
  - `send-estimate-format-fallback.test.ts` gates the `effectiveDeliveryFormat` branch in `lib/whatsapp/send-estimate.ts`
  - `send-hub-dialog.test.tsx` gates the SendHubDialog component (existence + testids + no-Tabs + no-Share-Export + markAsSentAction + LanguageFlagChip)
- **Downstream unblocks:** 163-03 / 163-04 / 163-05 can now execute against real, RED gates. 163-06 (deletion sweep) has no scaffold dependency.
- **No blockers.**

## Self-Check: PASSED

Verified via absolute-path existence + git-log grep + vitest sweep:

- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/estimate/_pdf-text-walker.ts`
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/estimate/presentation-settings-cross-surface.test.tsx`
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/estimate/delivery-insert-format.test.ts`
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/api/send-sms-format-fallback.test.ts`
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/whatsapp/send-estimate-format-fallback.test.ts`
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/workspace/send-hub-dialog.test.tsx`
- FOUND: commits `ebfbd705`, `51dbef88`, `ce219deb`, `75eb9d9e` in git log
- FOUND: 12 RED / 9 GREEN / 6 TODO across the 7 Wave 0 scaffold files
- FOUND: 36/36 GREEN in hidden-regression sweep (`estimate-pdf-totals` + `estimate-pdf-modern-totals` + `whatsapp/formatter` + `utils/estimate-template`)
- FOUND: `npx tsc --noEmit -p tsconfig.ci.json` exit 0
- FOUND: 163-VALIDATION.md flipped nyquist_compliant + wave_0_complete to true; checklist 7/7 ticked

---
*Phase: 163-format-first-send-hub-cross-surface-settings-rollout*
*Completed: 2026-07-08*
