---
phase: 179-whatsapp-template-composer
plan: 01
subsystem: api
tags: [whatsapp, meta-cloud-api, hsm-templates, validation, tdd]

# Dependency graph
requires: []
provides:
  - "lib/whatsapp/template-composer.ts — pure, client-safe ComposerParam type, validateComposerTemplate(), buildBodyComponent(), nextVariableToken()"
  - "Single source of truth for deriving Meta's BODY component (text + example.body_text) from one ordered params array"
  - "Pre-submit validation mirroring Meta's auto-reject rules (sequential tokens, no leading/trailing variable, missing example/label, 1024-char limit, malformed/stray braces)"
affects: [179-03-meta-submission, 179-04-composer-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordered ComposerParam[] array as single source of truth (never let free-typed {{n}} syntax or independently-editable example values bypass it)"
    - "validateComposerTemplate accumulates ALL errors in one pass rather than short-circuiting, so the composer UI can surface every problem at once"
    - "buildBodyComponent is a pure formatter decoupled from validation, so a live preview can render even while input is technically invalid"

key-files:
  created:
    - lib/whatsapp/template-composer.ts
    - tests/unit/whatsapp/template-composer.test.ts
  modified: []

key-decisions:
  - "Malformed/stray brace detection (checker INFO, adopted): strip all well-formed {{n}} tokens via regex, then flag any leftover '{' or '}' as malformed — catches '{{}}', '{{1}', '{ {2}}', and lone trailing '}}' independently of the sequential-token check, since submitTemplateToMeta (Plan 179-03) re-validates STORED body_text on a non-UI path where malformed braces can arrive"
  - "Sequential-token check is a single array-equality comparison (extracted indexes vs [1..params.length]) — covers gaps, duplicates, reversal, and count mismatch in one comparison as specified by the plan"

patterns-established:
  - "Pattern: pure lib module with zero imports beyond TS built-ins for anything that must be safe for a 'use client' component to import directly (no fetch, no server-only, no DB access)"

requirements-completed: [TMPLCOMP-01, TMPLCOMP-02]

# Metrics
duration: ~12min
completed: 2026-07-22
---

# Phase 179 Plan 01: WhatsApp Template Composer — Validation + BODY Derivation Summary

**Pure TypeScript module (`lib/whatsapp/template-composer.ts`) deriving Meta's BODY component from one ordered `ComposerParam[]` array, with 25-test-covered validation mirroring every Meta auto-reject rule plus stray/malformed-brace detection.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-22T07:49:00-04:00 (approx.)
- **Completed:** 2026-07-22T07:52:17Z
- **Tasks:** 1 (TDD: RED → GREEN, no REFACTOR needed)
- **Files modified:** 2 (both new)

## Accomplishments
- `lib/whatsapp/template-composer.ts` — pure, zero-import (beyond TS built-ins), client-safe module exporting `ComposerParam`, `ComposerValidationResult`, `nextVariableToken()`, `validateComposerTemplate()`, `buildBodyComponent()`
- `validateComposerTemplate()` mirrors every Meta auto-reject rule the phase's research verified: sequential `{{n}}` tokens (gaps/duplicates/reversal/count-mismatch caught by one array-equality comparison), no leading/trailing variable, per-param missing label/example, 1024-char BODY limit — and accumulates ALL violations in a single pass (never short-circuits)
- Adopted the checker INFO scope addition: any stray/malformed brace outside a well-formed `{{n}}` token (`{{}}`, `{{1}`, `{ {2}}`, lone trailing `}}`) is now a distinct validation error, independent of the sequential check, with dedicated test coverage (5 new test cases)
- `buildBodyComponent()` produces the exact verified Meta payload shape (`{ type: 'BODY', text, example: { body_text: [[...]] } }`) and is intentionally decoupled from validation (pure formatter, never throws)
- 25/25 tests passing; `npx tsc --noEmit -p tsconfig.ci.json` clean

## Task Commits

TDD task committed as RED then GREEN (no REFACTOR — implementation was clean on first pass, nothing to clean up):

1. **Task 1 RED: failing tests for template-composer validation + derivation** - `648a1d0d` (test)
2. **Task 1 GREEN: template-composer validation + BODY derivation implementation** - `c6c47944` (feat)

**Plan metadata:** committed below (docs: complete plan)

## Files Created/Modified
- `lib/whatsapp/template-composer.ts` - `ComposerParam`/`ComposerValidationResult` types, `nextVariableToken`, `validateComposerTemplate`, `buildBodyComponent`; zero imports beyond TS built-ins
- `tests/unit/whatsapp/template-composer.test.ts` - 25 tests covering `nextVariableToken` (2), `validateComposerTemplate` (18, including the 5 adopted malformed-brace cases), `buildBodyComponent` (3, including the "does not validate" pure-formatter contract)

## Decisions Made
- Malformed-brace detection implemented by stripping all well-formed `{{n}}` tokens via `String.replace(VARIABLE_TOKEN_RE, '')` then testing the remainder for any leftover `{`/`}` character — simplest correct approach that needed no new dependencies and composes cleanly with the existing sequential-token regex extraction (both use the same `\{\{(\d+)\}\}` pattern).
- Per-param error messages name the position (`{{2}}`) and label (or `unlabeled` if the label itself is also missing) so an admin can immediately locate the failing field in a multi-param form.

## Deviations from Plan

None from the PLAN.md task itself — executed exactly as written (types, function signatures, implementation notes, and test-case list all match the plan's `<action>`/`<behavior>` blocks precisely).

One scope addition, pre-authorized by the orchestrator's instructions (not a self-initiated deviation): added malformed/stray-brace validation and 5 corresponding test cases per the "checker INFO (ADOPTED)" instruction, since `submitTemplateToMeta` (Plan 179-03) re-validates STORED `body_text` on a path the composer UI doesn't gate.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This is a pure, no-I/O module.

## Next Phase Readiness
- `lib/whatsapp/template-composer.ts` is ready for Plan 179-03 (server-side Meta submission — `buildBodyComponent`/`validateComposerTemplate` re-validating stored `body_text` before `submitTemplateToMeta` POSTs) and Plan 179-04 (client composer UI — direct `'use client'` import for live preview + pre-submit validation) to both import from.
- No blockers. `nextVariableToken` gives 179-04's "Insert variable" UI a structurally-safe way to always append the next sequential token.

---
*Phase: 179-whatsapp-template-composer*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: lib/whatsapp/template-composer.ts
- FOUND: tests/unit/whatsapp/template-composer.test.ts
- FOUND commit: 648a1d0d (test RED)
- FOUND commit: c6c47944 (feat GREEN)
