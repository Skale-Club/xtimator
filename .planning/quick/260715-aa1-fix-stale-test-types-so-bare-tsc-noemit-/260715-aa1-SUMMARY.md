---
phase: quick-260715-aa1
plan: 01
subsystem: tests/typecheck
tags: [typecheck, test-hygiene, vitest-4, tech-debt]
requires: []
provides:
  - "Clean bare `npx tsc --noEmit` (0 errors, was 25)"
  - "ComputeTotalsItem.unit_price optional — type now matches MARK-01 semantics"
affects:
  - lib/estimate/compute-totals.ts
  - tsconfig.ci.json
tech-stack:
  added: []
  patterns:
    - "vitest 4 single-type-arg Mock<TFunc> form"
    - "Reflect.deleteProperty for required env operands"
    - "[\\s\\S] instead of the ES2018 /s dotAll flag (target stays ES2017)"
key-files:
  created: []
  modified:
    - lib/estimate/compute-totals.ts
    - tsconfig.ci.json
    - tests/unit/whatsapp/handler.test.ts
    - tests/unit/whatsapp/handler-inngest-dispatch.test.ts
    - tests/unit/whatsapp/handler-intent-routing.test.ts
    - tests/unit/billing/calibration.test.ts
    - tests/unit/billing/seat-billing.test.ts
    - tests/unit/ai/refine-shared-prompt.test.ts
    - tests/unit/estimate/observability.test.ts
    - tests/unit/estimate/step-runner.test.ts
    - tests/unit/estimate/mobile-line-item.test.tsx
    - tests/unit/chat/route.test.ts
    - tests/unit/components/landing-page.test.tsx
    - tests/unit/inngest/generate-estimate-job.test.ts
    - tests/unit/observability/env-check.test.ts
decisions:
  - "deferred-items.md's whatsappEnabled diagnosis was WRONG — real cause was async getEntitlementsForTier"
  - "Cluster 8 was a genuine source-type bug, not a test defect — fixed the type, not the test"
  - "tsconfig.ci.json stays the CI gate on its own merits (scopes to shipped source), not because bare tsc is red"
metrics:
  duration: ~12 min
  tasks: 3
  files: 15
  completed: 2026-07-15
---

# Quick Task 260715-aa1: Fix Stale Test Types Summary

Made bare `npx tsc --noEmit` honest — 25 errors → 0, all confined to `tests/` — by fixing
drifted fixtures, vitest-4 mock typing, and one genuine production type bug, with zero
suppressions and zero tests weakened.

## Verification Gates — ACTUAL Numbers

| Gate | Command | Target | ACTUAL | Result |
| ---- | ------- | ------ | ------ | ------ |
| 1 | `npx tsc --noEmit` | 0 (was 25) | **0 errors**, exit 0 | PASS |
| 2 | `npx tsc --noEmit -p tsconfig.ci.json` | 0 (unchanged) | **0 errors**, exit 0 | PASS |
| 3 | `npx vitest run tests/unit tests/eval` | 3442 passing, 0 fail | **3442 passed**, 21 todo, 0 failures (464 files passed, 1 skipped) | PASS |

Gate 3's passing count is **exactly 3442** — matching the baseline with no drop, which
confirms no test was silently skipped or disabled to reach a green typecheck. The 21 todo
and 1 skipped file are pre-existing and untouched.

## What Was Done

### Task 1 — Drifted fixtures + ES2017-illegal regex flags (`ef5cc1bf`)
12 of 25 errors cleared.

- **Cluster 1 (5 whatsapp errors):** `mockReturnValue` → `mockResolvedValue` at the 5
  `mockGetEntitlements` sites. Once the literal was checked against `Entitlements` properly,
  each fixture surfaced a genuinely missing `chatEnabled` — added, shape-matched to each
  fixture's tier (`true` for pro-shaped, `false` for free-shaped). No assertion reads it.
- **Cluster 2 (2 calibration errors):** spread the corresponding default tier into each
  partial `TierBilling` fixture, overriding only the two fields each test exercises. The
  free tier keeps `subscriptionPriceCents: 0` so the `skipped === true` zero-price assertion
  still fires; the hand-computed ratio comments and `toBeCloseTo` assertions are untouched.
- **Cluster 4 (4 regex errors):** `refine-shared-prompt.test.ts` — verified the pattern
  contains no `.` at all, so dropping `/s` is a literal no-op. `observability.test.ts` ×3 —
  replaced the dot-star wildcards with `[\s\S]*` (exactly equivalent under `/s`) and dropped
  the flag. `tsconfig.json` `target` untouched (still ES2017).
- **Cluster 5 (1 error):** imported the already-used `afterEach`.

### Task 2 — vitest-4 mock typing + non-optional delete (`438dd2ef`)
12 further errors cleared.

- **seat-billing:** declared the spy's rest args; this widened `.mock.calls[0]` and cleared
  both tuple-cast errors as the plan predicted.
- **chat/route:** typed `rateLimitMock` against the real `RateLimitResult` contract via a
  type-only import. `retryAfter: 30` stays in the fixture — the `Retry-After` header
  assertion depends on it at runtime.
