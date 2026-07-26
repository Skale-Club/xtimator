---
phase: 180-isolated-demo-session-read-only-foundation
plan: 10
subsystem: mcp-agent-security
tags: [mcp, agent-tools, oauth, read-only, security, vitest, tdd]

# Dependency graph
requires:
  - phase: 180-02
    provides: "Canonical explicit-company demo write classifier"
  - phase: 180-09
    provides: "Browserless OAuth bearer contexts bound to trusted company identity"
provides:
  - "Guard-before-service enforcement for all six MCP write tools"
  - "Defense-in-depth demo denial at every channel-neutral agent write funnel"
  - "Browserless stale demo-company bearer and no-effect regression coverage"
affects: [180-11, 180-12, 180-14, phase-181, mcp, agent-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP write handlers classify auth.company_id before constructing a service-role client"
    - "Channel-neutral agent tools repeat explicit-company denial before credits, persistence, embedding, queue, or send effects"

key-files:
  created:
    - tests/unit/demo/mcp-agent-boundaries.test.ts
  modified:
    - lib/mcp/tools/write.ts
    - lib/agent-tools/create-estimate.ts
    - lib/agent-tools/create-project.ts
    - lib/agent-tools/create-service.ts
    - lib/agent-tools/add-knowledge.ts
    - lib/agent-tools/send-customer-message.ts

key-decisions:
  - "The OAuth/MCP company_id and agent-tool companyId parameters are the trusted browserless authority; these paths never recover company state from browser cookies."
  - "MCP guards run after scope and input validation but before service-role construction, while agent guards repeat at each public effect funnel for defense in depth."
  - "Demo denial throws the canonical read-only message; normal tenants retain existing return and MCP response contracts."

patterns-established:
  - "Every browserless write boundary passes its already-authenticated company identity directly to assertCompanyWritable()."
  - "Read-only MCP tools remain outside the write guard and are explicitly covered as an allowed demo control."

requirements-completed: [SAFE-01, SAFE-02]

# Metrics
duration: 6 min
completed: 2026-07-26
---

# Phase 180 Plan 10: MCP and Agent Write Boundaries Summary

**Trusted OAuth and agent company contexts now stop demo writes before service-role access, credits, persistence, embedding, customer sends, or Inngest dispatch while preserving read tools and normal tenants.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-26T18:21:16Z
- **Completed:** 2026-07-26T18:27:18Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments

- Guarded all six MCP write handlers using the company already authenticated into the bearer context, before any service-role client can be constructed.
- Repeated explicit-company enforcement at the neutral estimate, project, price-book, knowledge, draft, confirm, and cancel funnels before credits, database access, embedding, queues, confirmation state, gates, or customer dispatch.
- Added 13 focused browserless tests covering stale demo-company bearer credentials, every listed agent file, normal MCP writes, and an allowed read-tool control.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: RED — test MCP and agent-tool company denial** — `59cb186e` (`test`)
2. **Task 2: GREEN — guard MCP and agent writes at their funnels** — `ef389f40` (`feat`)

## Files Created/Modified

- `tests/unit/demo/mcp-agent-boundaries.test.ts` — stale bearer, no-effect, normal-write, and read-control coverage.
- `lib/mcp/tools/write.ts` — explicit demo-company guard before service-role access in all six write handlers.
- `lib/agent-tools/create-estimate.ts` — denies before credit lookup, service client, queueing, and ownership persistence.
- `lib/agent-tools/create-project.ts` — denies before tenant lookups and project/activity inserts.
- `lib/agent-tools/create-service.ts` — denies before company lookup and price-book insert.
- `lib/agent-tools/add-knowledge.ts` — denies before embedding generation and knowledge persistence.
- `lib/agent-tools/send-customer-message.ts` — denies draft, both confirmation modes, and cancellation before confirmation, gate, or dispatch effects.

## Decisions Made

- Trusted `auth.company_id` is authoritative at MCP entry; the same explicit company is passed into the shared guard without consulting cookies.
- Agent tools remain independently guarded even when their current MCP caller already guards, because web, chat, WhatsApp, and future browserless callers can invoke the neutral funnels directly.
- Input and OAuth scope validation remain available before company denial because neither creates side effects; all service-role and external-effect work remains strictly downstream.

## TDD Gate Compliance

- **RED:** `59cb186e` added 13 focused cases; 12 failed because demo writes reached existing behavior while the read control passed.
- **GREEN:** `ef389f40` added the minimum explicit-company enforcement; all 13 focused cases and adjacent MCP/agent regressions passed.
- **REFACTOR:** Not needed beyond one shared MCP guard helper.

## Verification

- `npx vitest run tests/unit/demo/mcp-agent-boundaries.test.ts` — passed (13 tests).
- `npx vitest run tests/unit/demo tests/unit/mcp-create-estimate.test.ts tests/unit/mcp/agentic-send-write-tools.test.ts tests/unit/agent-tools/create-estimate.test.ts tests/unit/agent-tools/send-customer-message.test.ts tests/unit/mcp-read-tools.test.ts tests/unit/mcp-tool-registry.test.ts` — passed (289 tests across 21 files).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- Git history confirms RED commit `59cb186e` precedes GREEN commit `ef389f40`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the demo-guard test mock hoist-safe**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** Importing the newly used guard activated Vitest's hoisted mock factory, which referenced a top-level constant before initialization.
- **Fix:** Inlined the canonical read-only message in the mock factory; observable test behavior is unchanged.
- **Files modified:** `tests/unit/demo/mcp-agent-boundaries.test.ts`
- **Verification:** Focused suite passed 13/13 and the adjacent regression set passed 289/289.
- **Committed in:** `ef389f40`

---

**Total deviations:** 1 auto-fixed (1 blocking test-harness issue)
**Impact on plan:** The fix only made the planned test double valid when the production import became live; scope and production behavior did not expand.

## Issues Encountered

None beyond the resolved Vitest mock-hoisting issue documented above.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration is required.

## Known Stubs

None. Empty objects and nulls found by the mechanical scan are query-builder test state or established nullable domain values, not UI/data-flow placeholders.

## Threat Flags

None. This plan narrows existing MCP, service-role, persistence, queue, and customer-send surfaces; it introduces no endpoint, authentication path, file-access pattern, or schema boundary.

## Next Phase Readiness

Browserless MCP and shared agent write effects now honor the deterministic demo tenant without cookie authority. Plans 180-11 and 180-12 can build on the same explicit-company boundary for background workers and remaining cross-channel effects.

## Self-Check: PASSED

Verified all eight implementation/test/summary artifacts exist, RED commit `59cb186e` and GREEN commit `ef389f40` exist in history, all acceptance checks pass, no goal-blocking stub or new threat surface was introduced, and `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
