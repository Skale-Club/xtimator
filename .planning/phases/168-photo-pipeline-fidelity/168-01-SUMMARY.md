---
phase: 168-photo-pipeline-fidelity
plan: 01
subsystem: ai
tags: [inngest, vision, openrouter, gemini, supabase, pipeline-events, billing]

# Dependency graph
requires:
  - phase: 167-01
    provides: "transcription-section BILL-04/05/06 fixes in lib/ai/openrouter-client.ts (disjoint vision section reserved for this plan)"
provides:
  - "analyze-photos Inngest job: full-coverage null-filtered load + chunked (10/batch) vision analysis, replacing the 20-photo hard cutoff"
  - "skip-and-continue failure policy for photo batches (job fails only on zero successes)"
  - "pipeline_events.metadata (JSONB) column + PipelineEventInput.metadata — additive counts landing zone for 168-02's N-of-M UI"
  - "analyzePhotoOR finish_reason handling: base cap 450, one 600-cap retry, sentence-boundary trim fallback"
  - "analyzePhotoGemini symmetric 450 maxOutputTokens cap (previously uncapped)"
affects: [168-02, capture-progress-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chunked Promise.allSettled over per-item step.run (concurrency bounded, each item still independently memoized/retriable — never nest a chunk in its own step.run)"
    - "Skip-and-continue: zero-success throws, partial success proceeds and meters only the succeeded count"
    - "Additive JSONB metadata column + optional TS field for forward-compatible observability payloads"

key-files:
  created:
    - supabase/migrations/20260717000003_phase168_pipeline_events_metadata.sql
    - tests/unit/inngest/analyze-photos-coverage.test.ts
    - tests/unit/ai/vision-truncation.test.ts
  modified:
    - lib/inngest/functions/analyze-photos.ts
    - lib/ai/openrouter-client.ts
    - lib/ai/providers/gemini.ts
    - lib/observability/pipeline-events.ts
    - types/database.types.ts
    - tests/unit/inngest/analyze-photos-job.test.ts

key-decisions:
  - "load-photos stays a single step.run — inlining the null-filtered query would let a mid-run retry re-query a shrunken list and desync from already-memoized vision-${photoId} steps"
  - "Chunking (10/batch) bounds concurrency ONLY via Promise.allSettled at the handler level; each photo keeps its own vision-${photoId} step.run as a direct child (never nested — nested step.run is illegal in Inngest)"
  - "Metering (record-usage/record-credit-debit) gated on succeeded.length > 0 and billed for the succeeded count, never photos.length — a failed photo is never charged, and a fully-empty re-dispatch records nothing"
  - "pipeline_events.metadata is additive/nullable; only analyze's terminal succeeded event populates it for now (started/onFailure events unchanged) since the counts variables only exist at that point in the handler"
  - "Vision truncation retry keeps analyzePhotoOR's exported signature and empty-output guard untouched (locked by 167-01's own scope-fence test) — retry/trim logic lives entirely inside the primary path's closure"

patterns-established:
  - "Pattern: per-item step.run chunked via Promise.allSettled + a settled.forEach classification into succeeded/failed arrays is the template for any future Inngest job needing bounded concurrency with per-item retriability"

requirements-completed: [PHOTO-02, PHOTO-03, PHOTO-04]

# Metrics
duration: ~55min (implementation ~35min across 3 commits; remainder was the full-repo `npm test` run under heavy shared multi-agent CPU contention — see Verification below)
completed: 2026-07-17
---

# Phase 168 Plan 01: Photo Pipeline Fidelity (Coverage, Skip-and-Continue, Truncation) Summary

**Chunked full-coverage photo analysis (10/batch via Promise.allSettled) replacing the 20-photo hard cutoff, skip-and-continue failure policy metering only successes, and finish_reason-aware vision truncation handling (450/600 token caps + sentence-boundary trim) on both OpenRouter and Gemini vision paths.**

## Performance

- **Duration:** ~55 min (3 atomic commits over ~35 min; remainder was verification under heavy shared-machine load)
- **Started:** 2026-07-17 (session start)
- **Completed:** 2026-07-17T19:52:28Z (last task commit, `ce6bdcf6`)
- **Tasks:** 3/3 completed
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- **PHOTO-02 (audit E1):** `load-photos` now filters `.is('ai_description', null)` instead of `.order('sort_order').limit(20)` — photos 21+ were previously unreachable by ANY number of dispatches. Vision analysis processes the full list in chunks of 10 via `Promise.allSettled`, with each photo keeping its own memoized `vision-${photoId}` step.run (concurrency bounded, per-photo retriability/re-charge protection unchanged). A re-dispatch after a partial run only processes the null remainder — already-analyzed photos are never re-queried or re-charged.
- **PHOTO-03 (audit E3):** Skip-and-continue. The job now throws only when EVERY photo in a run fails (zero successes) — preserving today's `onFailure`/notify semantics for a total failure. Any partial success dispatches `generate-estimate` as before and meters `record-usage`/`record-credit-debit` for the **succeeded count only** (never `photos.length`) — mirrors `ingestMultimodal`'s per-item skip policy. A fully-empty re-dispatch (nothing left to analyze) skips metering entirely instead of recording a zero-unit usage event.
- **Counts landing zone:** `pipeline_events` gained an additive `metadata JSONB` column (migration `20260717000003`) and `PipelineEventInput`/`recordPipelineEvent` were extended additively. The analyze job's terminal `succeeded` event now carries `{ analyzedCount, totalCount, failedCount }` — the data 168-02's "N of M photos analyzed" UI will read off the journal (UI wiring itself is 168-02's job, per the plan).
- **PHOTO-04 (audit E4):** `analyzePhotoOR`'s base `max_tokens` raised 300 → 450; on `finish_reason: 'length'` it retries ONCE at 600; if still truncated, the text is trimmed at the last sentence-ending punctuation before persisting — a mid-sentence cutoff is never saved verbatim. `recordAICost` fires exactly once (for the final attempt), never once per retry. The Gemini vision fallback (`analyzePhotoGemini`) gained a symmetric 450 `maxOutputTokens` cap (previously uncapped — asymmetric outputs vs. the primary path).
- Updated the pre-existing structural test guard (`analyze-photos-job.test.ts:38`) that asserted the literal `photos.map(` for the new chunked shape, in the same commit as the rewrite.

## Task Commits

Each task was committed atomically:

1. **Task 1: Full coverage + chunking + re-analyze filter (PHOTO-02)** — `2ee6d4c2` (feat) — includes the pipeline_events metadata migration + `lib/observability/pipeline-events.ts` extension, since Task 1's `<action>` explicitly required wiring counts into the pipeline event metadata (the task's `<files>` tag under-listed this; the plan's frontmatter `files_modified` and prose were authoritative).
2. **Task 2: Skip-and-continue failure policy (PHOTO-03)** — `909e2361` (feat)
3. **Task 3: Vision truncation handling + cap parity (PHOTO-04)** — `ce6bdcf6` (feat)

_No separate "plan metadata" commit yet — this SUMMARY + REQUIREMENTS.md update is committed next._

## Files Created/Modified

- `lib/inngest/functions/analyze-photos.ts` - full-coverage chunked loading, skip-and-continue, counts in pipeline event metadata
- `lib/ai/openrouter-client.ts` - `analyzePhotoOR` vision-section-only: finish_reason retry/trim, 450/600 caps (transcription section untouched — verified by git diff and by 167-01's own scope-fence test in `tests/unit/billing/transcribe-short-circuit.test.ts`, which still passes)
- `lib/ai/providers/gemini.ts` - `analyzePhotoGemini` gains `config: { maxOutputTokens: 450 }` (disjoint from 166-01's `generateEstimate`/`refineEstimate` edits in the same file)
- `lib/observability/pipeline-events.ts` - additive `metadata` field on `PipelineEventInput` + insert
- `supabase/migrations/20260717000003_phase168_pipeline_events_metadata.sql` - `ALTER TABLE pipeline_events ADD COLUMN metadata JSONB` (idempotent, not applied directly — CI→GHCR→Coolify pipeline owns applying it, consistent with prior migrations)
- `types/database.types.ts` - `pipeline_events` Row/Insert/Update gain `metadata: Json | null` to stay in sync with the migration (the service-role client is untyped here, so this wasn't required for `tsc` to pass, but keeps the generated types accurate)
- `tests/unit/inngest/analyze-photos-coverage.test.ts` (new) - runtime harness (fake `step.run`, mocked service client/query-chain) covering 35-photo full coverage, null-filter/no-limit, cross-tenant scoping, 1-of-5-fail partial success + metering, 5-of-5-fail total failure, and zero-photos-to-process
- `tests/unit/ai/vision-truncation.test.ts` (new) - `finish_reason` stop/length/length-then-stop/length-both-with-no-punctuation cases, base cap assertion, single `recordAICost` call, empty-guard preserved
- `tests/unit/inngest/analyze-photos-job.test.ts` - updated the stale `photos.map(` structural assertion to the chunked `chunk.map(` + `Promise.allSettled(` shape

## Decisions Made

- **Task grouping vs. `<files>` tags:** Task 1's commit includes `lib/observability/pipeline-events.ts` and the migration file, which its `<files>` tag didn't list but its `<action>` prose explicitly required ("counts into the pipeline event metadata"). Treated the plan's frontmatter `files_modified` + task prose as authoritative over the abbreviated per-task `<files>` tag.
- **`types/database.types.ts` sync:** added even though not in the plan's `files_modified` — Rule 2 (keeping generated types accurate); zero behavior risk since `requireServiceClient()` returns an untyped client (no compile-time enforcement either way).
- **Metadata only on the succeeded terminal event:** the `started` event (fires before photos load) and the `onFailure` terminal event (fires from a separate handler with no access to the in-run succeeded/failed arrays) don't get counts — matches the plan's acceptance criteria, which only specifies counts on partial/full success.
- **Sentence-boundary trim with no punctuation found:** returns the untrimmed text rather than emptying it (an empty result would incorrectly trip the pre-existing empty-output guard and turn a truncated-but-present description into a hard failure).

## Deviations from Plan

None that required a checkpoint (Rule 4) — the two items below are Rule 2/documentation-scope clarifications, not architectural changes, and are captured above under "Decisions Made":

1. `types/database.types.ts` additive sync (not in `files_modified`, zero risk).
2. Task 1's commit scope followed the task's `<action>` prose (pipeline_events metadata + migration) over its narrower `<files>` tag.

**Total deviations:** 0 requiring escalation.
**Impact on plan:** None — plan executed as specified; the two items above are clarifications of an internal inconsistency between a task's `<files>` tag and its own `<action>` text, both already covered by the plan's frontmatter `files_modified`.

## Issues Encountered

- **Full-suite `npm test` under heavy shared-machine load:** this session ran inside a multi-agent parallel-execution workspace (phases 164/165/166/167/169 all executing concurrently in the same repo per `ROADMAP.md`'s explicit parallelization note — confirmed live via `tasklist` showing 30+ concurrent `node.exe` processes). The full `npm test` run took ~50 minutes and produced 3 `[vitest-pool-runner]: Timeout waiting for worker to respond` / "Failed to start forks worker" infrastructure errors (worker-startup timeouts, not assertion failures) in `tests/unit/billing/charge-amount.test.ts`, `tests/unit/settings/team-section-no-hardcode.test.ts`, and `tests/unit/color.test.ts` — none of which touch this plan's changes. Re-ran all three in isolation per the executor instructions ("re-run load-induced flakes in isolation and document"): **all 3 files passed cleanly (16/16 tests)**, confirming these were load-induced flakes, not regressions.
- Final full-suite tally: **432 passed / 3 failed (load-flakes, confirmed clean in isolation) / 1 skipped** test files; **3327 passed / 3 failed / 2 skipped / 21 todo** tests.
- Every file this plan touched, plus its directly adjacent regression suites (`credit-debit-wiring`, `transcribe-short-circuit` — including 167-01's own scope-fence assertion on `analyzePhotoOR`'s signature — `empty-output-guards`, `gemini-adapter`, `instrumentation-presence`, `multimodal-ingest`), was run in isolation multiple times across the three commits and stayed green throughout.

## User Setup Required

None - no external service configuration required. The migration is picked up by the existing CI→GHCR→Coolify deploy pipeline (not applied directly from this session, consistent with prior migrations in this repo).

## Next Phase Readiness

- 168-02 can read `pipeline_events.metadata` (`{ analyzedCount, totalCount, failedCount }`) off the analyze journal to build the "N of M photos analyzed" UI and wire photo captions into the generation prompt (PHOTO-01) — neither was touched here.
- `lib/services/generate-estimate.ts` was NOT touched (168-02 / 166-02 territory, per the plan's explicit scope fence).
- `lib/ai/openrouter-client.ts`'s transcription section (`transcribeAudioOR`) was NOT touched — verified via scoped `git diff` and by 167-01's own scope-fence test, which still passes unmodified.
- Noted but NOT fixed (out of this plan's file scope): `lib/actions/photo.ts`'s comment (~line 32-34) still references the now-removed `MAX_PHOTOS_PER_JOB=20` constant in `analyze-photos.ts`. Purely a stale comment (documentation drift, not a behavioral issue) — worth a one-line cleanup in a future quick task or 168-02.

---
*Phase: 168-photo-pipeline-fidelity*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 3 task commit hashes (`2ee6d4c2`, `909e2361`, `ce6bdcf6`) verified present in `git log --oneline --all`.
