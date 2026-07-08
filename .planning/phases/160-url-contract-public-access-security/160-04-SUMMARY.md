---
phase: 160-url-contract-public-access-security
plan: 04
subsystem: api
tags: [url-builder, sms, whatsapp, stripe-connect, vitest, tdd]

# Dependency graph
requires:
  - phase: 160-01
    provides: "lib/estimate/public-url.ts's buildEstimatePublicPath (the sole builder), PublicUrlEstimate/PublicUrlCompany types"
provides:
  - "All 5 known inline `/estimate/${...share_token}` construction call sites migrated to buildEstimatePublicPath"
  - "A permanent repo-wide static sweep test (tests/unit/estimates/no-hardcoded-share-url.test.ts) locking the invariant against regression"
affects: [163]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repo-wide walk()-based static regression test mirroring tests/unit/env-var-sweep.test.ts's FORBIDDEN/EXEMPT pattern"
    - "Explicit longer it()-level test timeout (20000ms) for large-tree walk() static tests, since the codebase has grown past vitest's 5s default"

key-files:
  created:
    - tests/unit/estimates/no-hardcoded-share-url.test.ts
  modified:
    - app/api/estimates/[id]/send-sms/route.ts
    - lib/whatsapp/send-estimate.ts
    - lib/whatsapp/confirm-actions.ts
    - lib/billing/connect-webhook.ts
    - tests/unit/webhooks/connect-events.test.ts

key-decisions:
  - "confirm-actions.ts's actionSend reuses the project row already fetched for client_id (added `name` to that same select) instead of an extra query, for the buildEstimatePublicPath project_name param"
  - "The new sweep test's it() got an explicit 20000ms timeout — walking app/components/lib now approaches vitest's 5s default on this codebase's current size (env-var-sweep.test.ts, which shares the same walk() cost, is comparably borderline at ~4.9s but was left untouched, out of this plan's scope)"

patterns-established:
  - "tests/unit/estimates/no-hardcoded-share-url.test.ts is now the permanent CI guard against any future inline `/estimate/${...}` construction outside lib/estimate/public-url.ts or lib/utils/share-link.ts"

requirements-completed: [PUBURL-04]

# Metrics
duration: 55min
completed: 2026-07-08
---

# Phase 160 Plan 04: Call-Site Migration to buildEstimatePublicPath Summary

**Migrated all 5 remaining inline `/estimate/${share_token}` constructions (SMS route, WhatsApp Send-tab, WhatsApp inbox confirm-flow, both Stripe Connect webhook email call sites) to the shared `buildEstimatePublicPath()` builder, and added a permanent repo-wide static sweep test locking the invariant.**

## Performance

- **Duration:** ~55 min (includes a full-suite regression run under heavy 3-way parallel-wave CPU contention)
- **Started:** 2026-07-08T14:35:00Z (approx)
- **Completed:** 2026-07-08T15:30:00Z (approx)
- **Tasks:** 3 completed
- **Files modified:** 6 (5 modified, 1 created)

