---
phase: 152-usage-progress-bar-super-admin-cost-visibility
plan: 01
subsystem: billing
tags: [react, next.js, shadcn, radix-progress, vitest, tailwind]

# Dependency graph
requires:
  - phase: 115-credit-balance-ux
    provides: getCreditOverview() owner-safe projection, CreditBalanceCard/CreditChip/CreditHistoryList v1
  - phase: 111-billing-config-store
    provides: getBillingConfig() runtime-editable tiers[tier].monthlyCreditGrant / signupCreditGrant
provides:
  - "computeUsagePercent() shared pure formula (lib/billing/usage-percent.ts)"
  - "UsageProgressBar color-escalating component (green/amber/red bands)"
  - "CreditBalanceCard and CreditChip rewired to percentUsed-only props (no raw balance reaches client components)"
  - "Static neutrality test enforcing lib/queries/credits.ts and components/billing/** never reference real_cost_usd/markup/balance_after"
  - "Both server call sites (settings/billing/page.tsx, app/(app)/layout.tsx) compute percentUsed server-side"
affects: [152-02-super-admin-cost-visibility, 153-dollar-topup-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Arbitrary Tailwind descendant selector ([&>[data-slot=progress-indicator]]:bg-[...]) to color-override a shadcn Radix Indicator without modifying the primitive"
    - "Server-side percentage computation before client component boundary as structural data-neutrality enforcement (mirrors the owner-safe-projection pattern from lib/queries/credits.ts)"
    - "Comment-stripping static neutrality test (mirrors tests/unit/agent-tools/neutrality.test.ts) when a doc comment legitimately needs to describe forbidden tokens as prose"

key-files:
  created:
    - lib/billing/usage-percent.ts
    - components/billing/usage-progress-bar.tsx
    - tests/unit/billing/usage-percent.test.ts
    - tests/unit/app-shell/credit-chip.test.tsx
    - tests/unit/billing/tenant-cost-neutrality.test.ts
  modified:
    - components/billing/credit-balance-card.tsx
    - components/billing/credit-history-list.tsx
    - components/app-shell/credit-chip.tsx
    - components/app-shell/topbar.tsx
    - app/(app)/settings/billing/page.tsx
    - app/(app)/layout.tsx
    - tests/unit/billing/credit-balance-card.test.tsx
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "percentUsed computed server-side at both call sites (page.tsx, layout.tsx) via the shared computeUsagePercent helper, so the raw credit balance never reaches a client-rendered component — the structural enforcement mechanism for CREDITUI-04, not just a prop-shape convention"
  - "Extended the existing BILLCFG-03 getBillingConfig() consumer allowlist (tests/unit/billing/billing-config.test.ts) with app/(app)/layout.tsx as a legitimate new display-only consumer, following the exact precedent pattern already used for 6 prior phases' consumers"
  - "Static neutrality test strips // and /* */ comments before the bare-substring scan, because lib/queries/credits.ts's own untouched doc comment legitimately names real_cost_usd/markup/balance_after as prose describing the invariant it enforces"

patterns-established:
  - "Color-escalation bands (0-69 healthy/green, 70-89 warning/amber, 90-100 critical/red) reusing existing --success/--warning/--danger CSS custom properties, no new hex values"

requirements-completed: [CREDITUI-03, CREDITUI-04]

# Metrics
duration: 16min
completed: 2026-07-05
---

# Phase 152 Plan 01: Usage Progress Bar (Tenant-Facing) Summary

**Replaced the raw numeric credit display on Settings > Plans and the topbar chip with a server-computed, color-escalating usage-percentage bar/chip, backed by a static grep test proving the raw balance and cost columns never reach tenant-facing code.**

## Performance

- **Duration:** 16 min (commits span 14:30:40-14:46:31 local)
- **Started:** 2026-07-05T18:30:29Z (approx, first test run)
- **Completed:** 2026-07-05T18:46:31Z
- **Tasks:** 3/3 completed
- **Files modified:** 13 (5 created, 8 modified)

## Accomplishments
- `computeUsagePercent({ balance, cycleGrant })` — a single pure formula (clamp 0-100, divide-by-zero guarded) shared by both tenant surfaces, fully unit-tested (6 cases including over-spend and above-grant edge cases)
- `UsageProgressBar` wraps the existing `components/ui/progress.tsx` (zero modification to the shadcn primitive) with green/amber/red color escalation via a Tailwind arbitrary-descendant selector targeting the Radix `data-slot="progress-indicator"` child
- `CreditBalanceCard` and `CreditChip` rewritten to accept `percentUsed` (+ `tier` for the card) only — the raw `balance`/`lowBalanceThresholds` props are gone entirely, verified by grep (`balance` identifier: zero matches in either file)
- Both server call sites (`app/(app)/settings/billing/page.tsx`, `app/(app)/layout.tsx`) now compute `percentUsed` via the shared helper before passing anything to a client component; `Topbar`'s prop renamed `creditBalance` → `percentUsed` end-to-end
- New static neutrality test (`tests/unit/billing/tenant-cost-neutrality.test.ts`) enforces that `lib/queries/credits.ts` and every file under `components/billing/` never reference `real_cost_usd`/`markup`/`balance_after`, mirroring the existing `tests/unit/agent-tools/neutrality.test.ts` convention
- Full `npm test` suite green apart from 2 pre-existing, unrelated failures (documented below)

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs):

