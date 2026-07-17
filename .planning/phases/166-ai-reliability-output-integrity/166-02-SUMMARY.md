---
phase: 166-ai-reliability-output-integrity
plan: 02
subsystem: ai
tags: [estimate-generation, quality-gate, consistency-checks, guard-rails, sentry]

# Dependency graph
requires:
  - phase: 166-01
    provides: AI fetch timeouts, truncation typing via finish_reason, tool-schema parity, pinned temperature
provides:
  - "checkEstimateConsistency pure module: exact-duplicate line collapse, qty-0-with-price flagging, over-ceiling verdict"
  - "generate-estimate.ts wiring: dedupe before totals, metric-coherent aiProposedSubtotal, configurable total ceiling, non-destructive awaiting_details routing for over-ceiling estimates"
affects: [168-02 (photo captions — disjoint prompt-assembly region, sequenced after this plan), any future admin-config work migrating ESTIMATE_TOTAL_CEILING_USD to a UI-editable setting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env-at-the-boundary threshold resolution (ceiling resolved in the service, not the pure module) — mirrors resolveQualityThresholds"
    - "Non-destructive awaiting_details extension via `||` on an existing condition, instead of a new graph/adapter branch"

key-files:
  created:
    - lib/estimate/quality/consistency.ts
    - tests/unit/estimate/consistency.test.ts
  modified:
    - lib/services/generate-estimate.ts
    - tests/unit/services/generate-estimate-research.test.ts

key-decisions:
  - "Over-ceiling routes through the EXISTING non-destructive RFALL-01 awaiting_details seam (generate-estimate.ts, projectStatus condition, originally :590-598 pre-edit / now ~:696-699) via `|| overCeiling` — never through assess/autoRefine/revertVagueEstimate. The estimate persists current + editable; a distinct estimate_activity row (event_type 'estimate_over_ceiling_flagged', metadata {total, ceiling}) differentiates it from the flaggedUnpriced reason for a future banner-copy split."
  - "Ceiling defaults to 2_000_000 via ESTIMATE_TOTAL_CEILING_USD, resolved in generate-estimate.ts (not inside the pure module) — deliberately above the existing $1M per-unit price-anchoring clamp (UNIT_PRICE_CEILING) so the two guardrails stay internally consistent, and above real construction/remodel job sizes ($250k+ is routine). It is an absurdity ceiling tuned for hallucinations, not a business cap."
  - "Dedupe runs on the anchored+researched sections BEFORE computeEstimateTotals (between the former :334/:343 markers) so duplicate lines cannot inflate the persisted total; aiProposedSubtotal is recomputed via a SEPARATE dedupe pass over the AI's own raw sections (same algorithm, AI-native prices) so the totals_discrepancy signal keeps measuring AI-price-vs-server-price, not AI-side duplication."

requirements-completed: [AIREL-04]

# Metrics
duration: 75min
completed: 2026-07-17
---

# Phase 166 Plan 02: Estimate Consistency Checks + Configurable Over-Ceiling Routing Summary

**Deterministic post-generation consistency gate (exact-duplicate collapse, qty-0-with-price flags, configurable $2M absurdity ceiling) wired into `generate-estimate.ts`, with over-ceiling estimates routed through the existing non-destructive `awaiting_details` seam instead of the destructive vague-estimate path.**

## Performance

- **Duration:** ~75 min (includes two full `npm test` runs of the 489-file suite, ~25 min each, run as background verification)
- **Started:** 2026-07-17T16:57:00Z (approx.)
- **Completed:** 2026-07-17T18:12:00Z
- **Tasks:** 2/2
- **Files modified:** 4 (2 created, 2 modified) + 1 deferred-items.md update

## Accomplishments

- New pure, channel-neutral `checkEstimateConsistency` module (zero imports, never-throw) that collapses exact-duplicate line items (same normalized description + quantity + unit_price, first occurrence kept), flags quantity-0-with-price lines without mutating them, and evaluates a caller-supplied total-over-ceiling verdict
- Wired into `generate-estimate.ts`: duplicates are collapsed on the anchored+researched sections BEFORE `computeEstimateTotals` runs, so a hallucinated repeated line can never inflate a persisted total
- Metric coherence fix (Opus plan-check Warning C): `aiProposedSubtotal` (used for the `totals_discrepancy` Sentry signal) is now computed on a deduped view of the AI's own raw sections, so a duplicate line no longer produces an artificial discrepancy anomaly unrelated to price anchoring/research
- Configurable absurdity ceiling (`ESTIMATE_TOTAL_CEILING_USD`, default `2_000_000`) that routes an over-ceiling estimate through the SAME non-destructive `awaiting_details` recourse the flaggedUnpriced case already uses — the estimate is never deleted, never routed through the destructive vague/auto-refine/revert path
- Additive observability: an `[estimate_consistency]` structured log + a best-effort Sentry warning for duplicate/qty-0/over-ceiling flags, and a distinct `estimate_activity` row (`estimate_over_ceiling_flagged`) carrying `{total, ceiling}` for the over-ceiling case specifically

## Task Commits

1. **Task 1: Pure consistency module (TDD)** - `6f55b524` (feat) — `checkEstimateConsistency` + 13 unit tests
2. **Task 2: Wire into the generation service + needs-details routing** - `45e17e0c` (feat) — dedupe-before-totals, metric-coherent aiProposedSubtotal, ceiling resolution, `|| overCeiling` seam extension, activity/Sentry observability, 4 new service-seam tests, plus a null-byte fix in the Task 1 file (see Deviations)

_No plan-metadata-only commit was made separate from the above; this SUMMARY + STATE/ROADMAP updates form the final commit._

## Files Created/Modified

- `lib/estimate/quality/consistency.ts` - Pure `checkEstimateConsistency(sections, computedTotal, opts)`: dedupe + qty-0 flag + ceiling verdict
- `tests/unit/estimate/consistency.test.ts` - 13 cases: dedupe (single/cross-section/triple-duplicate), near-duplicate non-collapse, qty-0-with-price flag (and its $0-price non-flag counterpart), ceiling over/under, degenerate inputs (null/empty/malformed), non-finite total
- `lib/services/generate-estimate.ts` - `resolveEstimateTotalCeiling()` helper; dedupe inserted pre-`computeEstimateTotals`; `aiProposedSubtotal` recomputed on deduped AI sections; `overCeiling` verdict + merged `consistencyFlags`; `[estimate_consistency]` log + Sentry warning; `projectStatus` condition extended with `|| overCeiling`; `estimate_over_ceiling_flagged` activity row
- `tests/unit/services/generate-estimate-research.test.ts` - 4 new AIREL-04 cases (duplicate collapse can't inflate total + metric-coherence assertion on the discrepancy log; over-ceiling routes to `awaiting_details` with the distinct activity flag, never deleted; `ESTIMATE_TOTAL_CEILING_USD` env override honored; in-bounds regression is byte-identical, no flags fire)
- `.planning/phases/166-ai-reliability-output-integrity/deferred-items.md` - logged 2 new out-of-scope discoveries + a recurrence of the already-documented flake (see Deviations)

## Decisions Made

- **Seam choice (Opus-checked):** extended the existing RFALL-01 `awaiting_details` condition rather than introducing any new graph node, adapter branch, or state field. Zero changes to `lib/estimate/graph/nodes/*`, `vagueness.ts`, or `revert.ts` — the destructive vague path and its locked tests are byte-identical.
- **Ceiling default and resolution point:** `2_000_000`, resolved via `process.env.ESTIMATE_TOTAL_CEILING_USD` inside `generate-estimate.ts` (not the pure module), matching the `resolveQualityThresholds` env-at-the-boundary pattern. Documented follow-up: migrating this to an admin-editable platform config (like `getWhatsAppSystemPrompt`) is out of scope for this plan.
- **Dedupe placement and double-total handling:** dedupe runs once on the anchored+researched sections before `computeEstimateTotals`; the resulting deduped sections are what totals are computed from. The over-ceiling verdict is evaluated directly against the real `safeGrandTotal` (rather than re-invoking the module a second time), since the module's own `computedTotal > ceiling` check is already unit-tested in isolation — the service inlines the identical comparison to avoid a redundant second dedupe pass.
- **Differentiated flag mechanism:** chosen as a new `estimate_activity` row (`event_type: 'estimate_over_ceiling_flagged'`, `metadata: {total, ceiling}`) rather than writing to the `projects.needs_details` JSONB column, which is owned by the (untouched) destructive vague-path adapter (`lib/estimate/adapters/default.ts`) with its own `{reason, questions, attempt_id, created_at}` contract. This keeps the two "awaiting_details" reasons (flaggedUnpriced vs. over-ceiling) additively distinguishable without touching another feature's column contract. Wiring an actual differentiated banner copy (reading this activity row) is left as explicit follow-up — out of this plan's `files_modified` scope (UI banner untouched).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stray null bytes in the Task 1 `consistency.ts` template literal**
- **Found during:** Task 2 (staging files for commit; `file`/`git diff` reported the file as binary)
- **Issue:** Two literal space characters inside the `dedupeKey` template literal (`` `${normalized} ${quantity} ${unit_price}` ``) were written as NUL bytes (0x00) instead of spaces during the initial `Write` tool call in Task 1 — functionally harmless (both sides of every dedupe-key comparison used the same separator, so all 13 Task 1 tests passed), but incorrect/non-portable source content that `git diff` rendered as a binary file.
- **Fix:** Replaced both NUL bytes with proper space characters via a byte-level rewrite; verified zero null bytes remain and re-ran the full consistency test suite (still 13/13 green).
- **Files modified:** `lib/estimate/quality/consistency.ts`
- **Commit:** `45e17e0c` (folded into the Task 2 commit since it was discovered while staging Task 2's changes)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix, no behavior change)
**Impact on plan:** Cosmetic/hygiene fix only; the consistency module's behavior was correct before and after. No scope creep.

## Issues Encountered

**Full `npm test` verification (489 files, ~3,600+ tests) took ~25 minutes per run** on this machine — run twice (once incidentally under extra self-induced contention from parallel diagnostic re-runs, once clean). Both runs confirmed: every file touched by this plan (`consistency.ts`/its test, `generate-estimate.ts`/its two service test suites) and the full locked-path regression suite (`vagueness*.test.ts`, `graph-neutrality.test.ts`, `never-throw.test.ts`, `auto-refine-*.test.ts`, `quality-signal.test.ts`, `totals-authority.test.ts`, `compute-totals-guards.test.ts`) were 100% GREEN.

The clean run left 3 failures, none in files this plan touches (confirmed via `git log` on each path):
- `tests/unit/components/landing-page.test.tsx` — the SAME ambient portal-timing flake already fully diagnosed and documented in `deferred-items.md` from Phase 166-01 (machine-state-correlated, not code-correlated). Recurred here too; re-confirmed, not re-investigated.
- `tests/unit/mcp-route-contract.test.ts` — a NEW instance of the same flake class (a different file, Phase 87, untouched by 166-02) — a 15s explicit-timeout test failed under the same abnormally-slow `environment`/`import` phase signature (12-22s) seen on the landing-page flake, in the full run AND across three isolated single-file re-runs.
- `tests/unit/actions/recording-early-return-events.test.ts` — a genuinely different, DETERMINISTIC pre-existing bug (not a flake — reproduces every time, in and out of isolation): a `TypeError: supabase.from(...).select is not a function` at `lib/actions/recording.ts:286`, because this test's `companies` table mock (authored before Phase 167-01 added a `companies.select('tier')` entitlement check) never stubs `.select`. File last touched by Phase 167-01, untouched by 166-02.

All three are documented in `deferred-items.md` (out-of-scope, not fixed, per the GSD scope boundary) rather than fixed, since none are directly caused by this plan's changes.

## User Setup Required

None - no external service configuration required. `ESTIMATE_TOTAL_CEILING_USD` is an optional tuning env var (defaults to `2_000_000` with no env var set), consistent with the codebase's existing undocumented-by-default tuning envs (`ESTIMATE_DISCREPANCY_WARN_PCT`, `MAX_RESEARCH_ITEMS_PER_ESTIMATE`, `AUTO_REFINE_MAX_ATTEMPTS`) — none of which are listed in `.env.example` either.

## Next Phase Readiness

- Phase 166 criterion 4 (AIREL-04) is now TRUE: duplicates are collapsed before totals are computed, qty-0-with-price lines are flagged (never silently ignored), and a configurable absurdity ceiling routes to `awaiting_details` without ever silently succeeding or destructively deleting the estimate.
- 168-02 (photo captions, prompt-assembly region `:183-193` in the pre-edit line numbering) remains fully disjoint from this plan's changes (post-AI region, `~:295-450` + the `projectStatus` block near the end) — no merge conflict expected, and no reordering requirement was introduced.
- Follow-up (not in this plan's scope): migrate `ESTIMATE_TOTAL_CEILING_USD` to an admin-editable platform config; wire `needs-details-banner.tsx` to render a distinct "review — total unusually high" copy when an `estimate_over_ceiling_flagged` activity row exists for the current project (mirrors how `needs_details.reason` already differentiates the destructive vague-path copy).

## Self-Check: PASSED

- FOUND: lib/estimate/quality/consistency.ts
- FOUND: tests/unit/estimate/consistency.test.ts
- FOUND: lib/services/generate-estimate.ts
- FOUND: tests/unit/services/generate-estimate-research.test.ts
- FOUND: .planning/phases/166-ai-reliability-output-integrity/166-02-SUMMARY.md
- FOUND: .planning/phases/166-ai-reliability-output-integrity/deferred-items.md
- FOUND commit: 6f55b524 (Task 1)
- FOUND commit: 45e17e0c (Task 2)

---
*Phase: 166-ai-reliability-output-integrity*
*Completed: 2026-07-17*
