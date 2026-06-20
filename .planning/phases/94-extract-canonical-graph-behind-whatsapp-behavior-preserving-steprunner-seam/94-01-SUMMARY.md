---
phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
plan: 01
subsystem: testing
tags: [langgraph, inngest, vitest, whatsapp, durability, tdd, wave-0]

# Dependency graph
requires:
  - phase: 94-RESEARCH
    provides: "QA-01 frozen-test 3-path design + DURABLE-02 ready-to-commit artifact content"
provides:
  - "DURABLE-02 decision artifact (lib/estimate/graph/CHECKPOINTING.md): Inngest sole durability, no LangGraph checkpointer, StepRunner as the finer-resume seam"
  - "7 Wave 0 test files establishing the bisectable safety net for the canonical-graph extraction"
  - "QA-01 frozen never-throw/always-reply behavioral regression (3 paths, exactly-one-reply invariant) — GREEN against the current graph"
affects: [94-02, 94-03, 94-04, phase-95, phase-96, phase-97]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED-stub convention: dynamic/computed-specifier import (/* @vite-ignore */) so tests COLLECT cleanly and fail at RUN time against not-yet-existent Wave 2-4 source"
    - "Frozen behavioral regression: invoke the real composed graph with all side-effects mocked; assert exactly-one-reply + invoke-never-rejects to lock observable contract across a refactor"
    - "Requirement-ID-prefixed describe() titles for grep traceability (ENGINE-0x / DURABLE-0x / QA-01)"

key-files:
  created:
    - lib/estimate/graph/CHECKPOINTING.md
    - tests/unit/estimate/graph-neutrality.test.ts
    - tests/unit/estimate/channel-adapter.test.ts
    - tests/unit/estimate/vagueness.test.ts
    - tests/unit/estimate/never-throw.test.ts
    - tests/unit/estimate/step-runner.test.ts
    - tests/unit/estimate/no-checkpointer.test.ts
    - tests/unit/whatsapp/never-reply-regression.test.ts
  modified: []

key-decisions:
  - "QA-01 frozen test runs GREEN against the current WhatsApp graph today (not RED) — the point of a frozen test is that the contract holds now and breaks only if the Wave 2-4 extraction changes observable behavior"
  - "Partial-mock @/lib/whatsapp/ask-details (keep real buildAskDetailsMessage, spy revertVagueEstimate) so Path C asserts authentic localized ask-details copy"
  - "Chainable Supabase service mock with an estimateRow toggle drives the vague-vs-confirm branch deterministically"

patterns-established:
  - "Pattern 1: every Wave 0 stub is requirement-ID traceable and collects without a module-resolution crash"
  - "Pattern 2: the frozen behavioral test mocks sendWhatsAppMessage/AI/storage/Supabase and asserts reply count === 1 per failure path"

requirements-completed: [DURABLE-02, QA-01]

# Metrics
duration: ~6min (continuation; Tasks 1-2 in prior session)
completed: 2026-06-20
---

# Phase 94 Plan 01: Wave 0 Safety Net (DURABLE-02 artifact + 7 RED test stubs) Summary

**Landed the bisectable safety net for the canonical-graph extraction: the DURABLE-02 "Inngest-sole-durability / no-LangGraph-checkpointer" decision artifact plus all 7 Wave 0 test files, including the QA-01 frozen never-throw/always-reply behavioral regression that passes green against the current WhatsApp graph and locks the exactly-one-reply contract through the refactor.**

## Performance

- **Duration:** ~6 min (this continuation session; Tasks 1-2 completed in a prior session)
- **Started:** 2026-06-20T16:57:00Z (continuation)
- **Completed:** 2026-06-20T16:59:00Z
- **Tasks:** 3 (Task 1-2 prior, Task 3 this session)
- **Files modified:** 8 created (this session: 1 created)

## Accomplishments
- **QA-01 frozen regression (this session):** `tests/unit/whatsapp/never-reply-regression.test.ts` invokes the live WhatsApp-composed graph with mocked `sendWhatsAppMessage`/AI/storage/Supabase and asserts, across all three failure paths, that `graph.invoke` resolves (never rejects) AND exactly one reply is sent — Path A (no usable input → no-input copy), Path B (generation throws → failure-as-state → generation-failed copy), Path C (vague estimate → revert + `awaiting_details` session + ask-details copy). 3/3 green.
- **DURABLE-02 artifact (Task 1):** `lib/estimate/graph/CHECKPOINTING.md` captures the locked D-12 decision verbatim per RESEARCH.
- **6 estimate stubs (Task 2):** ENGINE-01..04 + DURABLE-01/02 RED stubs encode the real Wave 2-4 contracts; artifact-presence checks are green today.