1. **Task 1: computeUsagePercent + UsageProgressBar** — `9015c99b` (test, RED) → `a28f7d1a` (feat, GREEN)
2. **Task 2: Rewrite CreditBalanceCard/CreditChip, reword CreditHistoryList comment** — `8665540c` (test, RED) → `477fbd66` (feat, GREEN)
3. **Task 3: Wire percentUsed at server call sites, rename Topbar prop, static neutrality test** — `d32be8e4` (test, neutrality test GREEN on first run) → `870e3996` (feat, server wiring + billing-config allowlist fix)

_Note: Task 3's neutrality test file itself passed immediately once comment-stripping was added (no separate RED commit needed for the wiring half, since it's `type="auto" tdd="true"` covering both a pre-passing static test and imperative wiring changes)._

## Files Created/Modified
- `lib/billing/usage-percent.ts` - Pure `computeUsagePercent` formula, sole source of truth for the tenant usage percentage
- `components/billing/usage-progress-bar.tsx` - Color-escalating bar wrapper, `{ percentUsed: number }` props only
- `components/billing/credit-balance-card.tsx` - Rewritten to `{ percentUsed, tier }` props, renders `UsageProgressBar` + band-based warning + tier-aware reset caption
- `components/billing/credit-history-list.tsx` - Doc-comment reworded only (no logic/prop change) to drop literal forbidden tokens
- `components/app-shell/credit-chip.tsx` - Rewritten to `{ percentUsed }` prop, renders `{N}%` + "used" label
- `components/app-shell/topbar.tsx` - `creditBalance` prop renamed to `percentUsed` end-to-end
- `app/(app)/settings/billing/page.tsx` - Computes `percentUsed` via `computeUsagePercent` + `getBillingConfig()` cycle grant before calling `CreditBalanceCard`
- `app/(app)/layout.tsx` - Adds `getBillingConfig()` as a 6th parallel `Promise.all` entry, computes `percentUsed`, passes it (not raw balance) to `Topbar`
- `tests/unit/billing/usage-percent.test.ts` - 6 behavior cases for the formula
- `tests/unit/billing/credit-balance-card.test.tsx` - Full rewrite against the new `{ percentUsed, tier }` contract (7 behaviors)
- `tests/unit/app-shell/credit-chip.test.tsx` - New test file (new directory), 2 behaviors
- `tests/unit/billing/tenant-cost-neutrality.test.ts` - Static comment-stripping grep test (3 behaviors)
- `tests/unit/billing/billing-config.test.ts` - Extended the BILLCFG-03 `getBillingConfig()` consumer allowlist with the new `app/(app)/layout.tsx` consumer (and the sibling 152-02 admin company page consumer, so the guard stays green regardless of merge order)

## Decisions Made
- **Server-side percentage computation as structural enforcement**: rather than relying on a code-review convention ("just don't pass balance"), the raw credit balance is converted to a percentage in the two existing server data-fetch points before any client component boundary — this makes CREDITUI-04 impossible to violate accidentally, not just discouraged.
- **Extended, not duplicated, the BILLCFG-03 allowlist test**: `tests/unit/billing/billing-config.test.ts` already gates which files may call `getBillingConfig()`. Rather than weakening or bypassing that guard, `app/(app)/layout.tsx` was added as a documented legitimate consumer, following the exact same inline-comment-then-allowlist-entry pattern used by the 6 prior phases already in that list. Also added the 152-02 admin company page path proactively so the shared test file doesn't regress depending on which parallel plan's commit lands last.
- **Comment-stripping neutrality scan**: the plan anticipated that `lib/queries/credits.ts`'s own (unmodified per read_first instructions) doc comment legitimately names the forbidden tokens as prose describing the very invariant it enforces. Per the plan's explicit fallback instruction, the static test strips `//` and `/* */` comments before scanning rather than weakening the forbidden-token list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Curly vs. straight apostrophe mismatch in initial CreditBalanceCard test assertions**
- **Found during:** Task 2 (rewriting `tests/unit/billing/credit-balance-card.test.tsx`)
- **Issue:** Initial test assertions used a straight apostrophe (`'`) in the warning-copy strings, but the component (matching the existing codebase convention, e.g. the old `You&rsquo;re running low...` copy) renders a curly apostrophe (`’`) via `&rsquo;`. Two assertions failed on this mismatch.
- **Fix:** Updated the two test string literals to use the curly apostrophe character, matching the rendered HTML exactly.
- **Files modified:** `tests/unit/billing/credit-balance-card.test.tsx`
- **Verification:** `npx vitest run tests/unit/billing/credit-balance-card.test.tsx` — all 8 tests pass.
- **Committed in:** `477fbd66` (Task 2 commit)