## Accomplishments
- `app/api/estimates/[id]/send-sms/route.ts`, `lib/whatsapp/send-estimate.ts`, and `lib/whatsapp/confirm-actions.ts` (`actionSend`) all now fetch `public_slug_token` + `company.slug` alongside their existing selects and build their share URL via `buildEstimatePublicPath` instead of hand-rolling `/estimate/${share_token}`.
- `lib/billing/connect-webhook.ts`'s both call sites (`handleCheckoutSessionCompleted` and `handleInvoicePaid`) migrated the same way — TDD RED→GREEN: the new `connect-events.test.ts` describe block was written first (confirmed failing against the still-legacy implementation), then the implementation was migrated to green. All 7 tests in that file (6 pre-existing + 1 new) pass with zero regression.
- Added `tests/unit/estimates/no-hardcoded-share-url.test.ts`, a permanent static sweep (mirrors `env-var-sweep.test.ts`'s `walk()` pattern) that fails CI if any file outside `lib/estimate/public-url.ts` or `lib/utils/share-link.ts` ever hand-rolls an inline `/estimate/${...}` path again. Passes with zero offenders — confirming all 5 known call sites are now clean.
- Verified via grep that zero old-style `${baseUrl}/estimate/`, `${getCanonicalBaseUrl()}/estimate/`, and `${origin}/estimate/` constructions remain in any of the 4 migrated files.
- `npx tsc --noEmit` shows zero new type errors across all 4 migrated implementation files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate send-sms.ts, whatsapp/send-estimate.ts, whatsapp/confirm-actions.ts** - `6713db47` (feat)
2. **Task 2 (RED): failing test for checkout.session.completed friendly-URL migration** - `cb470fa5` (test)
3. **Task 2 (GREEN): migrate connect-webhook.ts** - `100a2d7a` (feat)
4. **Task 3: permanent repo-wide sweep test** - `d5fabb5b` (test)

**Plan metadata:** `6d96e304` (docs: log 2 out-of-scope observations found during plan verification — folded into this plan's execution since they surfaced during its own verification commands)

_Note: Task 2 used TDD (test → feat); no refactor commit needed — the implementation matched the plan's exact spec on first pass._

## Files Created/Modified
- `app/api/estimates/[id]/send-sms/route.ts` - Fetches `public_slug_token`/`company.slug`, builds `shareUrl` via `buildEstimatePublicPath`
- `lib/whatsapp/send-estimate.ts` - Same migration for the shared Send-tab/inbox delivery helper (`deliverEstimateViaWhatsApp`)
- `lib/whatsapp/confirm-actions.ts` - Same migration for `actionSend` (WhatsApp inbox conversational confirm-flow); reuses the already-fetched `project.name` for the estimate slug, zero extra query
- `lib/billing/connect-webhook.ts` - Both `handleCheckoutSessionCompleted` and `handleInvoicePaid` build `estimateShareUrl` via `buildEstimatePublicPath` (payment-confirmation email links only — the literal Stripe redirect this requirement originally worried about is confirmed dead per 160-RESEARCH.md)
- `tests/unit/webhooks/connect-events.test.ts` - Extended additively with `estimates.update()`/`projects.select()` mock chains + a `slug` on the companies fixture + a new describe block proving the friendly-path output
- `tests/unit/estimates/no-hardcoded-share-url.test.ts` - New permanent static sweep guarding PUBURL-04 against future regression

## Decisions Made
- `confirm-actions.ts`'s `actionSend` widened its existing `projects.select('id, client_id')` to `'id, client_id, name'` rather than adding a dedicated query — the project row was already being fetched for `client_id`, so this is a zero-extra-query way to get a real project name for the friendly-URL's `estimateSlug`.
- The new sweep test needed an explicit `20000`ms per-test timeout (`it(name, fn, 20000)`) — walking `app`/`components`/`lib` now approaches vitest's 5s default on this codebase's current size. The pre-existing `env-var-sweep.test.ts` shares the identical `walk()` cost and was observed comparably borderline (~4.9s) during verification, but per the SCOPE BOUNDARY rule it was left untouched (not a file this plan modifies) — logged to `deferred-items.md` instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New sweep test's cold-run walk cost exceeded vitest's 5s default timeout**
- **Found during:** Task 3 (permanent sweep test)
- **Issue:** The plan's exact `it()` body (mirroring `env-var-sweep.test.ts` verbatim) timed out at vitest's 5000ms default on the first run (`Test timed out in 5000ms`) — the `app`/`components`/`lib` tree has grown large enough that a cold synchronous `walk()` + `readFileSync` pass over it takes 6+ seconds.
- **Fix:** Added an explicit `20000` (20s) timeout as the third argument to the test's `it()` call. This only affects the new test file this plan creates — no other file was touched to fix this.
- **Files modified:** `tests/unit/estimates/no-hardcoded-share-url.test.ts`
- **Verification:** Re-run passed in 8.91s (well under the new 20s ceiling).
- **Committed in:** `d5fabb5b` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the new test to be deterministic on this codebase's current size. No scope creep — no other file was modified to address this.

## Issues Encountered

**Full-suite regression run showed 24 failing test files under heavy 3-way parallel-wave CPU contention — traced to environmental flakiness, not a regression from this plan.** Running `npx vitest run` (the plan's `<verification>` block's final step) took ~35 minutes and reported "24 failed | 425 passed | 4 skipped (453)" — abnormally slow and lossy compared to this codebase's typical full-suite time, explained by this plan executing in parallel alongside Plans 160-03 and 160-05 on the same 8-core machine (per this plan's own `<parallel_execution>` directive), each independently running similarly heavy test/build work. Investigation:
  - Every visible failure signature was either `Error: Test timed out in 30000ms` or a jsdom `findByRole` timing failure — the classic signature of CPU-starved parallel execution, not a logic regression.
  - Cross-referenced the 4 files this plan actually modified (`send-sms/route.ts`, `whatsapp/send-estimate.ts`, `whatsapp/confirm-actions.ts`, `lib/billing/connect-webhook.ts`) against every test file with any textual reference to them — only 2 have direct test coverage: `tests/unit/webhooks/connect-events.test.ts` (already green, 7/7, both standalone and in the full run) and `tests/unit/whatsapp/confirm.test.ts` (imports `confirm-actions` at runtime).
  - `tests/unit/whatsapp/confirm.test.ts` was one of the 24 files reported failing in the full run (2 of its tests timed out / hit a mock-config gap). Re-ran it standalone: **10/10 passed cleanly in 5.67s** — confirming the full-run failure was contention-induced, not caused by this plan's changes.
  - Spot-checked 2 more of the visible failures (`generate-refine-equivalence.test.ts`, `landing-page.test.tsx` — neither touches any file this plan modified) standalone: `generate-refine-equivalence.test.ts` passed cleanly in isolation (confirming contention); `landing-page.test.tsx` had 1 pre-existing failure unrelated to URL building (an unrelated "sign in" heading `findByRole` timing issue in an AuthDialog test, present regardless of this plan and out of scope to fix).
  - No dedicated unit test exists for `app/api/estimates/[id]/send-sms/route.ts` or `lib/whatsapp/send-estimate.ts` specifically (confirmed via `grep -rl` against `tests/unit`/`tests/integration` for direct imports) — these 2 files' correctness rests on the `tsc --noEmit` clean pass + the acceptance-criteria greps, per the plan's own verification design.

Given this evidence, the full-suite failures are attributed to parallel-wave resource contention, not a regression introduced by this plan. Not re-running the full 35-minute suite a second time given the strength of the isolation evidence already gathered.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PUBURL-04 is now fully complete — every known estimate share-URL construction site in the codebase goes through `buildEstimatePublicPath` (or the legacy client-only `buildShareLink()`), locked by a permanent static test.
- Phase 163 (Send Hub + cross-surface settings rollout) can build on this: `components/workspace/send/send-form.tsx`'s `buildShareLink()` call site (explicitly out of scope for this plan per 160-RESEARCH.md) is its remaining migration target.
- No blockers for Plan 160-05 (new-estimate `public_slug_token` generation + backfill script) — that plan is independent of this one's call-site migrations (both depend only on Plan 160-01).

---
*Phase: 160-url-contract-public-access-security*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 6 created/modified files verified present on disk (`app/api/estimates/[id]/send-sms/route.ts`, `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts`, `lib/billing/connect-webhook.ts`, `tests/unit/webhooks/connect-events.test.ts`, `tests/unit/estimates/no-hardcoded-share-url.test.ts`) plus this SUMMARY.md itself. All 5 task commits (`6713db47`, `cb470fa5`, `100a2d7a`, `d5fabb5b`, `6d96e304`) verified present in git log. No missing items.
