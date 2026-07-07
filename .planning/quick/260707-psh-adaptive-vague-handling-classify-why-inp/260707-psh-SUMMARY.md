---
phase: quick-260707-psh
plan: 01
subsystem: ai-estimate-pipeline
tags: [ai, vagueness, i18n, capture-ux, settings, openrouter]

# Dependency graph
requires:
  - phase: quick-260707-mv1
    provides: "detected_trade + trade_mismatch_detected estimate_activity rows (raw material for the Settings auto-suggestion)"
  - phase: quick-260707-o7a
    provides: "capture-recorder final shape (attemptProgress state, handleEstimateOutcome, popup render branches) this plan wires the needs-details panel into"
provides:
  - "buildNeedsDetails (lib/ai/needs-details.ts): classify WHY a vague generation couldn't be priced (mic_test | too_short | missing_specifics) + 2-4 concrete clarifying questions in the estimate language, never-throw"
  - "projects.needs_details JSONB, written exactly once at the SINGLE final-vague terminal (default adapter's finalize, after auto-refine's one retry)"
  - "getAttemptOutcome needs_details enrichment (reason/questions, matched by attempt_id) threaded through pollEstimateOutcome to the popup"
  - "CaptureNeedsDetails panel (popup) + NeedsDetailsBanner enrichment (project page) — both replace generic vague copy with the classification + specific questions"
  - "getTradeSuggestion (lib/queries/company.ts): 3-of-5 trade_mismatch_detected threshold -> Settings company-page suggestion, with durable dismissal (companies.trade_suggestion_dismissed_at)"
