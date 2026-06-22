---
phase: 102-resilience-batch-autorefine-ttl
plan: 03
subsystem: api
tags: [langgraph, whatsapp, estimate-graph, batch-isolation, channel-adapter, vitest]

# Dependency graph
requires:
  - phase: 102-00
    provides: "batch-reporting.test.ts RED scaffold (HARD-05 acceptance test)"
  - phase: 102-01
    provides: "clean state.ts + whatsapp.ts after requestedAt/TTL edits (HARD-07)"
provides:
  - "Neutral droppedInputs { count, reasons } field on core EstimateState"
  - "WhatsApp ingest summarizes failed mediaResults into droppedInputs on partial success"
  - "WhatsApp finalize composes ONE aggregated dropped-item note into both reply bodies"
  - "Dedicated MEDIA_ITEM_NOTE reason map + buildDroppedNote aggregator (separate from frozen failureReasonToChannelCopy)"
affects: [103-eval-harness, whatsapp-batch, estimate-graph]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Carry-forward neutral summary on core state (count + reason enum, no channel token) to bridge a channel-superset sub-graph result into a neutral finalize node"
    - "Single aggregated reply note concatenated INTO the existing reply body — never a second send (never-reply invariant)"

key-files:
  created: []
  modified:
    - lib/estimate/graph/state.ts
    - lib/estimate/adapters/whatsapp.ts

key-decisions:
  - "droppedInputs is a neutral { count, reasons } summary on core state — count + generic reason codes only, no WhatsApp token, so graph-neutrality stays green"
  - "Per-item reason copy lives in a DEDICATED MEDIA_ITEM_NOTE map; the frozen failureReasonToChannelCopy is left byte-identical (git diff empty)"
  - "Total-failure batches keep the existing onError no-input path (no droppedInputs attached) — the per-item note is for partial success only"
  - "The note is aggregated to ONE count-based line and concatenated into the single existing reply — exactly one sendWhatsAppMessage per batch on every path"

patterns-established:
  - "Channel-superset ingest result → neutral core-state summary → neutral finalize node: the testable carry-forward bridge (Research Option 1)"

requirements-completed: [HARD-05]

# Metrics
duration: 7min
completed: 2026-06-21
---

# Phase 102 Plan 03: HARD-05 Per-Message WhatsApp Batch Reporting Summary

**A partial-failure WhatsApp batch now still builds the estimate AND notes the dropped item(s) in the single reply, via a neutral `droppedInputs` summary carried from ingest into finalize and an aggregated note composed into both reply bodies.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-21T20:13:38Z
- **Completed:** 2026-06-21T20:24:00Z
- **Tasks:** 2
- **Files modified:** 2 (source) + 1 (deferred-items.md)

## Accomplishments
- Added a neutral `droppedInputs: { count, reasons } | undefined` annotation to the channel-neutral core `EstimateState` — count + generic reason codes only, no channel token, graph-neutrality stays green.
- WhatsApp `ingest` now summarizes the failed `mediaResults` (the array dropped after ingest today) into `droppedInputs` and carries it forward on partial success; omits it on full success and on total failure (which stays owned by `onError`).
- WhatsApp `finalize` reads `state.droppedInputs` once and composes ONE aggregated, count-based note into BOTH reply bodies (askDetails + sendConfirmation) — concatenated into the single existing reply, never a second `sendWhatsAppMessage`.
- Added a dedicated `MEDIA_ITEM_NOTE` reason→copy map + `buildDroppedNote` aggregator at module scope, kept fully separate from the frozen `failureReasonToChannelCopy` (its git diff is empty).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add neutral droppedInputs to core state + summarize in ingest** - `988ca70` (feat)
2. **Task 2: Compose one aggregated dropped-item note into both finalize reply bodies** - `0a343cb` (feat)

_(Both tasks are `tdd="true"`; the RED test `batch-reporting.test.ts` was authored in Plan 102-00 — these two commits drive it GREEN, so no separate RED commit was created in this plan.)_

## Files Created/Modified
- `lib/estimate/graph/state.ts` - Added the neutral `droppedInputs { count, reasons }` annotation to `EstimateState`.
- `lib/estimate/adapters/whatsapp.ts` - ingest summarizes failed `mediaResults` → `droppedInputs`; module-scope `MEDIA_ITEM_NOTE` map + `buildDroppedNote`; finalize appends one aggregated note to both reply bodies.
- `.planning/phases/102-resilience-batch-autorefine-ttl/deferred-items.md` - Logged the pre-existing cross-file vitest worker-reuse leakage (out of scope).

## Decisions Made
- **Carry-forward via neutral core-state field (Research Option 1)** over the closure-capture alternative — explicit, testable, and keeps the summary channel-neutral so graph-neutrality holds.
- **Dedicated reason→copy map** (`MEDIA_ITEM_NOTE`) instead of overloading `failureReasonToChannelCopy` — the latter's strings are regression-frozen; its git diff is verified empty.
- **One aggregated count-based line** (not one line per item) keeps the reply tight and the never-reply invariant trivially intact.

## Deviations from Plan

None - plan executed exactly as written. (`MEDIA_ITEM_NOTE` is referenced via `void` in `buildDroppedNote` to keep the reason vocabulary as the documented single source of truth while the count-aggregated line is what the reply surfaces today — within the plan's explicit "MAY use MEDIA_ITEM_NOTE" discretion.)

## Issues Encountered
- **Full-suite (`npx vitest run tests/unit/estimate tests/unit/whatsapp`) shows ~12 failures across ~9 files** — this is the PRE-EXISTING cross-file vitest worker-reuse / module-state leakage (`sendWhatsAppMessage`/`sessionInserts` call counts accumulate across files sharing the `@/lib/whatsapp/estimate-graph` mock harness). Proven NOT a regression: every affected file (including `batch-reporting`, `never-reply-regression`, `replay-safe-ttl`) PASSES in isolation. Logged to `deferred-items.md`; recommended follow-up is a test-harness isolation pass (candidate for Phase 103). xphere untouched throughout.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HARD-05 complete. With HARD-06 (102-02 + 102-04) and HARD-07 (102-01) already shipped, Phase 102 (Resilience Hardening) is now functionally complete — all of HARD-05/06/07 done.
- Recommended non-blocking follow-up before Phase 103: the test-harness isolation pass for the pre-existing worker-reuse leakage (see `deferred-items.md`).

## Self-Check: PASSED

- FOUND: lib/estimate/graph/state.ts
- FOUND: lib/estimate/adapters/whatsapp.ts
- FOUND: .planning/phases/102-resilience-batch-autorefine-ttl/102-03-SUMMARY.md
- FOUND commit: 988ca70 (Task 1)
- FOUND commit: 0a343cb (Task 2)

---
*Phase: 102-resilience-batch-autorefine-ttl*
*Completed: 2026-06-21*
