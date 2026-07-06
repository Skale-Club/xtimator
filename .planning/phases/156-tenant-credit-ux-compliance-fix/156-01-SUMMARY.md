---
phase: 156-tenant-credit-ux-compliance-fix
plan: 01
subsystem: ui
tags: [billing, credits, react, vitest, static-contract-test, tailwind]

# Dependency graph
requires: []
provides:
  - "TopUpPackCard, AutoTopupDialog, CreditHistoryList no longer render any raw credit number (repairs the 3 confirmed v4.15 CREDITUI-04 regressions)"
  - "lib/billing/usage-color.ts — shared color-escalation threshold helper (0-69 green / 70-89 amber / 90-100 red) consumed by both UsageProgressBar and CreditChip"
  - "components/app-shell/credit-chip.tsx — topbar chip now renders a real visible Progress bar element, not just percent text"
  - "Extended tests/unit/billing/tenant-cost-neutrality.test.ts — a new CREDITFIX-01 regression guard targeting the exact 'credits/delta_credits piped through .toLocaleString()' bug shape, covering the 3 fixed files plus every other file under components/billing/"
affects: [158-admin-billing-overhaul]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared color-escalation helper (lib/billing/usage-color.ts) — extract-once, import-everywhere pattern for Tailwind arbitrary-selector threshold classes, avoiding drift between UsageProgressBar and CreditChip"
    - "Static source-read test scoped to a specific JSX sub-block (SelectItem regex capture) rather than whole-file substring match, to avoid false positives on legitimate prop-name/doc-comment usage of the same word"
    - "Regression-guard regex targeting the RUNTIME rendering signal (`.toLocaleString()` call site) instead of a digit-literal pattern that can never match source code where the number only exists at runtime"

key-files:
  created:
    - lib/billing/usage-color.ts
    - tests/unit/billing/topup-pack-card.test.tsx
    - tests/unit/billing/auto-topup-dialog.test.tsx
    - tests/unit/billing/credit-history-list.test.tsx
  modified:
    - components/billing/topup-pack-card.tsx
    - components/billing/auto-topup-dialog.tsx
    - components/billing/credit-history-list.tsx
    - components/billing/usage-progress-bar.tsx
    - components/app-shell/credit-chip.tsx
    - tests/unit/app-shell/credit-chip.test.tsx
    - tests/unit/billing/tenant-cost-neutrality.test.ts

key-decisions:
  - "credits prop kept in TopUpPackCard's signature (still passed by topup-packs-grid.tsx) — only its rendering was removed; left as an unused destructured binding since it produces only an eslint warning, not a build-blocking error (the plan's own fallback condition for renaming to `credits: _credits` was not triggered)"
  - "CreditHistoryList's activity indicator uses TrendingUp/TrendingDown icons (not ArrowUpRight/ArrowDownRight or colored dots) — idiomatic with the file's existing lucide-react usage and CONTEXT.md's suggested icon choice"
  - "Coins icon kept in CreditChip (executor discretion per plan) — preserves visual continuity, no layout rework needed"
  - "Auto-topup-dialog test scoped its /credits/i and '≈' assertions to the captured SelectItem JSX block via regex, not the whole file — the file legitimately uses 'credits' elsewhere (prop/type names, an unrelated 'check this every time credits are used' threshold-field caption) that the plan's literal Test B wording ('source does NOT match /credits/i') would have false-flagged as violations"
  - "CreditHistoryList test's 'no digit' assertion scoped to exclude the legitimately-rendered date substring (e.g. 'Jan 1, 2026' contains 2+-digit sequences) — the plan's literal Test C/D wording ('does NOT contain... any digit sequence of length >= 2') is logically incompatible with also requiring the date to render; interpreted intent (no delta-derived digits) applied instead, per deviation Rule 1"

patterns-established:
  - "Regression-guard regex construction: verify empirically (via a throwaway node script) against real pre-fix and post-fix source before trusting a pattern — a digit-literal regex silently provides zero protection when the violation only exists as a runtime expression"

requirements-completed: [CREDITFIX-01, CREDITFIX-02]

# Metrics
duration: 24min
completed: 2026-07-06
---

# Phase 156 Plan 01: Tenant Credit UX Compliance Fix + Topbar Progress Bar Summary

