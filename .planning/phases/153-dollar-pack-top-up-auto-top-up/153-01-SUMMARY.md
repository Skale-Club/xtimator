---
phase: 153-dollar-pack-top-up-auto-top-up
plan: 01
subsystem: payments
tags: [stripe, billing-config, react, next.js, tailwind]

# Dependency graph
requires:
  - phase: 152-usage-progress-bar-super-admin-cost-visibility
    provides: credit-balance-card.tsx rewritten to percentUsed-only props (no raw balance)
  - phase: 113-stripe-rail-webhook-plus-topup
    provides: create-topup-session route with generic packIndex-based server-side pack lookup
provides:
  - DEFAULT_BILLING_CONFIG.topUpPacks with exactly 3 dollar-denominated packs ($20/$50/$100)
  - TopUpPackCard + TopUpPacksGrid components mirroring the tier-card visual pattern
  - TopUpButton parameterized with label + variant props
  - Settings > Plans always-visible top-up pack picker (#topup-packs section)
  - credit-balance-card.tsx low-balance CTA simplified to a "Top up now" link
affects: [153-02-auto-top-up, 153-03-auto-top-up-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pack picker cards mirror tier-card.tsx/tier-cards-grid.tsx (Card variant=glass, Badge variant=brand for the recommended pill, packs prop fed by server-read billing_config — zero hardcoded pricing)"
    - "Static-source-scan no-hardcode test convention (readFileSync + regex) extended from pricing-ui-no-hardcode.test.ts to topup-pack-labels-no-hardcode.test.ts"

key-files:
  created:
    - components/billing/topup-pack-card.tsx
    - components/billing/topup-packs-grid.tsx
    - tests/unit/billing/topup-pack-labels-no-hardcode.test.ts
  modified:
    - lib/billing/billing-config.ts
    - components/billing/top-up-button.tsx
    - components/billing/credit-balance-card.tsx
    - app/(app)/settings/billing/page.tsx
    - tests/unit/billing/billing-config.test.ts
    - tests/unit/billing/topup-checkout.test.ts
    - tests/unit/billing/credit-balance-card.test.tsx

key-decisions:
  - "3 packs at $20/$50/$100 (priceCents 2000/5000/10000) with credits 1300/3500/7500 — CALIBRATE-BEFORE-CHARGING placeholders on a mild volume-discount curve consistent with the prior 2-pack ratio, not final pricing"
  - "TopUpButton gained label + variant props with backward-compatible defaults ('Top up credits' / 'primary') so the existing single call site (credit-balance-card.tsx, now removed) and any future direct caller keep working unchanged"
  - "Middle pack (index 1 of exactly 3) is the recommended/'Best value' pack, matching the UI-SPEC's anchor-pricing pattern"
  - "credit-balance-card.tsx's low-balance CTA no longer renders a duplicated inline TopUpButton — it links to the new #topup-packs section instead, since the full 3-card grid is too wide for the inline warning banner"

patterns-established:
  - "TopUpPackCard/TopUpPacksGrid pair mirrors TierCard/TierCardsGrid: packs flow in as a prop from a server component's getBillingConfig() call, never a local hardcoded array"

requirements-completed: [CREDITUI-06]

# Metrics
duration: 20min
completed: 2026-07-05
---

# Phase 153 Plan 01: Dollar Pack Top-Up UI Summary

**Replaced the 2-pack credit-quantity top-up with a 3-card dollar-denominated pack picker ($20/$50/$100), wired into an always-visible Settings > Plans section, feeding the unchanged Phase-113 Stripe checkout route.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-05T19:23:00Z (approx)
- **Completed:** 2026-07-05T19:43:52Z
- **Tasks:** 3
- **Files modified:** 7 modified, 3 created

## Accomplishments
- `DEFAULT_BILLING_CONFIG.topUpPacks` now has exactly 3 packs at $20/$50/$100 (priceCents 2000/5000/10000), with no other billing_config field touched
- New `TopUpPackCard` + `TopUpPacksGrid` render a 3-column dollar-amount-first pack picker with the middle pack marked "Best value", fed entirely by a `packs` prop (zero hardcoded pricing)
- `TopUpButton` is now parameterized (`label` + `variant` props, backward-compatible defaults) so each pack card can show its own "Top up $X" CTA
- Settings > Plans renders the pack picker as its own always-visible `#topup-packs` section (not gated behind the low-balance warning)
- `credit-balance-card.tsx`'s low-balance CTA no longer duplicates an inline purchase button — it's now a simple "Top up now" link to the new section

## Task Commits

Each task was committed atomically:

1. **Task 1: Update billing_config to 3 dollar packs and add regression + no-hardcode tests** - `ea6872e9` (feat)
2. **Task 2: Parameterize TopUpButton and build TopUpPackCard + TopUpPacksGrid** - `a4930e72` (feat)
3. **Task 3: Wire TopUpPacksGrid into Settings > Plans and simplify the low-balance CTA** - `69b50ef3` (feat)

_TDD flow: each task's tests were written/extended first and run to confirm the RED state where applicable (topup-pack-labels-no-hardcode.test.ts confirmed failing on missing files before implementation), then made GREEN by the implementation in the same commit._

## Files Created/Modified
- `lib/billing/billing-config.ts` - `topUpPacks` array changed from 2 credit-quantity packs to 3 dollar-denominated packs ($20/$50/$100)
- `components/billing/topup-pack-card.tsx` (new) - single pack card, dollar amount as primary label, credits as secondary sub-line, TopUpButton CTA
- `components/billing/topup-packs-grid.tsx` (new) - 3-column grid rendering one TopUpPackCard per configured pack, `packs` prop only
- `components/billing/top-up-button.tsx` - added `label` (default `'Top up credits'`) and `variant` (default `'primary'`) props
- `app/(app)/settings/billing/page.tsx` - added the `#topup-packs` section between the credits/history grid and the tier cards grid
- `components/billing/credit-balance-card.tsx` - replaced the inline `<TopUpButton packIndex={0}>` in the low-balance warning with a "Top up now" link to `#topup-packs`; removed the now-unused `TopUpButton` import
- `tests/unit/billing/billing-config.test.ts` - new `CREDITUI-06: topUpPacks (3 dollar packs)` describe block
- `tests/unit/billing/topup-checkout.test.ts` - extended `TOPUP_PACKS` fixture to 3 packs, added a `packIndex: 2` regression test, updated the existing `packIndex: 1` assertions to the new fixture values
- `tests/unit/billing/topup-pack-labels-no-hardcode.test.ts` (new) - static-source-scan guard: no hardcoded dollar-amount literals in the pack card, no hardcoded pricing constant in the grid, `label` prop present on TopUpButton
- `tests/unit/billing/credit-balance-card.test.tsx` - removed the now-unnecessary `TopUpButton` mock, updated Test 4/5 assertions to check for the new "Top up now" link + `#topup-packs` anchor instead of the old inline button markup

## Decisions Made
- 3 packs at $20/$50/$100 with credits 1300/3500/7500 — CALIBRATE-BEFORE-CHARGING placeholders, not final pricing (matches the plan's exact interface spec).
- `TopUpButton`'s new `variant` prop defaults to `'primary'`, matching the existing implicit shadcn Button behavior (no visual regression at the only pre-existing call site, which this same plan then removed).
- Middle pack (index 1) is the recommended "Best value" pack — derived generically (`packs.length >= 3 ? 1 : -1`) rather than hardcoded, so the grid stays correct if the admin panel adds/removes packs later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-comment literal dollar-amount strings tripped my own no-hardcode test**
- **Found during:** Task 2 (writing `topup-pack-card.tsx`)
- **Issue:** The JSDoc comment in `topup-pack-card.tsx` literally spelled out `'$20'/'$50'/'$100'` as prose, which matched the `topup-pack-labels-no-hardcode.test.ts` regex meant to catch hardcoded pricing in actual rendered output — a false positive caused by comment text, not real logic.
- **Fix:** Reworded the comment to describe the rule without using the literal quoted forms.
- **Files modified:** `components/billing/topup-pack-card.tsx`
- **Verification:** `npx vitest run tests/unit/billing/topup-pack-labels-no-hardcode.test.ts` green (3/3).
- **Committed in:** `a4930e72` (Task 2 commit)

**2. [Rule 1 - Bug] Own doc comment referencing `getBillingConfig()` regressed the BILLCFG-03 dormancy guard**
- **Found during:** Task 2 (writing `topup-packs-grid.tsx`), caught while running the full `tests/unit/billing/` suite before Task 2's commit
- **Issue:** `topup-packs-grid.tsx`'s JSDoc comment mentioned `` `getBillingConfig().topUpPacks` `` in prose. The existing `billing-config.test.ts` BILLCFG-03 structural guard is SYMBOL-scoped (regex `\bgetBillingConfig\b` over all `lib/app/components` source, comments included) and only allowlists a fixed set of legitimate runtime consumers — `topup-packs-grid.tsx` (a pure display component receiving `packs` as a prop, never calling the reader itself) is correctly NOT on that allowlist, so the mention in a comment was a false-positive regression of a pre-existing test caused by this plan's new file.
- **Fix:** Reworded the comment to describe the data source without using the literal symbol name.
- **Files modified:** `components/billing/topup-packs-grid.tsx`
- **Verification:** `npx vitest run tests/unit/billing/` — 40/40 files, 309/309 tests green.
- **Committed in:** `a4930e72` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — self-caused false positives in doc comments, fixed before the task's commit landed)
**Impact on plan:** No scope creep; both fixes are comment-only wording changes with zero behavioral impact.

## Issues Encountered
None beyond the two auto-fixed items above.

**Pre-existing, out-of-scope test failures observed during the full `npm test` run** (unrelated to this plan's files — confirmed by isolated re-run of one of them, `tests/unit/company-action.test.ts`, which passes green in isolation): `tests/unit/cleanup-route-auth.test.ts`, `tests/unit/company-action.test.ts`, `tests/integration/blog-rls.test.ts` (2 cases), `tests/unit/ai/empty-output-guards.test.ts`, `tests/unit/ai/transcribe-fallback.test.ts`, `tests/unit/components/landing-page.test.tsx`. These match the project's documented "Windows parallel-import flakes that pass in isolation" pattern (see STATE/PROJECT.md milestone notes) and touch no file this plan modified. Not fixed — out of scope per the deviation rules' scope boundary (pre-existing failures in unrelated files).

## Known Stubs
None. No hardcoded empty values, placeholder text, or unwired data sources were introduced — `topup-packs-grid.tsx` requires a real `packs` prop (no default), and the Settings > Plans page always passes `cfg.topUpPacks` from the live `getBillingConfig()` read.

## User Setup Required
None — no external service configuration required. The existing Stripe `create-topup-session` route is untouched and already handles a 3rd `packIndex` value generically (array indexing).

## Next Phase Readiness
- `billing_config.topUpPacks` is now the single source of truth for exactly 3 dollar packs; Plan 02 (auto-top-up migration/lock/trigger) and Plan 03 (auto-top-up UI) can read the same 3-pack array without any further UI changes here.
- `TopUpButton`'s new `label`/`variant` props are available for Plan 03's auto-top-up settings UI if it needs a similarly parameterized CTA.
- No blockers identified for the parallel 153-02 plan (disjoint files: this plan never touched the auto-topup migration/lock/trigger module).

---
*Phase: 153-dollar-pack-top-up-auto-top-up*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files verified present on disk: `components/billing/topup-pack-card.tsx`, `components/billing/topup-packs-grid.tsx`, `tests/unit/billing/topup-pack-labels-no-hardcode.test.ts`. All modified files verified present: `lib/billing/billing-config.ts`, `components/billing/top-up-button.tsx`, `components/billing/credit-balance-card.tsx`, `app/(app)/settings/billing/page.tsx`. All 3 task commit hashes verified present in git history: `ea6872e9`, `a4930e72`, `69b50ef3`.
