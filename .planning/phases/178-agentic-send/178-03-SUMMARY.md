---
phase: 178-agentic-send
plan: 03
subsystem: whatsapp
tags: [whatsapp, langchain, agentic-send, confirmation-flow, intent-router]

# Dependency graph
requires:
  - phase: 178-agentic-send (178-02)
    provides: draftCustomerMessage / confirmSendByChannelRef / cancelSendByChannelRef (lib/agent-tools/send-customer-message.ts) — the channel-neutral draft/confirm/cancel capability this plan binds to WhatsApp
  - phase: 178-agentic-send (178-01)
    provides: resolvePendingByChannelRef / interpretConfirmationReply / explainSendGateRefusal (lib/notifications/agentic-send-confirm.ts) — the durable pending-confirmation state machine and deterministic yes/no classifier
provides:
  - draft_customer_message + get_latest_estimate_for_client LangChain tools bound into makeManageTools() (WhatsApp MANAGE intent)
  - Pending agentic-send confirmation pre-check in both handler.ts entry twins (processInboundWithDebounce, processInboundMessage), bypassing debounce/batching
  - Pending agentic-send confirmation pre-check in intent-router.ts's classifyAndRoute, bypassing the LLM classifier
affects: [178-04 (MCP adapter — separate channel binding, same 178-02 neutral capability), any future WhatsApp intent-router or handler.ts change]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic confirm/cancel/unclear classification (no LLM) for a pending agentic-send confirmation, checked BEFORE the LLM intent classifier — mirrors the existing awaiting_confirm session gate but is independent of whatsapp_sessions."
    - "Twin-function sync comments (`keep in sync with the twin`) at both handler.ts pre-check insertion points, since processInboundWithDebounce and processInboundMessage duplicate this early-routing logic by design (Quick task 260603-lrf precedent)."

key-files:
  created:
    - tests/unit/whatsapp/manage-tools-agentic-send.test.ts
    - tests/unit/whatsapp/intent-router-agentic-send.test.ts
    - tests/unit/whatsapp/handler-agentic-send-routing.test.ts
  modified:
    - lib/whatsapp/manage-tools.ts
    - lib/whatsapp/intent-router.ts
    - lib/whatsapp/handler.ts

key-decisions:
  - "Priority ordering when BOTH a pending agentic-send row and an awaiting_confirm estimate session exist: the agentic-send confirmation resolves first, in both handler.ts (checked before the whatsapp_sessions query even runs) and intent-router.ts (checked before loadConversationHistory/classify). Documented inline at both pre-check sites and here."
  - "draft_customer_message's ok:false client_ambiguous / rate_limited replies explicitly say 'nothing has been drafted' rather than merely omitting confirmation language — a stronger, unambiguous negative than silence on the word 'drafted'."
  - "dispatchManage's system prompt instructs the ReAct agent to relay the draft_customer_message tool's return string verbatim (not paraphrase it) — the exact-echo recipient+body content must reach the owner unmodified."

requirements-completed: [AGENT-01, AGENT-03]

# Metrics
duration: 35min
completed: 2026-07-22
---

# Phase 178 Plan 03: WhatsApp Agentic-Send Adapter Summary

**WhatsApp draft/confirm turn-taking for AGENT-01: a `draft_customer_message` MANAGE tool produces an exact-echo YES/NO confirmation, and a pre-classifier pending-confirmation check in both handler.ts twins + intent-router.ts ensures the owner's next distinct reply — never a same-turn bare "yes" — is the only thing that can trigger a send.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-22T00:33:00Z
- **Completed:** 2026-07-22T00:39:30Z (final verification) / SUMMARY at 2026-07-22T00:41:00Z
- **Tasks:** 2
- **Files modified:** 6 (3 source, 3 new test files)

## Accomplishments

- The owner can ask the WhatsApp assistant to message a client ("text Sarah that we're running a day late") and get, in the same turn, an exact-echo draft (`draft_customer_message` tool) — recipient name + phone/email + exact body, ending in an explicit YES/NO ask, and it never sends.
- A pending confirmation is checked BEFORE debounce/batching (handler.ts, both `processInboundWithDebounce` and `processInboundMessage`) and BEFORE the LLM intent classifier (intent-router.ts) — a bare "yes"/"não" for a pending send can never be misrouted into a new estimate or reach the classifier LLM.
- Confirm/cancel/unclear each produce exactly one distinct, clear owner reply; a gate refusal (e.g. `quiet_hours`) is always explained via `explainSendGateRefusal`, never silent; an unexpected thrown error from the confirm path is caught and still yields exactly one reply.
- Zero edits to any pre-existing test file; the frozen QA-01 never-throw/always-reply regression stays green; the full `tests/unit/whatsapp` suite (37 files, 325 tests) and `tests/unit/agent-tools` pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: DRAFT side — draft_customer_message MANAGE tool + $-grounding tool + prompt updates** - `0434949c` (feat, TDD)
2. **Task 2: CONFIRM side — pending-confirmation pre-check (intent-router.ts) + early routing (handler.ts)** - `de5a0535` (feat, TDD)

_TDD flow: for each task, the new test file was authored to spec first, then the RED failures were driven to GREEN by the accompanying source-file changes; both landed as a single `feat` commit per the plan's TDD guidance (test file + implementation together, matching this repo's established WhatsApp intent-router TDD commit pattern)._

## Files Created/Modified