**Removed all 3 confirmed raw-credit-number leaks from tenant-facing billing components, added a real color-escalating Progress bar to the topbar CreditChip via a new shared `lib/billing/usage-color.ts` helper, and extended the v4.15 static-contract test with a regex targeting the actual `.toLocaleString()` rendering signal (not a digit-literal pattern that would never have caught the real bugs).**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-06T04:02:00Z (approx)
- **Completed:** 2026-07-06T04:26:16Z
- **Tasks:** 3 completed
- **Files modified:** 10 (3 components fixed, 2 components refactored/extended, 1 new lib helper, 4 test files created/updated)

## Accomplishments
- `TopUpPackCard` no longer renders "≈ X credits" subtext — only the dollar price remains.
- `AutoTopupDialog`'s pack-picker `SelectItem` shows only the dollar amount, no "(≈X credits)" parenthetical.
- `CreditHistoryList`'s "Recent activity" feed is now qualitative — a `TrendingUp`/`TrendingDown` icon replaces the numeric `delta_credits` display; row label and timestamp are unchanged.
- Topbar `CreditChip` gained a real visible `Progress` bar element (previously text-only "X% used"), reusing the exact same color-escalation thresholds as the tenant billing page's `UsageProgressBar` via a new shared `lib/billing/usage-color.ts` helper — no threshold drift possible between the two surfaces.
- Extended `tests/unit/billing/tenant-cost-neutrality.test.ts` with a new `CREDITFIX-01` describe block (4 new tests: sanity/RED-guard, the 3 target files, and a broader `components/billing/` sweep) using a regex empirically verified to match the real pre-fix violations and produce zero matches post-fix and zero false positives elsewhere.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix the 3 raw-credit-number leaks** - `b9df34fb` (fix)
2. **Task 2: Extract shared usage-color helper and add a real progress bar to CreditChip** - `9135daf5` (feat)
3. **Task 3: Extend the v4.15 static-contract test** - `e67a4d81` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/billing/topup-pack-card.tsx` - deleted the "≈ X credits" subtext paragraph
- `components/billing/auto-topup-dialog.tsx` - SelectItem label now shows only `${pack.priceCents / 100}`
- `components/billing/credit-history-list.tsx` - replaced numeric delta span with `TrendingUp`/`TrendingDown` icon indicator (`data-testid="activity-positive"`/`"activity-negative"`)
- `lib/billing/usage-color.ts` - new shared `usageBandClass(percentUsed)` helper (extracted verbatim from usage-progress-bar.tsx)
- `components/billing/usage-progress-bar.tsx` - now imports `usageBandClass` from the shared helper instead of defining its own copy
- `components/app-shell/credit-chip.tsx` - added a real `Progress` element (`h-1.5 w-10 sm:w-14`) alongside the existing percent text
- `tests/unit/billing/topup-pack-card.test.tsx` - new test asserting no raw credit count renders
- `tests/unit/billing/auto-topup-dialog.test.tsx` - new static source-read test scoped to the SelectItem block
- `tests/unit/billing/credit-history-list.test.tsx` - new tests for positive/negative rows and the empty state
- `tests/unit/app-shell/credit-chip.test.tsx` - extended with 3 new tests (bar presence, healthy band, critical band)
- `tests/unit/billing/tenant-cost-neutrality.test.ts` - extended with a CREDITFIX-01 regression-guard describe block

## Decisions Made
See `key-decisions` in frontmatter. The two most consequential: (1) kept `credits` as an unused prop in `TopUpPackCard` rather than renaming to `credits: _credits`, since it's only an eslint warning not a build error, matching the plan's own stated fallback condition; (2) scoped two of my own test assertions (auto-topup-dialog's "no credits" check, credit-history-list's "no digits" check) more narrowly than the plan's literal wording, because the literal wording as written would have produced false failures against legitimate, unrelated content (doc-comment prose, prop/type names, and the rendered date). Both are Rule 1 (bug-in-test-spec) fixes to my own test code, not to the plan's intent — the underlying compliance goal (no raw credit count/delta ever rendered) is fully satisfied and verified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] auto-topup-dialog.test.tsx's whole-file `/credits/i` check would have false-failed on legitimate content**
- **Found during:** Task 1 (writing auto-topup-dialog.test.tsx)
- **Issue:** The plan's Test B spec says the file's source "does NOT match /credits/i" — but the file legitimately contains "credits" in its doc comment, in the `packs: Array<{ credits: number }>` type signature, and in an unrelated UI caption ("We'll check this every time credits are used.") describing the auto-topup threshold-check behavior, none of which are the violation being guarded against.
- **Fix:** Scoped the regex assertion to the captured `<SelectItem>...</SelectItem>` JSX block via a regex extraction, matching the plan's own interfaces-block "TO CHANGE" scope exactly.
- **Files modified:** tests/unit/billing/auto-topup-dialog.test.tsx
- **Verification:** `npx vitest run tests/unit/billing/auto-topup-dialog.test.tsx` passes; manually confirmed the SelectItem block contains no "credits"/"≈" while the rest of the file's legitimate uses are untouched.
- **Committed in:** b9df34fb (Task 1 commit)

**2. [Rule 1 - Bug] credit-history-list.test.tsx's "no digit sequence >= 2" check was incompatible with also requiring the date to render**
- **Found during:** Task 1 (writing credit-history-list.test.tsx)
- **Issue:** The plan's Test C/D spec requires the rendered HTML to contain "the date" while also asserting it contains no digit sequence of length >= 2 — but a rendered US date (e.g. "Jan 1, 2026") always contains such sequences (the year, and days 10-31). Additionally, raw `innerHTML` includes SVG numeric attributes (`width="24"`, path coordinates) from the new Trending icons, which are irrelevant to the compliance rule.
- **Fix:** Switched the assertion to `container.textContent` (excludes SVG markup attributes) and to checking specifically for delta-derived digit strings (`'2000'`, `'2,000'`, `'+2000'`, `'500'`, `'-500'`) plus a "no digits outside the known-legitimate date substring" check, which captures the actual intent (no credit-delta number ever renders) without being self-contradictory.
- **Files modified:** tests/unit/billing/credit-history-list.test.tsx
- **Verification:** `npx vitest run tests/unit/billing/credit-history-list.test.tsx` passes for both the positive and negative delta cases.
- **Committed in:** b9df34fb (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in my own test-writing, not in the plan's underlying compliance requirement, which is fully met)
**Impact on plan:** No scope creep — both fixes are corrections to test assertions I was writing in this same task, verified against real rendered output before finalizing. The compliance goal (no raw credit number ever reaches a tenant surface) is unaffected and fully verified by both the corrected tests and a manual grep pass.

## Issues Encountered

Plan 156-02 (Tier Pricing/Feature Reconciliation) was executed concurrently in the same repository by a separate parallel process during this plan's execution (both are `wave: 1`, `depends_on: []`, file-disjoint plans per the phase's parallelization design). Its commits (`e176be2b`, `97ec52d9`, `2881e8b1`) interleave with this plan's commits in `git log` but touch entirely disjoint files (`components/billing/tier-cards-grid.tsx`, `tests/unit/billing/pricing-ui-no-hardcode.test.ts`) — no conflict, no shared state mutation beyond STATE.md/ROADMAP.md/REQUIREMENTS.md, which that plan's own executor already updated and committed for its own scope.

Pre-existing `npx tsc --noEmit` errors were observed in unrelated test files (`tests/unit/billing/calibration.test.ts`, `tests/unit/billing/seat-billing.test.ts`, `tests/unit/estimate/markup-totals.test.ts`, `tests/unit/estimate/observability.test.ts`, `tests/unit/estimate/step-runner.test.ts`, `tests/unit/inngest/generate-estimate-job.test.ts`, `tests/unit/whatsapp/handler*.test.ts`, `tests/unit/ai/refine-shared-prompt.test.ts`) — all pre-date this plan's changes (confirmed via `git show` against the pre-Task-1 commit) and are unrelated to any file this plan touched. Per the deviation rules' scope boundary (only fix issues directly caused by current task's changes), these were left untouched and are noted here rather than fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CREDITFIX-01 and CREDITFIX-02 are both fully shipped and verified — the tenant `/settings/billing` page and the topbar chip are now compliant with the locked v4.15 CREDITUI-04 decision, with a regression guard in place to catch any future reintroduction automatically.
- Phase 156 Plan 02 (CREDITFIX-03, tier pricing/feature reconciliation) shipped independently in parallel — Phase 156 is now fully complete (both plans done) pending final phase-level state reconciliation.
- No blockers for Phase 157 (Admin Nav Reorg & Naming Fixes) or any other v4.17 phase — this plan touched only tenant-facing billing UI components, disjoint from admin nav/naming work.

---
*Phase: 156-tenant-credit-ux-compliance-fix*
*Completed: 2026-07-06*

## Self-Check: PASSED

All 12 created/modified files confirmed present on disk. All 3 task commit hashes (`b9df34fb`, `9135daf5`, `e67a4d81`) confirmed present in `git log`.