**2. [Rule 3 - Blocking] Unescaped `*/` inside the neutrality test's own doc comments broke the file's parse**
- **Found during:** Task 3 (writing `tests/unit/billing/tenant-cost-neutrality.test.ts`)
- **Issue:** Two JSDoc-style comments in the new test file described the comment-stripping technique using the literal characters `/* */`, which closed the enclosing block comment early and produced a TS parse error (`Expected a semicolon...`).
- **Fix:** Reworded both doc comments to describe the technique in prose without embedding the literal `/* */` character sequence.
- **Files modified:** `tests/unit/billing/tenant-cost-neutrality.test.ts`
- **Verification:** `npx vitest run tests/unit/billing/tenant-cost-neutrality.test.ts` — all 3 tests pass.
- **Committed in:** `d32be8e4` (Task 3 commit)

**3. [Rule 3 - Blocking] BILLCFG-03 `getBillingConfig()` consumer allowlist test failed after wiring `app/(app)/layout.tsx`**
- **Found during:** Task 3 (wiring `getBillingConfig()` into `app/(app)/layout.tsx`)
- **Issue:** `tests/unit/billing/billing-config.test.ts` has a pre-existing structural guard restricting which files may reference the `getBillingConfig` symbol. Adding the new legitimate call in `app/(app)/layout.tsx` (and the parallel 152-02 plan's `app/admin/companies/[id]/page.tsx`) tripped this guard.
- **Fix:** Extended the existing `ALLOWLIST` set in that test with both new paths, each with an inline comment documenting why it's a legitimate consumer (mirroring the pattern already used for 6 prior phases' entries in the same test).
- **Files modified:** `tests/unit/billing/billing-config.test.ts`
- **Verification:** `npx vitest run tests/unit/billing/billing-config.test.ts` — all 30 tests pass; full `tests/unit/billing/` + `tests/unit/app-shell/` suite (304 tests) green.
- **Committed in:** `870e3996` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three were necessary to reach a fully green test suite; none represent scope creep — all are direct consequences of implementing exactly what the plan specified.

## Issues Encountered
None beyond the auto-fixed items above.

## Full Suite Verification

`npm test` (full suite, 418 files / 2991 tests) — 2956 passed, 26 todo, 2 skipped, 7 failed. All 7 failures are in 2 pre-existing, unrelated test files:
- `tests/integration/blog-rls.test.ts` (2 assertions) — requires a live Supabase connection/anon RLS context; last touched in an unrelated prior commit (`5dcbe578`, SEO reconciliation).
- `tests/unit/components/landing-page.test.tsx` (1 assertion) — documented pre-existing AuthDialog-portal timing flake; fails identically in isolation, confirmed unrelated to any file this plan touches.

Both were independently observed and logged by the parallel 152-02 agent in the same phase's `deferred-items.md`; this plan's run confirmed the identical two-file/three-assertion failure set with no additional regressions, and appended a confirmation note to the same file rather than duplicating the entry.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CREDITUI-03 and CREDITUI-04 both fully verified: the tenant-facing Settings > Plans page and topbar chip show only a color-escalating percentage, and the static neutrality test structurally blocks any future regression that would leak `real_cost_usd`/`markup`/`balance_after` into `lib/queries/credits.ts` or `components/billing/**`.
- `lib/billing/usage-percent.ts` and `components/billing/usage-progress-bar.tsx` are now available as shared primitives for Phase 153's dollar-denominated top-up flow (no new percentage-formula work needed there).
- No blockers for the sibling 152-02 plan (super-admin cost visibility) — disjoint files, and the shared `billing-config.test.ts` allowlist was proactively updated to accommodate both plans' new consumers regardless of merge order.

---
*Phase: 152-usage-progress-bar-super-admin-cost-visibility*
*Completed: 2026-07-05*

## Self-Check: PASSED

- All 13 created/modified files verified present on disk.
- All 6 task commit hashes (`9015c99b`, `a28f7d1a`, `8665540c`, `477fbd66`, `d32be8e4`, `870e3996`) verified present in git log.
