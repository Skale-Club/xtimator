---
phase: 178-agentic-send
plan: 02
subsystem: notifications
tags: [supabase, tdd, agentic, whatsapp, mcp, rate-limit, sms]

# Dependency graph
requires:
  - phase: 178-agentic-send (Plan 01)
    provides: agentic_send_confirmations state machine (lib/notifications/agentic-send-confirm.ts) — createSendConfirmation, resolvePendingByChannelRef, resolveByToken, markConfirmed (atomic claim, Promise<boolean>), markCancelled, markRefused, verifyBinding, checkAgenticSendRateLimit
  - phase: 177-customer-messaging
    provides: customer-send-gate.ts (assertSendAllowed/SendPermit), customer-send.ts (sendCustomerMessage single funnel, SMS business-name prefix behavior)
provides:
  - lib/agent-tools/send-customer-message.ts — draftCustomerMessage, confirmSendByChannelRef, cancelSendByChannelRef, confirmSendByToken (the neutral capability both channel adapters bind to)
  - lib/agent-tools barrel export of the above
affects: [178-03 (WhatsApp turn-taking adapter), 178-04 (MCP token round-trip adapter)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLAIM-BEFORE-DISPATCH at the orchestration layer: finalizeConfirmedSend calls the atomic markConfirmed() claim FIRST (before binding verification, gate check, or dispatch) — a failed claim short-circuits to already_processed with zero further work, closing the concurrent double-confirm race that a literal verify->gate->dispatch->markConfirmed(always) order would leave open."
    - "Preview/dispatch body split: the stored confirmation row keeps the RAW pre-prefix body (so the funnel's own SMS business-name prefix, applied once at dispatch time, never double-applies); the draft-time PREVIEW echoed back to the caller is pre-prefixed to be byte-exact with what the customer will actually receive, computed via the same resolveBusinessName() helper used at confirm time so the two never diverge."
    - "Recipient resolution is closed-world: the only entry point into 'who gets this message' is an ilike name lookup scoped to company_id against the clients table — there is no parameter, branch, or fallback anywhere that accepts a raw phone/email string as a target."

key-files:
  created:
    - lib/agent-tools/send-customer-message.ts
    - tests/unit/agent-tools/send-customer-message.test.ts
  modified:
    - lib/agent-tools/index.ts

key-decisions:
  - "CLAIM-BEFORE-DISPATCH (Wave-2 correction, adopted per execution instructions — supersedes the plan's literal finalize order): finalizeConfirmedSend now runs (1) markConfirmed atomic claim -> false means already_processed, stop; (2) verifyBinding; (3) assertSendAllowed gate; (4) dispatch via sendCustomerMessage. markConfirmed is called exactly ONCE per finalize call (as the claim), not a second time after dispatch as the plan's literal text described — the claim IS the confirmed-status write. Proven by a dedicated concurrent-double-confirm test: two Promise.all-raced confirmSendByChannelRef calls on the same pending row produce exactly one dispatch and exactly one already_processed result."
  - "SMS preview/delivery body split (adopted per execution instructions): draftCustomerMessage's returned preview.body is pre-prefixed with the resolved business name for SMS (byte-exact match to what sendCustomerMessage() will deliver), while the row passed to createSendConfirmation stores the RAW un-prefixed body — customer-send.ts applies the prefix exactly once, at dispatch time, from the stored raw body. Storing a pre-prefixed body would have caused a double prefix on delivery. Email preview/storage both stay untouched (no prefix), matching customer-send.ts's freeform-email behavior (the friendly-from header already carries the identity)."
  - "resolveBusinessName is a single module-private helper (companies.name, fallback 'Your contractor') reused by both the SMS draft preview and the confirm-time dispatch, so the two can never compute a different business name for the same send."

requirements-completed: [AGENT-01, AGENT-02, AGENT-03]

# Metrics
duration: ~25min
completed: 2026-07-22
---

# Phase 178 Plan 02: send-customer-message.ts Neutral Draft/Confirm/Cancel Capability Summary

**`lib/agent-tools/send-customer-message.ts`: the one channel-neutral draft/confirm/cancel capability (draftCustomerMessage, confirmSendByChannelRef/ByToken, cancelSendByChannelRef) that both WhatsApp (178-03) and MCP (178-04) will bind to — client-scoped recipient resolution, rate-limit-before-write, and an atomic claim-before-dispatch finalize flow proven race-safe under concurrent confirms, fully unit-tested (18 tests) with all four boundary modules mocked.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-22T00:12:00-04:00 (approx)
- **Completed:** 2026-07-22T00:28:19-04:00
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 edited)

