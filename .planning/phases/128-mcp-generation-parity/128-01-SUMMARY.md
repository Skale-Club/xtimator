---
phase: 128-mcp-generation-parity
plan: 01
subsystem: api
tags: [mcp, inngest, agent-tools, channel-parity, idempotency, generation]

# Dependency graph
requires:
  - phase: 122-channel-neutral-agent-tools
    provides: "neutral lib/agent-tools/createEstimate (EVENT_ESTIMATE_GENERATE dispatch core)"
  - phase: 124-chat-backend
    provides: "lib/chat/tools.ts web-chat binding of createEstimate (channel:'web') — the precedent mirrored"
  - phase: 127-mcp-read-tools
    provides: "the companyId-trusted / readOnlyHint MCP tool-binding pattern over the v4.1 MCP server"
provides:
  - "MCP create_estimate delegates generation to the neutral createEstimate (channel:'mcp') — no inline inngest.send"
  - "Channel-namespaced Inngest idempotency id on the neutral fn (estimate-<channel>-<projectId>-<requestId>)"
  - "MPAR-01 static binding + three-channel convergence parity test"
  - "Three siblings, one core — web chat / MCP / WhatsApp all route generation through one engine"
affects: [mcp, agent-tools, multi-channel-core]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Channel adapter (lib/mcp/tools) delegates to the neutral core; keeps only its own auth/scope/ownership pre-flight + channel envelope"
    - "Channel-namespaced Inngest idempotency id derived from a neutral param (no channel-specific token — neutrality preserved)"
    - "Static binding/grep test (readFileSync) as the companion to a behavioral guard"

key-files:
  created:
    - tests/unit/mcp/mcp-generation-parity.test.ts
  modified:
    - lib/agent-tools/create-estimate.ts
    - lib/mcp/tools/write.ts
    - tests/unit/agent-tools/create-estimate.test.ts

key-decisions:
  - "Option A: widen the neutral createEstimate id to fold in `channel` (estimate-<channel>-<projectId>-<requestId>) — the single justified widening; channel is already a neutral param so the neutrality gate stays green and the MCP behavior test's estimate-mcp-p1- assertion stays green unchanged"
  - "MCP keeps its own mcp:write scope gate + project-ownership lookup + {job_id,status,message} envelope; ONLY the EVENT_ESTIMATE_GENERATE dispatch is delegated"
  - "The behavior guard (tests/unit/mcp-create-estimate.test.ts) stays byte-unchanged; the real neutral fn runs against the same leaf-mocked @/lib/inngest/client so the payload + id assertions keep working (no vi.mock of @/lib/agent-tools)"

patterns-established:
  - "Pattern: a channel adapter binds the neutral generation core rather than re-implementing the Inngest dispatch"
  - "Pattern: prove a non-destructive refactor with a static binding test + an unchanged behavior guard"

requirements-completed: [MGEN-01, MPAR-01]

# Metrics
duration: 7min
completed: 2026-06-25
---

# Phase 128 Plan 01: MCP Generation Reconciliation + Parity Summary

**MCP create_estimate now delegates generation to the channel-neutral createEstimate (channel:'mcp'), with a channel-namespaced Inngest idempotency id — closing the WhatsApp = web chat = MCP "three siblings, one core" principle and milestone v4.10.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-25T10:37:57Z
- **Completed:** 2026-06-25T10:44:47Z
- **Tasks:** 3
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- Widened the neutral `createEstimate` idempotency id to be channel-namespaced (`estimate-<channel>-<projectId>-<requestId>` when a channel is passed, `estimate-<projectId>-<requestId>` otherwise) — a single justified widening that preserves the neutrality gate (channel is already a neutral param) and keeps the MCP behavior test's `estimate-mcp-p1-` assertion green.
- Delegated `handleCreateEstimate` (lib/mcp/tools/write.ts) to the neutral `createEstimate({..., channel:'mcp'})`, removing the inline `inngest.send(EVENT_ESTIMATE_GENERATE)` block and the now-dead imports (`randomUUID`, `inngest`, `EVENT_ESTIMATE_GENERATE`, `EstimateGeneratePayload`). Kept the `mcp:write` scope gate, project-ownership lookup, and the `{job_id,status,message}` envelope verbatim.
- Added the MPAR-01 static binding + three-channel convergence parity test proving write.ts binds the neutral core, no longer references `EVENT_ESTIMATE_GENERATE`, and all three adapters (chat/createEstimate, mcp/createEstimate, whatsapp/generateEstimateForProject) converge on one engine.
- The existing v4.1 MCP behavior suite (create_estimate, check_job_status, registry) stays GREEN byte-unchanged — the refactor is non-destructive.

## Task Commits

Each task was committed atomically:

1. **Task 1: Channel-namespace the neutral createEstimate idempotency id** - `be2b6d1f` (feat)
2. **Task 2: Delegate MCP handleCreateEstimate to the neutral createEstimate (MGEN-01)** - `1241e84a` (feat)
3. **Task 3: Add MPAR-01 static binding + three-channel convergence parity test** - `88bbd166` (test)

_Task 1 was TDD (RED via the new channel-id assertions in create-estimate.test.ts → GREEN via the widened id). Task 2's RED-equivalent is the unchanged behavior guard mcp-create-estimate.test.ts, which stayed green through the delegation._