affects: [any future capture-recorder outcome handling, any future Settings -> Company page work, any future vague-generation UX]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single wiring point for a terminal side-effect: buildNeedsDetails fires ONLY in the default adapter's finalize (isVague && refineAttempts>=1) — auto-refine's intermediate revert documents inline why it must never also call it (mirrors QUICK-mv1-01's skip-not-restore doctrine)"
    - "Promise.allSettled for best-effort multi-source enrichment inside a try/catch: each of 3 independent reads (recordings/photos/companies) degrades to its own safe default rather than one failure discarding data the others resolved"
    - "Dynamic UI values kept OUTSIDE t() literals (extractor requirement) — mirrors the existing '({n} left)' CaptureFailure pattern"

key-files:
  created:
    - lib/ai/needs-details.ts
    - components/capture/capture-needs-details.tsx
    - components/settings/trade-suggestion-banner.tsx
    - supabase/migrations/20260707000002_projects_needs_details.sql
    - supabase/migrations/20260707000003_companies_trade_suggestion_dismissed.sql
    - tests/unit/ai/needs-details.test.ts
    - tests/unit/queries/company-trade-suggestion.test.ts
  modified:
    - lib/estimate/adapters/default.ts
    - lib/estimate/graph/nodes/auto-refine.ts
    - lib/actions/attempt-outcome.ts
    - lib/estimate/poll-outcome.ts
    - components/capture/capture-recorder.tsx
    - components/workspace/needs-details-banner.tsx
    - components/workspace/overview-tab.tsx
    - lib/queries/project.ts
    - lib/queries/company.ts
    - lib/actions/settings.ts
    - app/(app)/settings/(tabs)/company/page.tsx
    - tests/unit/actions/attempt-outcome.test.ts
    - tests/unit/estimate/auto-refine-isolation.test.ts

key-decisions:
  - "buildNeedsDetails mirrors translateTextsOR's small-call pattern (direct OpenRouter fetch, no callWithFallback cascade) using OR_DEFAULTS.translation (haiku) — this is best-effort classification copy, not the estimate itself"
  - "Company-level dismissal has no lightweight per-company settings blob to reuse (checked: no generic JSONB metadata column on companies; estimate_activity rows require a NOT NULL project_id, unsuitable for a company-level marker) — used the plan's authorized fallback: a new companies.trade_suggestion_dismissed_at TIMESTAMPTZ column (second migration file, not in the plan's literal files_modified list but explicitly required by the truths' 'durable dismiss' criterion)"
  - "applyTradeSuggestion is a NEW small server action (not literally reusing updateCompanySettings) — reusing that action would require a full FormData payload of every company field and risk clobbering unrelated fields from a stale client form; the new action mirrors its auth/assertWritable pattern exactly and only touches industry/industries"
  - "getTradeSuggestion/getAttemptOutcome's needs_details enrichment both use the AUTHENTICATED (RLS-bound) supabase client passed in by the caller, matching getCompanySettings's existing pattern — not requireServiceClient, since both call sites already have an authenticated context"

requirements-completed: [QUICK-psh-01, QUICK-psh-02]

# Metrics
duration: ~80min
completed: 2026-07-07
---

# Quick 260707-psh: Adaptive Vague Handling — Classify-Why + Clarifying Questions + Trade Auto-Suggestion Summary

**A discarded-vague generation now classifies WHY (mic_test | too_short | missing_specifics) via one small OpenRouter call and persists 2-4 specific clarifying questions in the estimate language to `projects.needs_details`, surfaced in both the capture popup and the project-page banner; Settings → Company gets a one-tap "make this my primary trade" suggestion once 3 of the last 5 kept generations detected a different trade than configured.**

## Performance

- **Duration:** ~80 min
- **Completed:** 2026-07-07
- **Tasks:** 4/4 completed
- **Files modified:** 20 (7 created, 13 modified)

## Located surfaces (per plan instruction)

- **Vague terminal (exactly one wiring point):** `lib/estimate/adapters/default.ts`'s `finalize()`, gated on `state.isVague && (state.refineAttempts ?? 0) >= 1` — confirmed via the graph topology (`lib/estimate/graph/index.ts` / `decide.ts`'s `checkVagueAfterAssessEdge`) that `autoRefineNode` only fires on the FIRST vague verdict (before the cap), never on the terminal pass. A documenting comment was added to `auto-refine.ts` mirroring mv1's `revert.ts` precedent, explaining why that node must never also call `buildNeedsDetails`.
- **Needs-details banner (project page):** `components/workspace/needs-details-banner.tsx`, rendered from `components/workspace/overview-tab.tsx` when `project.status === 'awaiting_details'` (found via `grep -rn "awaiting_details" components/`).
- **Settings → Company page:** `app/(app)/settings/(tabs)/company/page.tsx` (server component using `getCompanySettings` + the authenticated `createClient()` — `getTradeSuggestion` was added alongside it).
- **Trade suggestion helper location:** `lib/queries/company.ts` (beside `getCompanySettings`, per the plan's "place beside existing company queries" instruction) rather than a new `lib/actions/` file, since it is a pure read.

## Task Commits

Each task was committed atomically:

1. **Task 1: Classification + questions at the vague terminal** - `3ec0f973` (feat)
2. **Task 2: Surface in popup + needs-details banner** - `04d8f77f` (feat)
3. **Task 3: Industry auto-suggestion (Settings)** - `ae7f7e75` (feat)
4. **Task 4: Tests** - `af1648a7` (test)
5. **Follow-up fix (found during final verification, see Deviations)** - `afb2a5c1` (fix)

_No plan-metadata commit — per this execution's constraints, STATE.md/ROADMAP.md are NOT updated and PLAN files are NOT staged; this SUMMARY is the only doc artifact for this plan._

## Accomplishments

- **`lib/ai/needs-details.ts` (new):** `buildNeedsDetails(transcriptOrDescription, language, industryHint?)` — one direct OpenRouter chat/completions call (mirrors `translateTextsOR`'s pattern; `OR_DEFAULTS.translation` model), STRICT JSON `{ reason, questions }`. `mic_test` always forces `questions: []`; `too_short`/`missing_specifics` cap at 4 concrete, non-blank questions. Wrapped end-to-end in try/catch — ANY failure (missing key, network, malformed JSON, HTTP error, provider error payload) degrades to `{ reason: 'missing_specifics', questions: [] }`.
- **`supabase/migrations/20260707000002_projects_needs_details.sql` (new, NOT applied):** `ALTER TABLE projects ADD COLUMN IF NOT EXISTS needs_details JSONB` with a documenting `COMMENT`.
- **`lib/estimate/adapters/default.ts`:** inside `finalize`'s existing vague-after-refine branch, after the `awaiting_details` status write, gathers `recordings`/`photos`/`state.prompts` + `companies.industry` (via `Promise.allSettled` — see Deviations), calls `buildNeedsDetails`, and persists `{ reason, questions, attempt_id: state.attemptId, created_at }` to `projects.needs_details`. Entirely wrapped in its own try/catch so a failure here can never undo the `awaiting_details` signal already persisted.
- **`lib/actions/attempt-outcome.ts`:** the `needs_details` `AttemptOutcome` variant now carries optional `reason`/`questions`, populated by a new `enrichNeedsDetails` helper that reads `projects.needs_details` (via the new `project_id` column added to the journal select) and only surfaces the enrichment when `needs_details.attempt_id === attemptId` — a stale needs_details from a prior discarded attempt on the same project never bleeds into a newer one's outcome. Tolerates a missing projectId or any read failure (bare `{ state: 'needs_details' }`).
- **`lib/estimate/poll-outcome.ts`:** `EstimateOutcome`'s `awaiting_details` variant gained optional `reason`/`questions`, forwarded straight from the journal-first `getAttemptOutcome` read.
- **`components/capture/capture-needs-details.tsx` (new):** compact panel (mirrors `CaptureFailure`'s structure) — `mic_test` → "That sounded like a mic test 🙂..."; specific questions → a bulleted list under "Almost there — a few details would make this priceable:"; absent enrichment → the existing path-specific `vagueMessage` fallback. Always ends with a "Record again" button.
- **`components/capture/capture-recorder.tsx`:** new `needsDetailsInfo` state replaces the old `toast.error(vagueMessage)` + immediate `setStage('idle')` in the `awaiting_details` branch of `handleEstimateOutcome` — the same reset side-effects (audioBlob/refs/attemptProgress) fire immediately, but `stage` is left as-is so the popup/fullscreen render shows `CaptureNeedsDetails` instead of flashing back to the recorder UI; its "Record again" button (`handleNeedsDetailsRecordAgain`) is what actually reveals the reset recorder UI. Reset at the top of every fresh `runPipeline`/`handleGenerate` dispatch so a Retry never shows a stale panel.
- **`components/workspace/needs-details-banner.tsx` + `overview-tab.tsx` + `lib/queries/project.ts`:** `ProjectDetail` gained a typed `needs_details` field (already returned by the existing `select('*')` once the migration lands); the banner renders the same mic_test copy / questions list / generic fallback as the popup panel, reusing the `Alert` primitive.
- **`lib/queries/company.ts` `getTradeSuggestion`:** reads the last 5 (or fewer) `trade_mismatch_detected` `estimate_activity` rows newer than any prior `trade_suggestion_dismissed_at`, and returns a suggestion when >= 3 agree on the same detected trade AND it still differs from the company's CURRENT `industry`. Never throws.
- **`lib/actions/settings.ts` `applyTradeSuggestion`/`dismissTradeSuggestion`:** Apply sets `companies.industry` directly + folds the trade into `industries` (via `resolveIndustries`); Dismiss stamps `trade_suggestion_dismissed_at`.
- **`components/settings/trade-suggestion-banner.tsx` (new)** + **Settings → Company page wiring:** dismissible `Alert` with Apply/Dismiss buttons; the dynamic trade name is kept OUTSIDE the `t()` calls (extractor requirement, mirrors `CaptureFailure`'s `({n} left)` pattern).
- **`supabase/migrations/20260707000003_companies_trade_suggestion_dismissed.sql` (new, NOT applied):** `companies.trade_suggestion_dismissed_at TIMESTAMPTZ` — the durable-dismiss fallback (see Decisions).

## Files Created/Modified

- `lib/ai/needs-details.ts` (new) — `buildNeedsDetails`, never-throw classify+questions AI call
- `components/capture/capture-needs-details.tsx` (new) — popup panel
- `components/settings/trade-suggestion-banner.tsx` (new) — Settings banner
- `supabase/migrations/20260707000002_projects_needs_details.sql` (new, NOT applied)
- `supabase/migrations/20260707000003_companies_trade_suggestion_dismissed.sql` (new, NOT applied)
- `tests/unit/ai/needs-details.test.ts` (new) — 9 tests
- `tests/unit/queries/company-trade-suggestion.test.ts` (new) — 7 tests
- `lib/estimate/adapters/default.ts` — wires `buildNeedsDetails` at the single final-vague terminal
- `lib/estimate/graph/nodes/auto-refine.ts` — documenting comment (no behavior change)
- `lib/actions/attempt-outcome.ts` — `needs_details` enrichment (`enrichNeedsDetails`, `project_id` in the journal select)
- `lib/estimate/poll-outcome.ts` — forwards `reason`/`questions` onto `awaiting_details`
- `components/capture/capture-recorder.tsx` — `needsDetailsInfo` state + panel wiring, resets at dispatch
- `components/workspace/needs-details-banner.tsx` — reason/questions rendering
- `components/workspace/overview-tab.tsx` — passes `project.needs_details` through
- `lib/queries/project.ts` — `ProjectDetail.needs_details` typed field
- `lib/queries/company.ts` — `getTradeSuggestion`
- `lib/actions/settings.ts` — `applyTradeSuggestion`, `dismissTradeSuggestion`
- `app/(app)/settings/(tabs)/company/page.tsx` — banner wiring
- `tests/unit/actions/attempt-outcome.test.ts` — 3 new needs_details enrichment tests
- `tests/unit/estimate/auto-refine-isolation.test.ts` — mocks extended (see Deviations)

## Decisions Made

See `key-decisions` in frontmatter. Most notable: the durable-dismiss mechanism needed a genuinely new column (no existing lightweight per-company settings blob was found to reuse — confirmed by grepping all `companies` migrations for a generic JSONB metadata column), which the plan explicitly authorized as a fallback ("if none is cheap, a `trade_suggestion_dismissed_at` check against newer mismatch rows").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Durable-dismiss column for the trade suggestion**
- **Found during:** Task 3
- **Issue:** The plan's must-have truth requires "no suggestion spam" via a durable dismiss, but no lightweight per-company settings mechanism exists to store a dismissal flag (checked: no generic JSONB metadata column on `companies`; `estimate_activity` rows require a NOT NULL `project_id`, which doesn't fit a company-level marker).
- **Fix:** Added a second migration (`20260707000003_companies_trade_suggestion_dismissed.sql`, NOT applied — orchestrator applies via MCP) adding `companies.trade_suggestion_dismissed_at TIMESTAMPTZ`, exactly the fallback the plan itself authorized.
- **Files modified:** `supabase/migrations/20260707000003_companies_trade_suggestion_dismissed.sql`, `lib/queries/company.ts`, `lib/actions/settings.ts`
- **Commit:** `ae7f7e75`

**2. [Rule 1 - Bug] `Promise.all` → `Promise.allSettled` in the needs-details enrichment**
- **Found during:** final verification pass (after Task 4), running the broader `tests/unit/estimate/` suite
- **Issue:** `lib/estimate/adapters/default.ts`'s new enrichment call used `Promise.all([getProjectRecordings, getProjectPhotos, companies.select])` inside a try/catch. Against `tests/unit/estimate/auto-refine-isolation.test.ts`'s pre-existing supabase mocks (which didn't anticipate these new reads), this produced "Unhandled Rejection" noise in the test run even though the outer try/catch correctly swallowed the failure and both tests still passed their assertions — a fragility signal, and separately, one query failing would have discarded data the other two DID resolve.
- **Fix:** Switched to `Promise.allSettled`, extracting each of the 3 results independently with its own safe default (`[]`/`[]`/`null`) — each input now degrades on its own rather than as an all-or-nothing unit. Also extended `auto-refine-isolation.test.ts`'s two `finalize()`-exercising mocks (`makeSupabaseMock` + Test D's inline mock) to resolve `recordings`/`photos`/`companies` harmlessly, since those tables are now read inside `finalize` and the pre-existing mocks (correctly, before this plan) didn't anticipate it.
- **Files modified:** `lib/estimate/adapters/default.ts`, `tests/unit/estimate/auto-refine-isolation.test.ts`
- **Verification:** `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` — 4/4 passed, zero unhandled-rejection output (previously: 4 unhandled-rejection entries alongside 4 passing tests).
- **Commit:** `afb2a5c1`

---

**Total deviations:** 2 auto-fixed (1 missing-critical column explicitly plan-authorized as a fallback, 1 bug/fragility fix discovered during final verification).
**Impact on plan:** Both fixes necessary for correctness (durable dismiss) and robustness (no unhandled-rejection noise, independent degradation of 3 unrelated reads). No architectural changes, no unrelated files touched, no scope creep.

## Issues Encountered

- **Two categories of PRE-EXISTING test issues found during verification, deliberately NOT fixed (out of scope per the scope-boundary rule) — logged to `.planning/quick/260707-psh-adaptive-vague-handling-classify-why-inp/deferred-items.md`:**
  1. `tests/unit/actions/attempt-outcome.test.ts` — 2 assertions predating this plan (from 260707-o7a's `completedSteps`/`activeStepStartedAt` addition to the `pending` variant) still expect the old 2-key pending shape. Verified pre-existing via `git stash` immediately after this plan's own Task 1 commit.
  2. `tests/unit/ai/` — 2 unrelated files (`empty-output-guards.test.ts`, `transcribe-fallback.test.ts`) intermittently fail ONLY when the full directory runs together (pass in isolation) — some pre-existing file leaks a `global.fetch` mock across files under Vitest's worker pool. Verified pre-existing by temporarily removing this plan's new `needs-details.test.ts` from the directory and reproducing the identical 2 failures.

## User Setup Required

**Two migrations must be applied by the orchestrator via Supabase MCP before this feature is live:**
- `supabase/migrations/20260707000002_projects_needs_details.sql` — `projects.needs_details JSONB`
- `supabase/migrations/20260707000003_companies_trade_suggestion_dismissed.sql` — `companies.trade_suggestion_dismissed_at TIMESTAMPTZ`

Until applied, `buildNeedsDetails`'s persistence write and `getTradeSuggestion`'s dismissal read will silently no-op / degrade to their safe defaults (both paths are never-throw), so the app will not break — the classify-why UX and the Settings suggestion simply won't have live data to show yet.

## Next Phase Readiness

- No blockers. Both migrations are additive (`ADD COLUMN IF NOT EXISTS`) and safe to apply at any time.
- Post-deploy manual verification (per the plan): a mic-test recording → friendly mic-test message in both the popup and the project banner; thin-but-real input → specific questions in both surfaces; after 3 mismatched-trade generations → the Settings → Company suggestion appears, Apply updates `industry`, Dismiss silences it until a fresh pattern accumulates.

## Self-Check: PASSED

- All 5 commits exist on `dev`: `3ec0f973`, `04d8f77f`, `ae7f7e75`, `af1648a7`, `afb2a5c1`
- Created files verified present: `lib/ai/needs-details.ts`, `components/capture/capture-needs-details.tsx`, `components/settings/trade-suggestion-banner.tsx`, both new migration files, both new test files, this SUMMARY
- `npx tsc --noEmit`: 22 errors before AND after (pre-existing baseline, zero new)
- `npx eslint` on every touched file: zero new problems (capture-recorder.tsx's 5 pre-existing React-Compiler/exhaustive-deps items unchanged, line numbers shifted only)
- Targeted suites: `tests/unit/ai/ tests/unit/actions/` → 209/211 passed (2 pre-existing, documented failures); `tests/unit/estimate/ tests/unit/capture/ tests/unit/queries/` → all green with zero unhandled-rejection noise after the Promise.allSettled fix

---
*Phase: quick-260707-psh*
*Completed: 2026-07-07*