## Accomplishments
- `draftCustomerMessage`: rate-limits before any client lookup or DB write; resolves recipients EXCLUSIVELY from `clients` rows scoped to `company_id` (0 matches -> `client_not_found`, 2+ -> `client_ambiguous` with candidate names, never a raw phone/email); returns an SMS preview that is byte-exact with the delivered body while the stored row stays pre-prefix.
- `confirmSendByChannelRef` / `confirmSendByToken`: share `finalizeConfirmedSend`, which claims the pending row atomically FIRST (adopted CLAIM-BEFORE-DISPATCH order), then verifies structural binding integrity, then gates via `assertSendAllowed`, then dispatches through `sendCustomerMessage()` — Phase 177's single funnel, never a channel send primitive directly.
- `cancelSendByChannelRef`: resolves the pending row and marks it cancelled without ever touching the gate or dispatch path.
- Concurrent double-confirm test: two `Promise.all`-raced `confirmSendByChannelRef` calls on the same pending row (simulated atomic claim mock) produce exactly one `sendCustomerMessage` dispatch and exactly one `already_processed` result.
- ENGINE-01 channel neutrality gate stays green with the new file present (18 module tests + the pre-existing 2 neutrality tests, all passing).
- `lib/agent-tools` barrel now re-exports the four functions + their types, mirroring the existing `createEstimate`/`createProject` pattern.

## Task Commits

Each task was committed atomically:

1. **Task 1: send-customer-message.ts — draft/confirm/cancel neutral capability (TDD)** - `0df281dc` (feat)
2. **Task 2: Barrel export** - `509e2dd3` (feat)

_Task 1 was written test-first per the plan's TDD flag; implementation and its full test suite were authored together and verified green before commit (no separate RED-only commit was made, since the plan's TDD guidance for this task did not require a distinct failing-test commit step — tests were authored alongside the implementation and both landed passing in one commit, consistent with how the module's behavior surface was fully specified by the plan's interfaces block)._

## Files Created/Modified
- `lib/agent-tools/send-customer-message.ts` - `draftCustomerMessage`, `confirmSendByChannelRef`, `confirmSendByToken`, `cancelSendByChannelRef`, module-private `findClientCandidates`/`resolveBusinessName`/`finalizeConfirmedSend`.
- `tests/unit/agent-tools/send-customer-message.test.ts` - 18 tests: rate-limit-first ordering, 0/1/2-match client resolution, recipient-missing branches, SMS preview/storage body split, company-scoped query proof, claim-before-dispatch ordering (not_found / already_processed / integrity_error / gate-denied / gate-allowed / dispatch-failure), the concurrent double-confirm race, and cancel.
- `lib/agent-tools/index.ts` - Added the barrel re-export block for the four functions + `DraftSendParams`/`DraftSendResult`/`ConfirmSendResult`/`ClientMatch` types.

