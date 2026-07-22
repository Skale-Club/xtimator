---
phase: 178-agentic-send
plan: 04
subsystem: mcp
tags: [mcp, tdd, agentic, oauth, sms, zod]

# Dependency graph
requires:
  - phase: 178-agentic-send (Plan 02)
    provides: lib/agent-tools/send-customer-message.ts — draftCustomerMessage, confirmSendByToken (the neutral capability this plan binds, unmodified, via the lib/agent-tools barrel)
  - phase: 178-agentic-send (Plan 01)
    provides: lib/notifications/agentic-send-confirm.ts — explainSendGateRefusal (distinct per-reason gate-refusal copy)
provides:
  - "lib/mcp/tools/write.ts — draft_customer_message + send_customer_message MCP write tools, registered in buildWriteTools()/TOOL_DEFINITIONS"
  - "send_customer_message's inputSchema is structurally token-only (confirmation_token, nothing else) — the concrete enforcement point for AGENT-03 on the MCP channel"
affects: [178-05 (if any remaining MCP/agentic-send wiring), any future MCP tool addition — TOOL_DEFINITIONS count/name list is asserted exactly by tests/unit/mcp-tool-registry.test.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two ordinary MCP tool calls (draft -> preview + opaque token; send -> token only) substitute for an MCP elicitation primitive: a distinct propose step and a distinct commit step, with the commit step's schema structurally incapable of accepting redirected content."
    - "MCP write-tool handlers stay thin adapters: ensureScope -> parseInput -> requireServiceClient() -> call the neutral lib/agent-tools function -> map its discriminated ok:true/false result to jsonContent or invalidInput. No business logic (rate limiting, recipient resolution, gate checks) lives in the MCP layer — identical to the existing add_service/create_project precedent."

key-files:
  created:
    - tests/unit/mcp/agentic-send-write-tools.test.ts
  modified:
    - lib/mcp/tools/write.ts
    - tests/unit/mcp-tool-registry.test.ts

key-decisions:
  - "send_customer_message's zod schema + JSON inputSchema.properties expose ONLY confirmation_token — no recipient/channel/body/client_id/client_name/company_id field was added 'for flexibility', per the plan's explicit instruction. Locked by a load-bearing schema-walk test."
  - "draft_customer_message's MCP handler always passes triggerSource: 'agentic-mcp' and omits channelRef entirely (never a WhatsApp-shaped binding key) when calling the neutral draftCustomerMessage — proven by a dedicated call-argument assertion."
  - "auth.company_id (the trusted OAuth-resolved tenant) is the sole company-scoping input to both handlers; input is never trusted for tenancy, matching every other tool in this file."

requirements-completed: [AGENT-02, AGENT-03]

# Metrics
duration: ~15min
completed: 2026-07-22
---

# Phase 178 Plan 04: draft_customer_message + send_customer_message MCP Tool Pair Summary

**MCP now exposes the same confirmation/validation guarantee as the WhatsApp agentic-send path via two ordinary tool calls — `draft_customer_message` returns a byte-exact preview + confirmation_token, and `send_customer_message`'s schema has literally no field a prompt injection could redirect a send through.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-22T00:22:00-04:00 (approx)
- **Completed:** 2026-07-22T00:37:16-04:00
- **Tasks:** 1
- **Files modified:** 3 (1 created, 2 edited)

## Accomplishments
- `draft_customer_message` MCP tool: resolves `client_name` -> `draftCustomerMessage(supabase, { companyId: auth.company_id, clientQuery, channel, body, subject?, triggerSource: 'agentic-mcp' })`, returns `{ confirmation_token, client_name, recipient, channel, subject, body, message }` — `body` is the exact echoed preview (SMS business-name prefix included, per 178-02).
- `send_customer_message` MCP tool: input schema is `{ confirmation_token: string }` and nothing else; calls `confirmSendByToken(supabase, auth.company_id, confirmation_token)`; on success returns `{ ok: true, message: 'Sent.' }`.
- Every `draftCustomerMessage` failure (`client_not_found`, `client_ambiguous` w/ candidates, `no_recipient_email`, `no_recipient_phone`, `rate_limited`) maps to a distinct, human-readable `invalidInput` message — verified by asserting the four non-ambiguous cases produce 4 distinct message strings.
- Every `confirmSendByToken` failure maps to a clear message: `not_found` -> "confirmation has expired or was already used — draft the message again"; any other reason -> `explainSendGateRefusal(reason)` (e.g. quiet_hours, suppressed, no_consent), never a bare error code.
- Both tools registered with `WRITE_ANNOTATIONS` (`readOnlyHint: false`) in `TOOL_DEFINITIONS` and `buildWriteTools()`, alongside `create_estimate`/`add_service`/`add_knowledge` — not grouped with read-only query tools.
- The MCP layer imports `draftCustomerMessage`/`confirmSendByToken` from the shared `@/lib/agent-tools` barrel (same barrel `create_estimate` already imports from) — never a deep import, never `sendCustomerSms`/`sendCustomerEmail`/`lib/notifications/customer-send.ts` directly (MPAR-01 convergence, same pattern `mcp-generation-parity.test.ts` already locks for `create_estimate`).

## Task Commits

Each task was committed atomically:

1. **Task 1: draft_customer_message + send_customer_message MCP tools (TDD)** - `ca0246ba` (feat)

_Written test-first: the full behavior surface (scope gate, input validation, happy path, failure mapping, and both schema-walk tests) was specified up front from the plan's `<behavior>` block; implementation and its test suite were authored together and landed green in one commit — consistent with how 178-02 handled its TDD task, since the plan's interfaces block already fully specified the contract._

## Files Created/Modified
- `lib/mcp/tools/write.ts` - Added `draftCustomerMessageInput`/`sendCustomerMessageInput` zod schemas, `DRAFT_CUSTOMER_MESSAGE_DEFINITION`/`SEND_CUSTOMER_MESSAGE_DEFINITION` tool definitions, `handleDraftCustomerMessage`/`handleSendCustomerMessage` handlers, wired into `TOOL_DEFINITIONS`, `buildWriteTools()`, and `__testing`. Imports `draftCustomerMessage`/`confirmSendByToken` from `@/lib/agent-tools` and `explainSendGateRefusal` from `@/lib/notifications/agentic-send-confirm`.
- `tests/unit/mcp/agentic-send-write-tools.test.ts` - 14 tests: scope gates (both tools), input validation (both tools), happy paths (preview payload shape + exact triggerSource/channelRef call args; send payload + call args), failure mapping (client_ambiguous candidates, 4 distinct draft error messages, not_found, quiet_hours, suppressed gate refusals), and the two schema-walk tests (draft's allowed-field list minus tenant fields; send's exactly-one-field `confirmation_token` schema).
- `tests/unit/mcp-tool-registry.test.ts` - Updated tool-count assertions (15 -> 17) and the exact sorted tool-name list to include `draft_customer_message`/`send_customer_message` — a direct, mechanical consequence of registering the two new tools in `buildWriteTools()` (see Deviations).

## Decisions Made
See `key-decisions` in frontmatter. All three were explicit instructions in the plan's `<action>` block, followed as specified — no autonomous architectural choices were needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated `tests/unit/mcp-tool-registry.test.ts`'s stale exact tool-count/name assertions**
- **Found during:** Task 1 verification (running the plan's full `<verification>` block, `npx vitest run tests/unit/mcp`)
- **Issue:** This pre-existing registry test asserts `buildAllTools`/the `tools/list` handler return exactly 15 tools with an exact sorted name list. Registering the two new tools in `buildWriteTools()` is a direct, intended consequence of this plan's task — but it broke that test's hardcoded count/name expectations (a mechanical fallout of the new registration, not a pre-existing unrelated failure, so it's in-scope per the deviation rules' scope boundary).
- **Fix:** Updated the two count assertions (`toHaveLength(15)` -> `toHaveLength(17)`, matching test titles renamed to say "17 tools (4 read + 7 write + 6 knowledge/query)") and inserted `draft_customer_message`/`send_customer_message` into the exact sorted name-list assertion at their correct alphabetical positions.
- **Files modified:** tests/unit/mcp-tool-registry.test.ts
- **Verification:** `npx vitest run tests/unit/mcp tests/unit/agent-tools` — 20 files, 198 tests, all passing.
- **Committed in:** `ca0246ba` (same commit as Task 1 — this file is not in `files_modified` but the fix is inseparable from registering the new tools)

---

**Total deviations:** 1 auto-fixed (Rule 1 — direct mechanical fallout of this plan's own change, within scope boundary).
**Impact on plan:** No scope creep — the registry test's stale numbers were the only thing standing between "tools registered correctly" and "full verification suite green." No other file outside the plan's declared `files_modified` (plus this one directly-impacted test) was touched.

## Issues Encountered
None beyond the registry-test deviation documented above.

## User Setup Required
None - no external service configuration required. This plan is pure application code; the underlying `agentic_send_confirmations` table (178-01) and its rate-limit/gate dependencies (178-02) were already required and applied for prior plans in this phase.

## Next Phase Readiness
- MCP clients (e.g. Claude.ai via the OAuth-authorized connector) can now call `draft_customer_message` then `send_customer_message` to text or email a customer through the agentic channel, with the identical confirmation/validation guarantee WhatsApp (178-03) already has.
- `tests/unit/mcp-tool-registry.test.ts` now reflects 17 total MCP tools (4 read + 7 write + 6 knowledge/query) — any future MCP tool addition must update this same file's exact count/name assertions (documented here so the next executor isn't surprised).
- A sibling executor (178-03) was concurrently active in `lib/whatsapp/` during this run; per house rules, staging/commit were pathspec-scoped to this plan's three files only — two untracked WhatsApp test files from that sibling run (`tests/unit/whatsapp/handler-agentic-send-routing.test.ts`, `tests/unit/whatsapp/intent-router-agentic-send.test.ts`) were left untouched in the working tree, not committed by this plan.
- No blockers identified.

---
*Phase: 178-agentic-send*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: lib/mcp/tools/write.ts (modified)
- FOUND: tests/unit/mcp/agentic-send-write-tools.test.ts
- FOUND: tests/unit/mcp-tool-registry.test.ts (modified)
- FOUND commit: ca0246ba