- **step-runner:** typed the runner object directly (a `vi.fn` cannot carry `run`'s generic).
  The test makes no assertion on the spy, so nothing was lost.
- **mobile-line-item:** rewrote to vitest-4's single-type-arg `Mock<TFunc>` form. The
  hand-written prop union is **preserved verbatim** — the test's own comment states it exists
  so `tsc --noEmit` fails when the `ItemCardMobile` signature drifts. Deriving it from the
  component would have auto-followed drift and destroyed the check.
- **generate-estimate-job:** `vi.mocked()` replaced the non-callable cast.
- **env-check:** `Reflect.deleteProperty` for the required operand — preserves `delete`
  semantics exactly, so the missing-env THROW assertions are unchanged.

### Task 3 — Approved source fix (`6aa33a96`)
Final error cleared.

`ComputeTotalsItem.unit_price` was declared REQUIRED while the implementation itself guarded
it with `typeof item.unit_price === 'number'` (:105) — a check only meaningful if the field
can be absent. MARK-01's entire point is that the AI supplies `cost` + `markup_pct` and the
server derives the price, so the field IS legitimately absent. **The type was wrong; the test
was right.** Made it `unit_price?: number` and added `?? 0` on the non-derive branch only.

Runtime no-op by construction: when `unit_price` IS supplied the branch returns it unchanged,
so `lineGross` and every downstream golden stay byte-identical. The `?? 0` only fires in the
previously-untypeable no-price-and-no-markup case, which already produced `NaN` — `0` is
strictly better and no test exercises it. Proven by all 335 estimate goldens staying green.

`tsconfig.ci.json`: comment text only. `include`/`exclude`/`extends` untouched — zero
compiler-behavior change.

## Deviations from Plan

### Corrections to the plan's line mapping (both found by re-running tsc, per the plan's own instruction)

**1. [Rule 1 - Bug] env-check: the plan had the two `delete` operands backwards**
- **Found during:** Task 2 verification
- **Issue:** The plan said to convert `:72` and `:82` and that "the adjacent
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` delete is already optional". The reverse is true.
  `types/env.d.ts` declares `NEXT_PUBLIC_SUPABASE_ANON_KEY: string` (required → errors) and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string` (optional → legal). Line 81 is
  PUBLISHABLE_KEY, line 82 is ANON_KEY.
- **Fix:** Converted the actually-erroring ANON_KEY line and left the legal PUBLISHABLE_KEY
  `delete` alone, honoring the plan's "convert ONLY the erroring lines" discipline.
- **Commit:** `438dd2ef`

**2. [Rule 3 - Blocking] generate-estimate-job: `vi.mocked()` surfaced a new TS2554**
- **Found during:** Task 2 verification
- **Issue:** `vi.mocked()` correctly preserves the real signature — which is exactly why the
  plan chose it — but that made the `?? mockGraph()` fallback's 0-arg call illegal
  (`buildEstimateGraph` requires an adapter). Swapping one error for another.
- **Fix:** Gave the fallback a typed no-op `ChannelAdapter` (the mock ignores its args, so
  this is runtime-inert) rather than casting. The call now genuinely tracks
  `buildEstimateGraph`'s contract.
- **Commit:** `438dd2ef`

Both corrections *strengthen* the types rather than working around them. No error was left
unfixed, and no fix required a suppression.

### Plan diagnosis confirmed wrong (as the plan itself flagged)

`deferred-items.md` claimed `whatsappEnabled` "no longer exists on Entitlements". **This was
wrong.** `whatsappEnabled` still exists (`lib/entitlements.ts:44`). The real cause:
`getEntitlementsForTier` is **async**, so the mock's expected type was `Promise<Entitlements>`
— against a Promise every object key is excess, and TS2353 just names the first one
positionally. That positional naming is what produced the bogus "field was removed" reading.
The plan's diagnosis was correct and is now verified.

## Constraint Compliance

- Zero `as any`, `@ts-expect-error`, `@ts-ignore` introduced (verified by diffing all three
  commits for the patterns: 0 matches)
- Zero tests skipped, deleted, `.skip`'d or `.todo`'d — gate 3's count proves it
- Zero assertion meanings changed; the four called-out intent guards (mobile-line-item's
  hand-written union, chat's `retryAfter: 30`, calibration's `skipped === true`, env-check's
  THROW semantics) are all intact
- Exactly one production source file changed: `lib/estimate/compute-totals.ts` (approved)
- `tsconfig.json` `target` unchanged (ES2017); `tsconfig.ci.json` `include`/`exclude` unchanged
- 3 atomic commits; nothing pushed, no branch created, stayed on `feat/eager-nash-db707e`

## Errors Left Unfixed

**None.** All 25 baseline errors are fixed, none suppressed.

## Known Stubs

None.

## Follow-Up Worth Noting

`tsconfig.ci.json` excludes `tests/**`, so test-type drift remains **invisible to CI** and can
silently rot again — which is exactly how this reached 25 errors. A note to that effect was
added to the config's comment. Adding a non-blocking bare-`tsc` CI step would catch the next
drift early; not done here as it is outside this task's scope.

## Self-Check: PASSED

- `lib/estimate/compute-totals.ts` — FOUND, contains `unit_price?: number` and `item.unit_price ?? 0`
- `tests/unit/estimate/markup-totals.test.ts` — FOUND, unchanged, now typechecks
- Commit `ef5cc1bf` — FOUND
- Commit `438dd2ef` — FOUND
- Commit `6aa33a96` — FOUND
- All 3 gates re-run and recorded with actual numbers above
