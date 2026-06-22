---
phase: 102-resilience-batch-autorefine-ttl
plan: 01
subsystem: api
tags: [langgraph, inngest, whatsapp, ttl, replay-safety, estimate-graph]

# Dependency graph
requires:
  - phase: 102-00
    provides: replay-safe-ttl.test.ts RED scaffold (HARD-07)
  - phase: 94-extract-canonical-graph
    provides: channel-neutral EstimateState + WhatsApp ChannelAdapter (finalize TTL mint sites)
  - phase: 95-migrate-web-mcp
    provides: generate-estimate.ts orchestrate-estimate step with t0 handler-entry timestamp
provides:
  - "Neutral requestedAt epoch-ms field on core EstimateState (channel-neutral, graph-neutrality-safe)"
  - "Both WhatsApp finalize TTL mint sites derive expires_at from state.requestedAt ?? Date.now() (replay-safe)"
  - "requestedAt threaded from both Inngest handler entries (generate t0, whatsapp Date.now()) through the graph invoke"
affects: [102-03, 102-04, HARD-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Replay-safe TTL: derive expiry from a durable server-trusted graph-entry timestamp carried in state, never re-mint Date.now() inside a node"
    - "Single handler-entry timestamp captured OUTSIDE step.run so an Inngest retry of the step reuses the same value"

key-files:
  created: []
  modified:
    - lib/estimate/graph/state.ts
    - lib/estimate/adapters/whatsapp.ts
    - lib/whatsapp/estimate-graph.ts
    - lib/inngest/functions/whatsapp-process.ts
    - lib/inngest/functions/generate-estimate.ts

key-decisions:
  - "requestedAt is Annotation<number | undefined>() — optional so direct invokers (unit tests) without it still work via the ?? Date.now() fallback (no Invalid Date)"
  - "SESSION_TTL_MINUTES (30) left byte-identical; only the base timestamp source changed"
  - "WhatsApp handler captures requestedAt = Date.now() at entry (outside step.run); generate handler reuses the existing t0 — same replay-safety guarantee on both paths"

patterns-established:
  - "Replay-safe TTL: base = state.requestedAt ?? Date.now(); expiresAt = new Date(base + SESSION_TTL_MINUTES*60*1000).toISOString()"

requirements-completed: [HARD-07]

# Metrics
duration: 18min
completed: 2026-06-21
---

# Phase 102 Plan 01: Replay-Safe Session TTL (HARD-07) Summary

**WhatsApp session/awaiting-state TTLs now derive from a durable, channel-neutral `requestedAt` epoch carried in core graph state and threaded from both Inngest handler entries — so an Inngest retry/replay no longer drifts `expires_at`; `SESSION_TTL_MINUTES` (30) unchanged.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-21T19:56Z
- **Completed:** 2026-06-21T20:03Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added a neutral `requestedAt: Annotation<number | undefined>()` to the core `EstimateState` (channel-neutral; graph-neutrality 2/2 stays green — no WhatsApp token).
- Both WhatsApp finalize TTL mint sites (awaiting_details + awaiting_confirm) now compute `base = state.requestedAt ?? Date.now()` and derive `expires_at` from it. The `?? Date.now()` fallback keeps direct invokers (unit tests) valid.
- Threaded `requestedAt` end-to-end: handler entry → `WhatsAppInitialState` → channel-neutral core invoke → finalize; and into the generate-estimate invoke via the existing `t0`.
- `replay-safe-ttl.test.ts` now GREEN (same `requestedAt` → identical `expires_at` across re-invocation; equals `requestedAt + 30min`, not a post-invoke `Date.now()` re-mint).
- Updated the `whatsapp.ts` file-header NOTE from "mints Date.now() inside finalize" to a past-tense "DONE via state.requestedAt per HARD-07" note.

## Task Commits

Each task committed atomically:

1. **Task 1: requestedAt state field + both whatsapp.ts TTL sites derive from it** - `23f42da` (feat)
2. **Task 2: thread requestedAt through both Inngest graph entry points** - `c03cfde` (feat)

_Note: the RED scaffold (replay-safe-ttl.test.ts) only flips GREEN once Task 2 threads `requestedAt` through the WhatsApp wrapper, since the test invokes via `buildEstimateGraph()`. The two tasks are coupled for that gate; both were verified green before committing._

## Files Created/Modified
- `lib/estimate/graph/state.ts` - Added neutral `requestedAt` annotation (epoch ms, server-trusted graph-entry timestamp).
- `lib/estimate/adapters/whatsapp.ts` - Both TTL sites derive expiry from `state.requestedAt ?? Date.now()`; header NOTE updated to reflect HARD-07 done.
- `lib/whatsapp/estimate-graph.ts` - `WhatsAppInitialState` gains `requestedAt?: number`; wrapper passes it into the channel-neutral core invoke.
- `lib/inngest/functions/whatsapp-process.ts` - Captures `requestedAt = Date.now()` at handler entry (outside `step.run`) and threads it into the invoke.
- `lib/inngest/functions/generate-estimate.ts` - Threads the existing `t0` as `requestedAt` into the graph invoke initial state.

## Verification

- `npx vitest run tests/unit/whatsapp/replay-safe-ttl.test.ts` — GREEN (2/2).
- `npx vitest run tests/unit/estimate/graph-neutrality.test.ts tests/unit/whatsapp/never-reply-regression.test.ts tests/unit/estimate/auto-refine-isolation.test.ts tests/unit/estimate/auto-refine-cap.test.ts` — all GREEN (invariants hold; no regression).
- `npx vitest run tests/unit/inngest/whatsapp-process-job.test.ts tests/unit/inngest/generate-estimate-job.test.ts` — GREEN (9/9).
- `grep "state.requestedAt" lib/estimate/adapters/whatsapp.ts` — BOTH TTL sites converted (lines 359, 391).
- `grep "requestedAt"` across the wrapper + both Inngest functions — threaded at all three sites.
- `tsc --noEmit` — zero errors in any of the 5 modified source files (pre-existing test-file/xphere/notifications/102-04-banner errors are out of scope).

## Decisions Made
- Made `requestedAt` optional (`number | undefined`) so any caller that omits it (direct unit-test invokers) falls back to `Date.now()` cleanly — no `new Date(undefined + ...)` Invalid Date. The Inngest path always supplies it, so replays are stable.
- Left `SESSION_TTL_MINUTES` and the `< / +` arithmetic byte-identical; only the base timestamp source changed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. After Task 1 alone, `replay-safe-ttl.test.ts` was still RED (the WhatsApp wrapper had not yet threaded `requestedAt` into core state, so finalize fell back to `Date.now()`). This was expected — Task 2 threads the value through, after which both tasks' verifications passed. xphere files untouched.

## Known Stubs
None.

## Next Phase Readiness
- HARD-07 complete and marked done.
- Note for Plan 102-03 (HARD-05) and Plan 102-04 (HARD-06 recourse UI): **`lib/estimate/graph/state.ts` AND `lib/estimate/adapters/whatsapp.ts` are also touched by Plan 03** (it adds a neutral `droppedInputs` summary to state and a per-item failure note in both whatsapp finalize reply builders). Both files are left in a clean state here; Plan 03 builds on top.
- Remaining RED (not in this plan's scope): `batch-reporting.test.ts` → 102-03, `needs-details-banner.test.tsx` → 102-04.

## Self-Check: PASSED

All 5 modified source files + SUMMARY.md present on disk; both task commits (`23f42da`, `c03cfde`) found in git history.

---
*Phase: 102-resilience-batch-autorefine-ttl*
*Completed: 2026-06-21*
