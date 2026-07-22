---
phase: 172-template-engine-foundation
plan: 01
subsystem: notifications
tags: [template-engine, escaping, whatsapp, sanitization, security, vitest]

# Dependency graph
requires: []
provides:
  - "lib/notifications/template-engine.ts: renderTemplate, escapeHtmlValue, escapeTextValue, sanitizeWhatsAppParam, extractVariables — the shared per-channel {{var}} interpolator/escaper"
  - "sendWhatsAppTemplate() sanitizes headerVariables/bodyVariables via sanitizeWhatsAppParam before building Meta components (TMPL-07 gap closed)"
affects: [172-02, 172-03, 173-notification-center-preview, 174-call-site-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled {{var}} interpolator (no templating library) — VAR_PATTERN = /\\{\\{(\\w+)\\}\\}/g, values escaped per-channel, template text never touched"
    - "Per-channel escaping selector inside renderTemplate: channel === 'html' ? escapeHtmlValue : escapeTextValue"

key-files:
  created:
    - lib/notifications/template-engine.ts
    - tests/unit/notifications/template-engine.test.ts
  modified:
    - lib/whatsapp/client.ts
    - tests/unit/whatsapp/template-send.test.ts

key-decisions:
  - "No templating library (Handlebars rejected — helper-execution CVE surface against admin-editable DB templates); pure regex-based interpolator instead, per the locked REQUIREMENTS.md decision"
  - "New sanitization tests for sendWhatsAppTemplate() were added to the pre-existing frozen tests/unit/whatsapp/template-send.test.ts (Phase 98 / WANOTIF-01) suite, not client.test.ts — its natural home, avoiding duplicate coverage; the 4 original tests were left untouched and stay green because the sanitizer is a no-op on their clean fixtures"
  - "sanitizeWhatsAppParam collapses 4+ consecutive spaces to exactly 3 (under Meta's documented reject threshold), not fully to 1 — preserves intentional visual spacing while satisfying Meta's constraint"
  - "No 'server-only' import on template-engine.ts — pure functions, deliberately reusable from a future client-side admin preview (Phase 173), matching the existing lib/notifications/copy.ts and event-types.ts precedent"

patterns-established:
  - "Per-channel escaping contract: 'html' -> escapeHtmlValue (HTML-entity-escape & < > \" ', mirrors lib/email/notification-emails.ts's escapeHtml()); 'text' -> escapeTextValue (strip control chars incl. \\r\\n\\t, collapse 2+ spaces to 1, trim) — VALUES are escaped, never template text"
  - "Nested/malformed brace resolution: '{{{{name}}}}' -> '{{X}}' — the \\w+ token can only match the innermost complete {{name}}; leftover outer braces pass through as literal text (locked by test, zero code-execution risk)"

requirements-completed: [TMPL-07]

# Metrics
duration: 6min
completed: 2026-07-21
---

# Phase 172 Plan 01: Template Engine Foundation Summary

**Hand-rolled `{{var}}` interpolator with per-channel escaping (HTML-entity for email/Telegram, control-char-stripped for SMS/in-app) plus closure of the pre-existing `sendWhatsAppTemplate()` sanitization gap.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-21T21:41:12-04:00
- **Completed:** 2026-07-21T21:47:16-04:00
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Built `lib/notifications/template-engine.ts`: `renderTemplate`, `escapeHtmlValue`, `escapeTextValue`, `sanitizeWhatsAppParam`, `extractVariables` — the one shared interpolation/escaping primitive every later Phase 172/173/174 plan imports
- Locked the nested-braces edge case (`'{{{{name}}}}'` → `'{{X}}'`) and the missing/null/undefined → `''` substitution contract in 24 unit tests
- Closed the TMPL-07 security gap: `sendWhatsAppTemplate()` now sanitizes every header/body variable (strips newlines/tabs, collapses 4+ spaces to 3, trims) before building the Meta template payload

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing test suite for the template engine** - `ef54cde9` (test)
2. **Task 2 (GREEN): Implement the template engine** - `76a01c42` (feat)
3. **Task 3: Close the sendWhatsAppTemplate() sanitization gap** - `2b12616c` (fix)

**Plan metadata:** (this commit, docs: complete plan)

_Note: TDD tasks — RED → GREEN, one commit each; no REFACTOR commit needed (implementation was already minimal/clean on first pass)._

## Files Created/Modified
- `lib/notifications/template-engine.ts` - New: the 5-export interpolation/escaping module (107 lines)
- `tests/unit/notifications/template-engine.test.ts` - New: 24 tests covering every behavior in the plan's `<behavior>` block
- `lib/whatsapp/client.ts` - Modified: `sendWhatsAppTemplate()` maps `headerVariables`/`bodyVariables` through `sanitizeWhatsAppParam` before building `components`; no other export touched
- `tests/unit/whatsapp/template-send.test.ts` - Modified: 3 new sanitization tests appended to the existing frozen `describe('sendWhatsAppTemplate (Phase 98 — WANOTIF-01)', ...)` block; the 4 original tests untouched and green

## Decisions Made
- Sanitization tests for `sendWhatsAppTemplate()` were added to `tests/unit/whatsapp/template-send.test.ts` (the pre-existing frozen suite from Phase 98/WANOTIF-01) rather than `tests/unit/whatsapp/client.test.ts` as the plan's action text originally described — the plan's premise that "no `sendWhatsAppTemplate` test exists yet" was stale; `template-send.test.ts` already covered the exact Meta payload shape. Adding new tests there avoids duplicate coverage and keeps the sanitization contract next to the payload-shape contract it modifies. (Correction supplied by the plan-checker pass, applied per instructions.)
- `sanitizeWhatsAppParam` collapses 4+ consecutive spaces to exactly 3, matching Meta's documented reject threshold, rather than fully collapsing to 1 space — preserves intentional visual spacing in owner-authored variable values while still guaranteeing the sanitized value never triggers Meta's rejection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / environment] Git index race with a concurrently-running parallel plan (172-02) in the same non-worktree-isolated working directory**
- **Found during:** Task 2 (GREEN — implementing the template engine)
- **Issue:** After `git add lib/notifications/template-engine.ts`, a concurrently-executing sibling plan (172-02, same wave, no worktree isolation per this project's Windows path-length constraint) ran its own commit before my pathspec-scoped `git commit` executed, sweeping my staged file into its commit (`0484d2e1 feat(172-02): notification_templates table + TS-exhaustive day-one seed`) instead of a 172-01 commit.
- **Fix:** No action needed on my side — the 172-02 process detected the mis-attribution itself and self-corrected with a follow-up commit (`8cbaf857 fix(172-02): drop accidentally-included template-engine.ts from prior commit`), returning the file to the working tree as untracked. I then re-staged and re-committed it immediately as its own atomic `feat(172-01)` commit (`76a01c42`).
- **Files modified:** None beyond the plan's own `lib/notifications/template-engine.ts` — no code changes, purely a git-history correction performed by the other process.
- **Verification:** `git show 76a01c42 --stat` confirms `lib/notifications/template-engine.ts` is the sole file in that commit; `git diff HEAD -- lib/notifications/template-engine.ts` is empty (working tree matches HEAD); all 24 tests still green after the re-commit.
- **Committed in:** `76a01c42` (Task 2's own atomic commit, as originally planned)

**2. [Plan-checker correction applied] Sanitization tests placed in `template-send.test.ts`, not `client.test.ts`**
- **Found during:** Task 3 (`<read_first>` review)
- **Issue:** The plan's Task 3 action text assumed no `sendWhatsAppTemplate` test existed and instructed adding a new `describe` block to `tests/unit/whatsapp/client.test.ts`. That premise was stale — `tests/unit/whatsapp/template-send.test.ts` (Phase 98 / WANOTIF-01) already contains 4 frozen tests asserting the exact Meta payload shape for `sendWhatsAppTemplate`.
- **Fix:** Per the supplied plan-checker correction, added 3 new sanitization tests to `template-send.test.ts` instead, leaving its 4 original tests byte-untouched. Confirmed the sanitizer is a no-op on those tests' clean fixtures (`'Receipt'`, `'Acme Co'`, `'$1,200'`) so all 4 stay green.
- **Files modified:** `tests/unit/whatsapp/template-send.test.ts` (not `client.test.ts`, which remains untouched by this plan).
- **Verification:** `npx vitest run tests/unit/whatsapp/` — 34 test files passed (1 skipped, pre-existing), 307 tests passed including all 4 original + 3 new `template-send.test.ts` tests.
- **Committed in:** `2b12616c` (Task 3 commit)

---

**Total deviations:** 2 (1 environment/git-race — Rule 3, self-resolved cooperatively with the concurrent process; 1 plan-checker-supplied correction applied as instructed)
**Impact on plan:** No code or test-coverage impact. Final commit history is clean and atomic per task, matching the plan's intent exactly.

## Issues Encountered
- The working directory is shared (in-place execution, no git worktree, per this project's Windows `MAX_PATH` constraint) with at least one other concurrently-running plan (172-02) in the same wave. This creates a real git-index race window between `git add` and `git commit` for any executor not using pathspec-scoped commits. Mitigated for the rest of this plan's tasks by committing with an explicit file pathspec (`git commit <path> -m ...`) rather than a bare `git commit -m ...`, minimizing the race window. Flagging for awareness on future parallel-wave plans in this milestone — worth considering pathspec-scoped commits as a standing convention when wave-parallel execution runs in-place.

## User Setup Required

None — no external service configuration required. Both changes are pure code (module + WhatsApp client fix); no env vars, no dashboard steps.

## Next Phase Readiness
- `lib/notifications/template-engine.ts` exports exactly the 5 functions plan 172-03's resolver needs (`renderTemplate`, `escapeHtmlValue`, `escapeTextValue`, `sanitizeWhatsAppParam`, `extractVariables`) — no further design work required before 172-03 can import them.
- `sendWhatsAppTemplate()` sanitizes every positional parameter before reaching Meta — every WhatsApp HSM send (owner-proactive today, tenant-proactive once Phase 174 re-enables TNT-03) is covered.
- No blockers. `lib/notifications/dispatch.ts`, `copy.ts`, and `whatsapp-registry.ts` remain untouched, exactly per this plan's scope fence — that wiring is 172-03's job.

---
*Phase: 172-template-engine-foundation*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/notifications/template-engine.ts
- FOUND: tests/unit/notifications/template-engine.test.ts
- FOUND: lib/whatsapp/client.ts
- FOUND: tests/unit/whatsapp/template-send.test.ts
- FOUND: commit ef54cde9 (Task 1 RED)
- FOUND: commit 76a01c42 (Task 2 GREEN)
- FOUND: commit 2b12616c (Task 3 fix)
