---
phase: 168-photo-pipeline-fidelity
plan: 02
subsystem: ai
tags: [prompt-builder, generate-estimate, pipeline-events, capture-ui, i18n]

# Dependency graph
requires:
  - phase: 168-01
    provides: "pipeline_events.metadata { analyzedCount, totalCount, failedCount } recorded on the analyze/succeeded journal row"
  - phase: 166-02
    provides: "post-AI region of generate-estimate.ts (disjoint from this plan's prompt-assembly edit)"
provides:
  - "photos.caption folded into generate-estimate.ts's photoDescriptions, sanitized through the existing prompt-builder.ts sanitizeField boundary"
  - "analyzedCount/totalCount/failedCount threaded from the journal (attempt-outcome.ts) through poll-outcome.ts's StageProgress to capture-recorder.tsx's attemptProgress"
  - "\"N of M photos analyzed\" subtitle in capture-processing-overlay.tsx on partial coverage"
affects: [generate-estimate-prompt, capture-progress-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive optional fields threaded end-to-end through an existing payload chain (journal row -> server action -> poll loop -> component state -> component prop) with undefined treated as 'absent' at every hop, so non-photo/pre-analyze cases stay byte-identical"
    - "User-controlled free text folded into an existing untrusted-field string BEFORE it reaches the single sanitizeField wrapping point, rather than adding a parallel sanitization path"

key-files:
  created:
    - tests/unit/services/generate-estimate-captions.test.ts
    - tests/unit/estimate/poll-outcome-counts.test.ts
  modified:
    - lib/services/generate-estimate.ts
    - lib/actions/attempt-outcome.ts
    - lib/estimate/poll-outcome.ts
    - components/capture/capture-recorder.tsx
    - components/capture/capture-processing-overlay.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "No query change needed for captions: getProjectPhotos (lib/queries/photo.ts) already does select('*'), so Photo.caption was already populated at generate-estimate.ts:211-213 — only the string-building logic changed."
  - "Caption folded INTO the same string element that flows through prompt-builder.ts's sanitizeField/<photo_description> wrapping, not a parallel/separate tag — a caption gets IDENTICAL escaping + length-capping to ai_description, closing the injection-hardening gap the audit implicitly required."
  - "Coverage counts extracted only from the analyze/succeeded journal row's metadata (168-01's exact keys: analyzedCount/totalCount/failedCount) and spread into the pending outcome ONLY when numeric — a non-photo attempt (no analyze step) or malformed metadata produces an outcome object with the keys entirely ABSENT (not undefined-valued), matching the pre-168-02 shape byte-for-byte in every existing test."
  - "Partial-coverage subtitle condition: analyzedCount < totalCount OR failedCount > 0 — a batch that fully succeeded (20 of 20, 0 failed) renders nothing extra; any shortfall (still-in-progress OR a hard per-photo failure) surfaces the real count instead of the generic \"Analyzing photos\" label."
  - "String interpolation via t('of') + t('photos analyzed') outside the t() calls (matching the existing UndoImportBanner.tsx / team-section.tsx convention) rather than a single templated t() call, since the i18n extractor requires literal source strings."

requirements-completed: [PHOTO-01]

# Metrics
duration: ~70min
completed: 2026-07-17
---

# Phase 168 Plan 02: Photo Captions in Generation + N-of-M Coverage UI Summary

**Folds `photos.caption` into the generation prompt's `photoDescriptions` through the existing `sanitizeField` boundary (closing audit finding E2/PHOTO-01), and threads 168-01's journal-recorded analyze coverage counts through `attempt-outcome.ts` -> `poll-outcome.ts` -> `capture-recorder.tsx` into a new "N of M photos analyzed" subtitle on the capture processing overlay, completing PHOTO-02's user-visible half.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-17 (session start, after pulling 166-02/168-01/169-01)
- **Completed:** 2026-07-17T20:38:38Z
- **Tasks:** 2/2 completed
- **Files modified:** 7 (2 test files created, 5 source files modified, plus REQUIREMENTS.md)

## Accomplishments

- **PHOTO-01 (audit E2):** `generate-estimate.ts:211-213`'s `photoDescriptions` builder now folds a trimmed, present `photos.caption` alongside `ai_description` — `"Photo N (caption: <caption>): <ai_description>"` — while a photo with no caption (or a whitespace-only one) produces the exact pre-existing `"Photo N: <ai_description>"` string. No query change was required: `getProjectPhotos` (`lib/queries/photo.ts`) already `select('*')`s, so `Photo.caption` was already in scope. The resulting string still flows through `prompt-builder.ts`'s single `sanitizeField` call at the `<photo_description>` tag — verified directly with a malicious `<system>...</system> & "override"` caption, which comes out HTML-entity-escaped in `buildUserContent`'s output, identically to how `ai_description` is already hardened. No parallel/unsanitized path was added.
- **PHOTO-02 UI half (the deferred half of 168-01's audit finding):** `lib/actions/attempt-outcome.ts`'s journal read now selects `metadata` off `pipeline_events`, locates the `analyze`/`succeeded` row, and — only when the three fields are numeric — spreads `analyzedCount`/`totalCount`/`failedCount` (168-01's exact key names) onto the `pending` outcome payload. `lib/estimate/poll-outcome.ts`'s `StageProgress` interface grew the same three optional fields and forwards them verbatim in the pending branch's `onStageProgress` call. `components/capture/capture-recorder.tsx`'s `AttemptProgress` state and `handleStageProgress` carry the counts through to a new `CaptureProcessingOverlay` prop set. `components/capture/capture-processing-overlay.tsx` renders `"{N} {of} {M} {photos analyzed}"` (all three pieces run through `t()`) beneath the main progress label whenever coverage is partial (`analyzedCount < totalCount` or `failedCount > 0`); a fully-covered, zero-failure batch renders nothing extra.
- Every hop treats the counts as fully optional/absent-by-default: a non-photo capture mode (audio/text — no `analyze` step in the journal) or a not-yet-succeeded analyze step produces an outcome object where the three keys are **entirely absent** (not present with `undefined`), which is what every pre-existing test in `attempt-outcome.test.ts` and `poll-outcome.test.ts` already asserts via `toEqual` — both suites pass unmodified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Captions into the generation prompt (PHOTO-01)** — `fcbd7031` (feat) — `lib/services/generate-estimate.ts` + new `tests/unit/services/generate-estimate-captions.test.ts` (6 tests).
2. **Task 2: "N of M photos analyzed" UI (PHOTO-02 UI half)** — `854acb13` (feat) — `lib/actions/attempt-outcome.ts`, `lib/estimate/poll-outcome.ts`, `components/capture/capture-recorder.tsx`, `components/capture/capture-processing-overlay.tsx` + new `tests/unit/estimate/poll-outcome-counts.test.ts` (6 tests).

## Files Created/Modified

- `lib/services/generate-estimate.ts` - `photoDescriptions` builder folds `p.caption` (trimmed) into the per-photo string when present; byte-identical otherwise
- `lib/ai/prompt-builder.ts` - **unmodified**, verified by direct test: the existing `sanitizeField`/`<photo_description>` wrapping already covers the caption-folded string with no code change needed
- `lib/actions/attempt-outcome.ts` - `.select(...)` now includes `metadata`; `JournalRow.metadata` typed; `AttemptOutcome`'s `pending` variant gains optional `analyzedCount`/`totalCount`/`failedCount`, populated from the `analyze`/`succeeded` row's metadata when numeric
- `lib/estimate/poll-outcome.ts` - `StageProgress` gains the same three optional fields; the pending branch's `onStageProgress` call forwards them
- `components/capture/capture-recorder.tsx` - `AttemptProgress` interface + `handleStageProgress` + the `CaptureProcessingOverlay` call site all carry the three counts through (reset to absent via the existing `EMPTY_ATTEMPT_PROGRESS` on every new dispatch)
- `components/capture/capture-processing-overlay.tsx` - new `analyzedCount`/`totalCount`/`failedCount` props; `hasPartialCoverage` + `coverageSubtitle` computed and rendered as a `data-testid="capture-processing-coverage"` `<p>` beneath the main label
- `tests/unit/services/generate-estimate-captions.test.ts` (new) - caption folding (present/absent/whitespace-only/multi-photo indexing) via the real `generateEstimateForProject` + a direct `buildUserContent` sanitization/injection-escaping check
- `tests/unit/estimate/poll-outcome-counts.test.ts` (new) - `getAttemptOutcome` extraction (counts present, counts+failures present, no analyze step -> absent, malformed metadata -> absent/never-throws) + `pollEstimateOutcome` forwarding (with counts, without counts) via a dynamically-mocked `getAttemptOutcome`
- `.planning/REQUIREMENTS.md` - PHOTO-01 checked with an evidence note; PHOTO-02's note extended to credit 168-02's UI half; `PHOTO-01..04` traceability row -> Complete

## Decisions Made

- See `key-decisions` in the frontmatter above (query-change avoidance, single-sanitization-path, absent-vs-undefined key shape, partial-coverage condition, i18n interpolation convention).
- **Overlay condition scope:** the "N of M" subtitle logic checks `typeof analyzedCount === 'number' && typeof totalCount === 'number'` rather than gating on `mode === 'photos'` — the counts are simply never populated for other capture modes (enforced upstream at the journal-read layer), so the component-level condition alone is sufficient and stays decoupled from the mode prop.

## Deviations from Plan

None requiring a checkpoint (Rule 4). No architectural changes were needed — both tasks matched the plan's `<interfaces>` section exactly (the query-change avoidance and the `attempt-outcome.ts`-not-`poll-outcome.ts` journal-read location were both pre-resolved "Opus blockers" the plan itself flagged, and this execution followed them as written).

**Total deviations:** 0 requiring escalation.

## Issues Encountered

- **Severe shared-environment resource contention** (same documented condition as 164-02/167-02's SUMMARYs, which executed concurrently with this plan in the same working directory): a live `tasklist` check during verification showed 32 concurrent `node.exe` processes. Effects observed:
  - A background full `npm test` run was started early in this plan's execution and produced **zero output after 25+ minutes** — consistent with 164-02/167-02's prior documented experience. Not used as a verification signal; the targeted + blast-radius suites below were used instead, per the plan's own verification guidance ("targeted suites + tsc are the reliable signal").
  - `tests/eval/harness.test.ts` and `tests/eval/price-research-regression.test.ts` were run once as an extra-diligence check (neither is in this plan's scope or `files_modified`). One eval case timed out at the file's own 30s `vi.setConfig` ceiling, and a SECOND test in the same file then reported a wrong `lineItemCount` (4 vs. expected 2) — the classic Vitest failure-mode where a timed-out test's async work (the real AI graph invocation) keeps running in the background and its mock-capture side effects (a module-level `capture` object) leak into the NEXT test once it reassigns the same variable. Re-running the file alone immediately after failed even to start a worker (`[vitest-pool-runner]: Timeout waiting for worker to respond`), which unambiguously implicates system-wide contention rather than this plan's code: both touched files in this contamination (`price-research-regression.test.ts`, `harness.test.ts`) mock `getProjectPhotos` to return `[]` in every case, so Task 1's caption-folding change (a no-op on an empty photos array) cannot be the cause. Logged here per the deviation rules' scope-boundary guidance (out-of-scope discovery, not fixed) rather than in a separate `deferred-items.md`, since it's transient environmental noise, not a latent defect in either test file.
- No other issues. Every file this plan touches (and its directly adjacent pre-existing regression suites) was run in isolation and stayed green — see Verification below.

## Verification

Targeted suites (both plan-specified files):
```
npx vitest run tests/unit/services/generate-estimate-captions.test.ts tests/unit/estimate/poll-outcome-counts.test.ts
```
-> **12/12 passed** (6 + 6).

`npx tsc --noEmit -p tsconfig.ci.json` -> **clean, 0 errors** (run after each task and again after the final edit).

Blast-radius regression (every file this plan touches, plus its pre-existing test siblings), run in isolation:
- `tests/unit/services/generate-estimate.test.ts` + `generate-estimate-research.test.ts` (generate-estimate.ts consumers)
- `tests/unit/estimate/poll-outcome.test.ts` + `tests/unit/actions/attempt-outcome.test.ts` (poll-outcome.ts / attempt-outcome.ts pre-existing suites — assert the EXACT pre-168-02 payload shape via `toEqual`, still pass unmodified)
- `tests/unit/ai/prompt-builder.test.ts` (prompt-builder.ts, unmodified but load-bearing for the caption path)
- `tests/unit/api/generate-estimate-dispatch.test.ts`, `generate-estimate-name-patch.test.ts`, `generate-estimate-quota.test.ts`, `tests/unit/estimate/never-throw.test.ts` (other real callers of `generateEstimateForProject`)

All green: **55 + 19 = 74 additional tests passed**, on top of the 12 targeted tests (86 total observed green across this plan's verification pass), with 0 failures attributable to this plan's changes.

## User Setup Required

None — no external service configuration required. No DB migration (168-01's `pipeline_events.metadata` column is reused as-is, read-only here).

## Next Phase Readiness

- **Phase 168 (Photo Pipeline Fidelity) is now fully COMPLETE — 2/2 plans, PHOTO-01..04 all shipped.** 168-01 delivered full-coverage chunked analysis + skip-and-continue + truncation handling (PHOTO-02 backend half, PHOTO-03, PHOTO-04); this plan (168-02) delivered captions (PHOTO-01) and PHOTO-02's user-visible "N of M" half.
- No component test exists yet for `capture-processing-overlay.tsx` or `capture-recorder.tsx` (none existed before this plan either) — the plan marked this optional given the extraction+forwarding tests were the required gate; a future phase touching capture UI could add one cheaply using the `data-testid="capture-processing-coverage"` hook this plan added.
- `lib/actions/photo.ts`'s stale comment referencing the removed `MAX_PHOTOS_PER_JOB=20` constant (noted but not fixed in 168-01's SUMMARY) remains unaddressed — out of this plan's file scope too.

---
*Phase: 168-photo-pipeline-fidelity*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 3 created files verified present on disk (`168-02-SUMMARY.md`, `tests/unit/services/generate-estimate-captions.test.ts`, `tests/unit/estimate/poll-outcome-counts.test.ts`); both task commit hashes (`fcbd7031`, `854acb13`) verified present in `git log --oneline --all`.
