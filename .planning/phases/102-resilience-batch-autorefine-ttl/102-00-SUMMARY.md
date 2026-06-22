---
phase: 102-resilience-batch-autorefine-ttl
plan: 00
subsystem: testing
tags: [vitest, rtl, react-testing-library, langgraph, whatsapp, tdd, red-scaffold]

# Dependency graph
requires:
  - phase: 101-unified-multimodal-ingestion-refine
    provides: canonical estimate graph + WhatsApp adapter (buildEstimateGraph, finalize TTL sites, checkVagueAfterAssessEdge)
provides:
  - "4 RED/EXTEND Wave-0 test files pinning Phase 102's three behaviors (HARD-05/06/07) before implementation"
  - "auto-refine-cap.test.ts — HARD-06 configurable cap (env-stubbed checkVagueAfterAssessEdge)"
  - "replay-safe-ttl.test.ts — HARD-07 requestedAt-derived expires_at across two graph invokes"
  - "batch-reporting.test.ts — HARD-05 partial-failure dropped-item note + total-failure no-input pin"
  - "needs-details-banner.test.tsx — HARD-06 recourse banner RTL (render/gate/CTA)"
affects: [102-01, 102-02, 102-03, 102-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env-stubbed module-constant test: vi.resetModules() + dynamic await import() per case so a module-load-time process.env read is fresh"
    - "Module-level insert-capture array extending the chainable Supabase mock to assert whatsapp_sessions insert payloads"
    - "Single chainable estimateRow that satisfies BOTH the assess re-read (total + sections.items) and finalize confirm re-read (total + currency_code + sections.title/subtotal)"

key-files:
  created:
    - tests/unit/estimate/auto-refine-cap.test.ts
    - tests/unit/whatsapp/replay-safe-ttl.test.ts
    - tests/unit/whatsapp/batch-reporting.test.ts
    - tests/unit/workspace/needs-details-banner.test.tsx
  modified: []

key-decisions:
  - "Drove non-vague (confirm) path by extending estimateRow with sections.items so the shared chainable mock is read as non-vague by the assess node (one generate call, no auto-refine loop)"
  - "Kept the HARD-05 dropped-item-note regex intentionally loose (/couldn't process 1/i) — Plan 03 owns exact wording; the load-bearing RED is mere presence of the note"
  - "TTL test invokes the graph twice spaced ~25ms apart so a Date.now()-minted TTL drifts while a requestedAt-derived one stays stable"

patterns-established:
  - "Wave-0 RED scaffold: each Phase 102 implementation plan references one of these files in its <verify>; written first to guarantee feedback latency and prevent implementation-with-no-test"

requirements-completed: [HARD-05, HARD-06, HARD-07]

# Metrics
duration: ~20min
completed: 2026-06-21
---

# Phase 102 Plan 00: Wave-0 RED/EXTEND Test Scaffold Summary

**Four RED vitest/RTL test files that pin Phase 102's three resilience behaviors (HARD-05 batch reporting, HARD-06 configurable cap + recourse UI, HARD-07 replay-safe TTL) before any implementation, each failing for the right reason — behavior-absent, not import/compile error.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-21T20:43Z (approx)
- **Completed:** 2026-06-21
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments
- `@testing-library/react@^16.3.2` confirmed present in devDependencies (with `jsdom@^29.0.2` + `@types/jsdom`) — no install needed; the banner RTL test runs.
- HARD-06 cap RED: `auto-refine-cap.test.ts` drives `checkVagueAfterAssessEdge` with a per-case `process.env.AUTO_REFINE_MAX_ATTEMPTS` stub via `vi.resetModules()` + dynamic import. Default-cap (5) and non-vague cases pass; the `AUTO_REFINE_MAX_ATTEMPTS=2, refineAttempts:1 → autoRefine` case is RED (source hard-codes `< 1`).
- HARD-07 TTL RED: `replay-safe-ttl.test.ts` invokes `buildEstimateGraph().invoke` twice with the same `requestedAt`, captures the `whatsapp_sessions` insert `expires_at`, and asserts stability + requestedAt-derivation. RED because finalize mints `Date.now()` and the WhatsApp wiring does not thread `requestedAt` yet.
- HARD-05 reporting RED: `batch-reporting.test.ts` — PARTIAL (1-of-2 ok:false) builds the estimate and emits exactly ONE reply; RED on the (loose) dropped-item note substring. TOTAL-failure routes to the existing no-input reply and is GREEN (pins the never-reply invariant so Plan 03 cannot regress it).
- HARD-06 recourse UI RED: `needs-details-banner.test.tsx` (RTL) — render + `awaiting_details` gate + CTA-fires-once; clean "module not yet created" RED (the component lands in Plan 04). `use-translation` stubbed identity per the established pattern.
- Existing invariant suites stay green: `never-reply-regression` + `graph-neutrality` + `auto-refine-isolation` = 9/9.

## Task Commits

Each task was committed atomically:

1. **Task 1: RTL confirm + cap & replay-safe-TTL RED tests** - `201afb0` (test)
2. **Task 2: batch-reporting RED + recourse-banner RTL RED** - `35e8537` (test)

_Note: the non-vague `estimateRow` extension (sections.items) added in Task 2 also touched the replay-safe-ttl file authored in Task 1; both committed in `35e8537`._

## Files Created/Modified
- `tests/unit/estimate/auto-refine-cap.test.ts` - HARD-06 cap: env-stubbed `checkVagueAfterAssessEdge` (default=1 preserved, override loops N).
- `tests/unit/whatsapp/replay-safe-ttl.test.ts` - HARD-07: same `requestedAt` → identical `expires_at` across two graph invokes (insert-capture mock).
- `tests/unit/whatsapp/batch-reporting.test.ts` - HARD-05: partial-failure estimate + one reply with dropped-item note; total-failure no-input pin.
- `tests/unit/workspace/needs-details-banner.test.tsx` - HARD-06 recourse banner RTL (render/gate/CTA).

## RED test → Wave-1/2 owner map
- `auto-refine-cap.test.ts` → **Plan 102-02** (HARD-06 cap): adds module constant `AUTO_REFINE_MAX_ATTEMPTS` (default 1) read by `checkVagueAfterAssessEdge`.
- `replay-safe-ttl.test.ts` → **Plan 102-01** (HARD-07): adds neutral `requestedAt` state field, threads it from the Inngest event entry, derives both TTL mint sites from `state.requestedAt ?? Date.now()`.
- `batch-reporting.test.ts` (partial-note) → **Plan 102-03** (HARD-05): carries a neutral dropped-input summary forward on core state, composes the per-item note into the single existing reply.
- `needs-details-banner.test.tsx` → **Plan 102-04** (HARD-06 recourse UI): creates `components/workspace/needs-details-banner.tsx` (Alert + Button) and wires the `awaiting_details` gate into `overview-tab.tsx`.

## Decisions Made
- **Non-vague drive shape:** the single chainable Supabase mock serves both the `assess` re-read (`total` + `sections.items`) and the finalize confirm re-read (`total` + `currency_code` + `sections.title/subtotal`). To force a clean non-vague (single-generate, no auto-refine loop) confirm path, `estimateRow` includes `sections: [{ title, subtotal, items: [{ id }] }]`. Without `items` the estimate assessed as vague and `generateEstimateForProject` fired twice (cap=1 auto-refine), which would have masked the intended assertions.
- **Loose dropped-item regex (HARD-05):** intentionally `/couldn't process 1/i` because Plan 03 finalizes the exact wording/pluralization; the load-bearing RED is the presence of any dropped-item note in the single reply.
- **Mock scoping:** every suite resets modules (`afterEach` `vi.resetModules()` / `vi.restoreAllMocks()`) and clears mocks in `beforeEach` so cross-suite runs do not leak.

## Deviations from Plan

None - plan executed exactly as written. The non-vague `estimateRow` shape (adding `sections.items`) was a within-spec authoring detail required by the plan's stated "make estimateRow non-vague so finalize hits sendConfirmation" instruction, not a deviation.

## Issues Encountered
- First PARTIAL/TTL runs hit the cap=1 auto-refine loop (two `generateEstimateForProject` calls) because the `estimateRow` lacked line items and was therefore assessed as vague. Resolved by adding `sections[].items` to the row so the assess node reads it as non-vague — both tests then exercised the intended confirm/reporting paths and RED only on the target assertions.

## Pre-existing / unrelated failures (out of scope)
- The wider `tests/unit/whatsapp` and `tests/unit/{ai,estimate,api}` sweep carries 12 PRE-EXISTING vitest worker-reuse timeout failures (generate-estimate-*, jobs-status, channel-adapter, step-runner) documented in Phase 101's `deferred-items.md` — unrelated to this plan, all green in isolation. Not touched here.

## Scope / safety
- xphere files untouched (out of scope per execution mode).
- No secrets introduced; gitleaks pre-commit hook passed on both task commits.
- All code/comments in English.

## Next Phase Readiness
- Every Phase 102 implementation plan (01-04) now has a failing automated check ready to turn green:
  - HARD-07 → 102-01, HARD-06 cap → 102-02, HARD-05 → 102-03, HARD-06 recourse UI → 102-04.
- No blockers.

## Self-Check: PASSED

- All 4 test files + SUMMARY.md present on disk.
- Both task commits (`201afb0`, `35e8537`) exist in git history.
- Consolidated run: 4 failed (intended REDs) + 6 passed; invariant suites 9/9 green.

---
*Phase: 102-resilience-batch-autorefine-ttl*
*Completed: 2026-06-21*