## Decisions Made
See `key-decisions` in frontmatter: CLAIM-BEFORE-DISPATCH order (adopted, pre-authorized override of the plan's literal finalize order) and the SMS preview/delivery body split (adopted, pre-authorized per the checker INFO item). Both were specified in the execution instructions as ADOPTED corrections, not autonomous Rule 1-3 fixes discovered during execution — documented here for traceability rather than under "Auto-fixed Issues".

## Deviations from Plan

### Adopted Corrections (pre-authorized, not autonomous Rule 1-3 fixes)

**1. [Execution-instruction correction] CLAIM-BEFORE-DISPATCH finalize order, superseding the plan's literal text**
- **Found during:** Task 1 (finalizeConfirmedSend implementation)
- **Issue:** The plan's literal interfaces block ordered finalize as verify -> gate -> dispatch -> `markConfirmed` (always, regardless of dispatch outcome). Under two concurrent confirm calls on the same row, both could pass the gate and both dispatch before either write landed — a real double-send.
- **Fix:** `finalizeConfirmedSend` now calls `markConfirmed` FIRST as the atomic claim. A failed claim (`false`) returns `{ ok: false, error: 'already_processed' }` immediately — no integrity check, no gate call, no dispatch. Only a successful claim proceeds to `verifyBinding` -> `assertSendAllowed` -> `sendCustomerMessage`. `markConfirmed` is called exactly once per finalize call.
- **Files modified:** lib/agent-tools/send-customer-message.ts, tests/unit/agent-tools/send-customer-message.test.ts
- **Verification:** Dedicated test "CONCURRENT double-confirm: two callers race the same pending row -> exactly one dispatch happens" — `Promise.all` of two `confirmSendByChannelRef` calls against a compare-and-swap `markConfirmed` mock; asserts `sendCustomerMessage` called exactly once and results are `[one ok:true, one already_processed]`. Also covered individually: failed-claim short-circuit, tampered-row-after-claim (`markRefused` still fires), gate-denial, gate-allow, and dispatch-failure paths.
- **Committed in:** `0df281dc`

**2. [Execution-instruction correction] SMS preview mirrors the delivered (business-name-prefixed) body; stored row stays pre-prefix**
- **Found during:** Task 1 (draftCustomerMessage implementation)
- **Issue:** The plan's literal interfaces block returned the raw, un-prefixed body as the draft preview. Per the checker INFO item adopted in execution instructions, an owner confirming a draft should see EXACTLY what the customer will receive — for SMS that includes `customer-send.ts`'s business-name prefix (`${businessName}: ${body}`), applied unconditionally at dispatch time for the freeform SMS path.
- **Fix:** Added a module-private `resolveBusinessName()` helper (companies.name, fallback `'Your contractor'` — same fallback `finalizeConfirmedSend` already uses). For `channel === 'sms'`, the returned `DraftSendResult.body` is `${businessName}: ${params.body}`. The row passed to `createSendConfirmation` (and therefore `PendingSendConfirmation.body`, later fed to `sendCustomerMessage`'s `freeform.body`) stays the RAW un-prefixed text — `sendCustomerMessage` applies the prefix itself exactly once at dispatch, so storing a pre-prefixed body would have doubled it on delivery. Email stays untouched on both sides (no prefix), matching `customer-send.ts`'s freeform-email behavior.
- **Files modified:** lib/agent-tools/send-customer-message.ts, tests/unit/agent-tools/send-customer-message.test.ts
- **Verification:** Tests assert `createSendConfirmation` receives the raw body while the returned preview is prefixed; a separate test proves the `'Your contractor'` fallback when `companies.name` is null; a company-scoped-query test proves the `companies` lookup only fires for the sms branch scenario exercised.
- **Committed in:** `0df281dc`

---

**Total deviations:** 2 pre-authorized execution-instruction corrections (both explicitly adopted, overriding the plan's literal text). No autonomous Rule 1-3 auto-fixes were needed.
**Impact on plan:** No scope creep — both corrections were pre-authorized in the execution instructions before Task 1 began, and both are confined to `send-customer-message.ts` and its test file.

## Issues Encountered
- The neutrality test (`tests/unit/agent-tools/neutrality.test.ts`) initially failed: the module's own file-header comment, while EXPLAINING the forbidden-token list, contained the literal substring `lib/whatsapp` inside prose (ironically, describing what the file must never reference). Reworded the comment to avoid the literal substring while keeping the same meaning. Re-ran both `send-customer-message.test.ts` and `neutrality.test.ts` — both green. This was caught and fixed before the Task 1 commit, so it is not a separate deviation entry (Rule 1, folded into the same commit).

## User Setup Required
None — no external service configuration required. The `agentic_send_confirmations` migration (from Plan 178-01) must already be applied to the target database for this module's DB-backed functions to write/read real rows; per this repo's manual-migration convention, that application is a separate, explicit step (tracked in 178-01's summary, not repeated here).

## Next Phase Readiness
- `lib/agent-tools` barrel now exports `draftCustomerMessage`, `confirmSendByChannelRef`, `cancelSendByChannelRef`, `confirmSendByToken`, and their types — 178-03 (`lib/whatsapp/manage-tools.ts`) and 178-04 (`lib/mcp/tools/write.ts`) can `import { draftCustomerMessage } from '@/lib/agent-tools'` without a deep import path, with zero business logic of their own to write beyond turning their channel's inbound event into a `DraftSendParams`/`channelRef`/`token` call.
- The CLAIM-BEFORE-DISPATCH guarantee is now enforced at the orchestration layer (not just the state-machine primitive) — 178-03's WhatsApp reply-triggered confirm and 178-04's MCP confirm-tool call both get the same concurrency safety for free, with no per-channel race-handling code needed.
- No blockers identified for 178-03/178-04.

---
*Phase: 178-agentic-send*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: lib/agent-tools/send-customer-message.ts
- FOUND: tests/unit/agent-tools/send-customer-message.test.ts
- FOUND: lib/agent-tools/index.ts (modified)
- FOUND commit: 0df281dc
- FOUND commit: 509e2dd3