## Files Created/Modified
- `lib/agent-tools/create-estimate.ts` - Channel-namespaced the Inngest event id; updated the module doc comment to note the single justified widening.
- `lib/mcp/tools/write.ts` - `handleCreateEstimate` delegates to the neutral `createEstimate` (channel:'mcp'); dropped the inline dispatch + dead imports; reworded doc comments to drop the `EVENT_ESTIMATE_GENERATE` reference (so the MPAR-01 static test passes).
- `tests/unit/agent-tools/create-estimate.test.ts` - Asserts all three id forms (mcp / web / no-channel).
- `tests/unit/mcp/mcp-generation-parity.test.ts` - NEW: MPAR-01 static binding + three-channel convergence proof (readFileSync + grep, no DB/mocks/secrets).

## Decisions Made
- **Option A (id widening over a separate MCP id):** folded `channel` into the neutral fn's id rather than re-introducing an MCP-specific id in write.ts — gives every channel a distinct Inngest dedupe namespace from one place and keeps the `estimate-mcp-p1-` behavior assertion green for free.
- **Did NOT mock `@/lib/agent-tools` in the existing behavior test** — the real neutral fn runs against the same leaf-mocked `@/lib/inngest/client`, so the inngestSend payload + id assertions keep working unchanged (Pitfall 5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed two doc-comment references to `EVENT_ESTIMATE_GENERATE` in write.ts**
- **Found during:** Task 2 (delegation) / surfaced by Task 3's acceptance criterion
- **Issue:** The plan's acceptance criterion `grep -c "EVENT_ESTIMATE_GENERATE" lib/mcp/tools/write.ts` must return 0, and the MPAR-01 test asserts write.ts does NOT contain `'EVENT_ESTIMATE_GENERATE'`. After deleting the dispatch code, two prose mentions remained: the top-of-file doc block and a comment I added in the dispatch block.
- **Fix:** Reworded both comments to describe the delegation ("delegates to the channel-neutral createEstimate", "generation-event dispatch is delegated") without naming the constant.
- **Files modified:** lib/mcp/tools/write.ts
- **Verification:** `grep -c "EVENT_ESTIMATE_GENERATE" lib/mcp/tools/write.ts` → 0; MPAR-01 test 3/3 green; MCP behavior suite still 37/37 green.
- **Committed in:** 1241e84a (Task 2 commit)

**2. [Rule 2 - Robustness] Added an explicit literal-string binding assertion in the MPAR-01 test**
- **Found during:** Task 3 (parity test)
- **Issue:** The plan's regex form `/from '@\/lib\/agent-tools(\/create-estimate)?'/` satisfied the behavior but did not satisfy the acceptance grep `grep -n "from '@/lib/agent-tools"` (the source line was escaped). To make the binding intent grep-discoverable and explicit, added a plain `toContain("from '@/lib/agent-tools'")` alongside the regex.
- **Fix:** Added one `expect(src).toContain("from '@/lib/agent-tools'")` line.
- **Files modified:** tests/unit/mcp/mcp-generation-parity.test.ts
- **Verification:** acceptance grep returns the match; test 3/3 green.
- **Committed in:** 88bbd166 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 robustness)
**Impact on plan:** Both were necessary to satisfy the plan's own acceptance criteria; no scope creep, no behavior change to shipped code.

## Issues Encountered
- The full `npx vitest run` shows 1 failure: `tests/unit/mcp-route-contract.test.ts` GET-405 — the KNOWN parallel-only timeout flake. Re-confirmed **8/8 GREEN in isolation** (`npx vitest run tests/unit/mcp-route-contract.test.ts`). It touches no Phase-128 file. Effective full-suite result: 336 files passed, 2354 tests passed.

## Verification
- MGEN-01: `npx vitest run tests/unit/mcp-create-estimate.test.ts tests/unit/mcp-check-job-status.test.ts tests/unit/mcp-tool-registry.test.ts tests/unit/agent-tools/create-estimate.test.ts` → all green (behavior guard byte-unchanged + widened neutral test).
- MPAR-01: `npx vitest run tests/unit/mcp/mcp-generation-parity.test.ts tests/unit/agent-tools/neutrality.test.ts` → green (static binding + neutrality preserved).
- Phase gate: full `npx vitest run` → 336 files / 2354 passed; the only fail is the known parallel-only mcp-route-contract flake (8/8 in isolation).
- `npx tsc --noEmit` → no errors in lib/mcp/tools/write.ts or lib/agent-tools/create-estimate.ts (no dead imports left).

## User Setup Required
None - no external service configuration required. No migration, no new dependency, no secret.

## Next Phase Readiness
- Milestone v4.10 (MCP Channel Parity) and the Multi-Channel Core track are CLOSED: WhatsApp = web chat = MCP all bind the v4.9 neutral `lib/agent-tools/` core for generation, query, and knowledge.
- Next: `/gsd:verify-work 128`, then `/gsd:complete-milestone` for v4.10.

## Self-Check: PASSED

- Files verified present: tests/unit/mcp/mcp-generation-parity.test.ts, 128-01-SUMMARY.md, lib/agent-tools/create-estimate.ts, lib/mcp/tools/write.ts.
- Commits verified present: be2b6d1f, 1241e84a, 88bbd166.

---
*Phase: 128-mcp-generation-parity*
*Completed: 2026-06-25*