## Task Commits

1. **Task 1: DURABLE-02 decision artifact** - `9519cb8` (docs) — prior session
2. **Task 2: 6 estimate-module test stubs** - `4e7900d` (docs/test) — prior session
3. **Task 3: QA-01 frozen never-throw/always-reply regression** - `9f45fc9` (test) — this session

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `lib/estimate/graph/CHECKPOINTING.md` - DURABLE-02 graph↔Inngest checkpoint-granularity decision artifact (no checkpointer; StepRunner is the finer-resume seam)
- `tests/unit/estimate/graph-neutrality.test.ts` - ENGINE-01 source-grep neutrality stub (RED)
- `tests/unit/estimate/channel-adapter.test.ts` - ENGINE-02 closure-factory stub (RED)
- `tests/unit/estimate/vagueness.test.ts` - ENGINE-03 vagueness truth-table at new path (RED)
- `tests/unit/estimate/never-throw.test.ts` - ENGINE-04 failure-as-state stub (RED)
- `tests/unit/estimate/step-runner.test.ts` - DURABLE-01 passthroughRunner + injection stub (RED)
- `tests/unit/estimate/no-checkpointer.test.ts` - DURABLE-02 artifact-present (GREEN) + no-saver compile (RED) stub
- `tests/unit/whatsapp/never-reply-regression.test.ts` - QA-01 frozen 3-path one-reply behavioral regression (GREEN against current graph)

## Decisions Made
- The QA-01 test passes green against today's graph rather than being RED — a frozen behavioral test must hold now and only break if observable behavior changes during extraction. This is the safety net's whole purpose.
- Path C uses a partial mock of `@/lib/whatsapp/ask-details` (real `buildAskDetailsMessage`/`isVagueEstimate`, spied `revertVagueEstimate`) so the reply-copy assertion is authentic while still observing the revert side-effect.
- A single chainable Supabase service mock with a per-path `estimateRow` toggle drives the evaluateVagueness re-read deterministically, mirroring the `ask-details.test.ts` mock style.

## Deviations from Plan
None - plan executed exactly as written. The QA-01 test asserts against the current graph (`buildEstimateGraph()` from `lib/whatsapp/estimate-graph.ts`), which the plan explicitly anticipates ("it should run against the current buildEstimateGraph()").

## Issues Encountered
None. The full Wave 0 run (`tests/unit/estimate` + the QA-01 test) shows the expected RED-by-design state: 26 passed / 17 failed, all failures being run-time "Cannot find package '@/lib/estimate/...'" against not-yet-existent Wave 2-4 source — NOT collection crashes. The QA-01 test and the no-checkpointer artifact-presence tests are green.

## Commit Isolation
The working tree contains an UNRELATED loading-skeletons redesign (68 modified/untracked files: `app/**/loading.tsx`, `components/skeletons/`, `card.tsx`, `project-workspace.tsx`, settings files). These were left completely untouched. The Task 3 commit `9f45fc9` contains exactly one file (`tests/unit/whatsapp/never-reply-regression.test.ts`); the SUMMARY/state commit uses explicit `--files` paths. No `git add -A`/`.`/`-a` was ever used.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 0 safety net is complete: every Wave 2-4 task now has a concrete `<automated>` verify target and the extraction is bisectable.
- Plan 94-02 (canonical graph + adapters source) can proceed; the ENGINE-01..04 / DURABLE-01 stubs flip green as the source lands.
- Plan 94-03 (WhatsApp rewire green gate) must keep the QA-01 frozen test green with NO assertion changes — that is the behavior-preserving gate.

## Self-Check: PASSED
- FOUND: `.planning/phases/94-.../94-01-SUMMARY.md`
- FOUND: `tests/unit/whatsapp/never-reply-regression.test.ts`
- FOUND: `lib/estimate/graph/CHECKPOINTING.md`
- FOUND commit: `9f45fc9` (Task 3)

---
*Phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam*
*Completed: 2026-06-20*