- `lib/whatsapp/manage-tools.ts` - `makeManageTools(companyId, supabase, ownerPhone)` widened (new `ownerPhone` param); adds `draft_customer_message` (binds `draftCustomerMessage`, `triggerSource: 'agentic-whatsapp'`, `channelRef: ownerPhone`, maps every result variant — `ok:true`, `client_ambiguous`, `client_not_found`, `no_recipient_email`, `no_recipient_phone`, `rate_limited` — to a distinct owner-facing string) and `get_latest_estimate_for_client` (thin wrapper, same neutral function `query-tools.ts` already binds for QUERY).
- `lib/whatsapp/intent-router.ts` - `dispatchManage` call site passes `input.ownerPhone`; `classify()`'s MANAGE bullet widened to cover messaging a client; `dispatchManage`'s ReAct system prompt widened to describe the two new tools and forbid inventing a dollar figure; new `dispatchPendingSendReply()` (try/catch, never throws) + a pending-confirmation pre-check inserted into `classifyAndRoute` immediately after `normalizeMessage` succeeds, before `loadConversationHistory`.
- `lib/whatsapp/handler.ts` - new top-level import `resolvePendingByChannelRef`; identical pending-confirmation pre-check inserted into both `processInboundWithDebounce` and `processInboundMessage`, immediately after the read-receipt/typing-indicator fire-and-forget calls and before the `existingSession` query — routes through the existing `dispatchIntentRouter(message, null, companyId, ownerPhone, fromPhone)`, no new dispatch function added.
- `tests/unit/whatsapp/manage-tools-agentic-send.test.ts` - 8 tests covering the 4-tool return shape and every `draftCustomerMessage` result variant's owner-facing string.
- `tests/unit/whatsapp/intent-router-agentic-send.test.ts` - 6 tests covering confirm/cancel/unclear/gate-refusal/regression(no-pending)/thrown-error, cloned mock harness from `intent-router-knowledge.test.ts`.
- `tests/unit/whatsapp/handler-agentic-send-routing.test.ts` - 4 tests (`describe.each` over both twin functions for the pending-row case; per-function regression tests for the no-pending case, since the two twins' no-session behavior legitimately differs — see Issues Encountered).

## Decisions Made

- **Priority when both a pending send AND an awaiting_confirm estimate session exist:** the agentic-send confirmation always wins (checked first, in both files). This is the natural consequence of pre-check ordering (handler.ts checks it before `whatsapp_sessions` is even queried; intent-router.ts checks it before history/classify) and is documented inline at both insertion points plus in this SUMMARY, per the plan's INFO note.
- **Exact-echo wording:** the `ok:true` draft string is `Ready to send this ${text|email} to ${clientName} (${recipient}):\n\n"${body}"\n\nReply YES to send it, or NO to cancel.` — verbatim per the plan's spec, never paraphrased. `dispatchManage`'s system prompt explicitly instructs the ReAct agent to relay this string as-is rather than summarize it.
- **Negative-result wording for `client_ambiguous`/`rate_limited`:** phrased as an explicit "nothing has been drafted" rather than simply avoiding the word "drafted" — a stronger, less ambiguous guarantee for the owner reading it.

## Deviations from Plan

None - plan executed exactly as written. The interfaces block's exact signatures (`draftCustomerMessage`, `confirmSendByChannelRef`, `cancelSendByChannelRef`, `resolvePendingByChannelRef`, `interpretConfirmationReply`, `explainSendGateRefusal`) all matched the 178-01/178-02 shipped code with no adjustment needed.

## Issues Encountered

- The plan's Task 2 test spec for `handler-agentic-send-routing.test.ts` describes cloning the "no session, single text → dispatches CREATE path" regression case for both twins under a shared `describe`. In practice `processInboundMessage`'s no-session branch dispatches `EVENT_WHATSAPP_PROCESS` directly, while `processInboundWithDebounce`'s no-session branch goes through the Redis debounce buffer first — and in this test env (no `UPSTASH_REDIS_REST_URL`), `getRedis()` returns null, so `pushToBuffer` fails immediately and the existing Redis-unavailable fallback dispatches `EVENT_WHATSAPP_INTENT` instead (this is pre-existing, documented behavior — see `tests/unit/whatsapp/handler-intent-routing.test.ts` Test 3, unrelated to this plan). Split the "no pending row" regression into two per-function tests with the correct expected event name for each, while keeping the "pending row" case shared via `describe.each` (that path is identical for both twins — it returns before either the buffer or `whatsapp_sessions` is touched). No source-code deviation, test-only.

## User Setup Required

None - no external service configuration required. The `agentic_send_confirmations` table and its RLS were already shipped in 178-01/178-02 migrations.

## Next Phase Readiness

- 178-04 (MCP adapter) can proceed independently — it binds the SAME 178-02 neutral `draftCustomerMessage`/`confirmSendByChannelRef`/`cancelSendByChannelRef` functions to MCP tools, touching `lib/mcp/` (disjoint from this plan's WhatsApp files).
- The WhatsApp AGENT-01 flow is now end-to-end testable: draft (MANAGE intent → `draft_customer_message`) → owner's next message (pre-check → confirm/cancel) → actual dispatch via Phase 177's `sendCustomerMessage()` funnel (178-02's `finalizeConfirmedSend`).
- No blockers.

## Self-Check: PASSED

- FOUND: lib/whatsapp/manage-tools.ts
- FOUND: lib/whatsapp/intent-router.ts
- FOUND: lib/whatsapp/handler.ts
- FOUND: tests/unit/whatsapp/manage-tools-agentic-send.test.ts
- FOUND: tests/unit/whatsapp/intent-router-agentic-send.test.ts
- FOUND: tests/unit/whatsapp/handler-agentic-send-routing.test.ts
- FOUND commit: 0434949c
- FOUND commit: de5a0535

---
*Phase: 178-agentic-send*
*Completed: 2026-07-22*
