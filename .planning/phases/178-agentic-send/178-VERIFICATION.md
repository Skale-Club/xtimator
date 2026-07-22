---
phase: 178-agentic-send
verified: 2026-07-22T00:55:00Z
status: passed
score: 16/16 must-haves verified
re_verification: null
milestone_full_suite:
  command: "npx vitest run tests/unit"
  total: "4172 passed | 5 failed | 21 todo (4198) across 527 files"
  phase_178_scope: "0 failures — 100% green"
  out_of_scope_failures: 5
  out_of_scope_files:
    - path: "tests/unit/capture/blob-store.test.ts"
      failures: 1
      cause: "Local env only — `fake-indexeddb@^6.2.5` is declared in package.json but not installed in local node_modules; a fresh `npm ci` (CI) resolves the import. NOT a real regression."
      ci_relevant: false
    - path: "tests/unit/actions/recording-early-return-events.test.ts"
      failures: 1
      cause: "Mock-shape breakage: `supabase.from(...).select is not a function` in lib/actions/recording.ts createRecording. Test harness for quick-task 260707-grq, unrelated to Phase 178."
      ci_relevant: true
    - path: "tests/unit/services/generate-estimate-captions.test.ts"
      failures: 4
      cause: "Mock-shape breakage: `supabase.from(...).select(...).eq(...).is is not a function` in getPriceBookItems (lib/queries/price-book.ts:60). The recent price-book Trash merge (7d50d23f, merged via adc683a2) added `.is('deleted_at', null)`; the pre-existing PHOTO-01 caption test's supabase mock does not chain `.is()`. Independent of Phase 178."
      ci_relevant: true
human_verification:
  - test: "Real end-to-end WhatsApp confirm flow (live Twilio SMS)"
    expected: "Owner asks 'text [client] that we're running a day late' → draft echoes exact phone + body → owner replies YES on the NEXT message → SMS arrives → customer_messages row with trigger_source='agentic-whatsapp'. Reply NO → nothing sends, agentic_send_confirmations row status='cancelled'."
    why_human: "Requires a live WhatsApp number, a real consented test client, and Phase 177 operational gates (Twilio Messaging Service, Resend domain). No live round-trip is possible in CI."
  - test: "Real end-to-end MCP draft/send round-trip + token single-use"
    expected: "From an MCP client (Claude.ai via OAuth): call draft_customer_message → inspect preview + confirmation_token → call send_customer_message(token) → delivery + customer_messages row trigger_source='agentic-mcp'. Re-call send_customer_message with the SAME token → fails 'not_found' (already consumed)."
    why_human: "Requires a real MCP client connected via OAuth to a staging company."
  - test: "Rate limit under real Redis (fail-CLOSED cap = 10/company/day)"
    expected: "Trigger 11 agentic drafts for the same company within 24h → the 11th is refused with 'rate_limited' and no confirmation row is created."
    why_human: "Requires the platform's live Upstash Redis; the fail-closed unit tests mock Redis and cannot exercise the real INCR window."
  - test: "Migration applies cleanly to prod (manual apply convention)"
    expected: "After merge, manually apply 20260721000005_...sql to prod Supabase; verify all 13 columns exist and the channel-binding CHECK constraint is present."
    why_human: "Deploy is CI→GHCR→Coolify; migrations are applied manually per project convention (MEMORY: migrations_manual_apply)."
---

# Phase 178: Agentic Send — Verification Report

**Phase Goal:** Owner asks WhatsApp/MCP to message a client; the send is confirm-gated, injection-resistant, and rate-limited. (AGENT-01 WhatsApp flow + explicit confirmation; AGENT-02 MCP tool pair + same gates; AGENT-03 client-only recipients, server re-validation, token binding, rate limit.)
**Verified:** 2026-07-22T00:55:00Z
**Status:** PASSED (phase goal achieved; all automated must-haves verified)
**Re-verification:** No — initial verification.

This is the milestone's final, security-critical capstone. Verification was goal-backward: every observable truth traced by hand through the actual code, then confirmed against the passing tests. SUMMARY claims were not trusted.

---

## Automated Gate Results (real, this run)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Phase-scoped unit suite | `npx vitest run tests/unit/whatsapp tests/unit/agent-tools tests/unit/mcp tests/unit/notifications` | **747 passed, 14 todo, 1 skipped (78 files)** — 0 failures |
| Scoped typecheck | `npx tsc --noEmit -p tsconfig.ci.json` | **exit 0 — clean** |
| Targeted security cases | concurrent double-confirm / schema-walk / fail-closed / never-reply | **31 passed** |
| Milestone full-suite regression | `npx vitest run tests/unit` | **4172 passed, 5 failed, 21 todo (527 files)** — see Milestone Concern below; 0 failures in Phase 178 scope |

---

## Goal Achievement — Observable Truths

### AGENT-03 — Injection-resistant recipient resolution, server re-validation, token binding, rate limit

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Token binds client_id + channel + body(+subject) via a recomputable structural hash | ✓ VERIFIED | `computeBodyHash` joins `[clientId, channel, subject??'', body]` each length-prefixed → sha256 (agentic-send-confirm.ts:77-87); `verifyBinding` recomputes from the row's own fields (l.95-97). `finalizeConfirmedSend` calls `verifyBinding(pending)` post-claim; a stale hash → `markRefused` + `integrity_error` before any gate/dispatch (send-customer-message.ts:220-223). Tested. |
| 2 | markConfirmed is an atomic claim — concurrent double-confirm yields exactly one dispatch | ✓ VERIFIED | Single `UPDATE ... .eq('id',id).eq('status','pending').select('id')`; claim succeeds iff a row returns (agentic-send-confirm.ts:335-359). `finalizeConfirmedSend` claims FIRST; failed claim → `already_processed` with NO integrity/gate/dispatch (send-customer-message.ts:205-215). **Ran the concurrency test specifically:** `CONCURRENT double-confirm: two callers race the same pending row -> exactly one dispatch` and `two concurrent claims -> exactly one wins` both PASS. |
| 3 | Company scoping on resolve | ✓ VERIFIED | `resolvePendingByChannelRef` chains `.eq('company_id',…).eq('owner_phone',…).eq('trigger_source','agentic-whatsapp')`; `resolveByToken` chains `.eq('token',…).eq('company_id',…).eq('trigger_source','agentic-mcp')` (agentic-send-confirm.ts:245-320). Test asserts `eq` call #2 = `('company_id','company-1')` — "a guessed token from another company can never resolve". |
| 4 | Cross-channel redemption blocked | ✓ VERIFIED | Token lookup requires `trigger_source='agentic-mcp'`; channelRef lookup requires `'agentic-whatsapp'`. DB CHECK constraint enforces exactly one binding kind per trigger_source (migration l.31-34). A WhatsApp draft (token NULL) can never resolve by token; an MCP draft (owner_phone NULL) can never resolve by channelRef. Tested at both resolvers. |
| 5 | Recipient re-fetched from `clients` at send time inside the funnel | ✓ VERIFIED | The confirmation row stores only `client_id` (never a phone/email). `sendCustomerMessage` step 3 re-fetches `email,phone,name` from `clients` scoped `id=clientId AND company_id=companyId` at dispatch (customer-send.ts:123-142). `finalizeConfirmedSend` passes only `clientId`, never a recipient (send-customer-message.ts:237-244). |
| 6 | Arbitrary phone/email rejected at draft | ✓ VERIFIED | `DraftSendParams` has no recipient field; `findClientCandidates` does `ilike('name', …)` scoped to `company_id` only (send-customer-message.ts:103-115). 0 → `client_not_found`, 2+ → `client_ambiguous`; neither creates a row. The clients mock is `.select().eq().ilike().limit()`-shaped — no phone/email input path exists. Tested. |
| 7 | Rate limit FAIL-CLOSED, per company_id, both Redis-down modes | ✓ VERIFIED | `checkAgenticSendRateLimit`: `!isRedisAvailable()` → `false` (never calls rateLimit); Redis errors mid-request → rateLimit fails open with sentinel `count:0` → treated as `false` (agentic-send-confirm.ts:407-416). Named config `agenticSendPerCompanyPerDay: {max:10, window:86400}` keyed on companyId (ratelimit.ts:69-72). **Both fail-closed tests PASS:** "Redis unconfigured -> false (never calls rateLimit)" and "Redis errors mid-request (count:0) -> false". |

### AGENT-01 — WhatsApp flow, explicit confirmation

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 8 | Pending pre-check runs before debounce AND before the classifier, in BOTH twins | ✓ VERIFIED | `handler.ts`: `resolvePendingByChannelRef` runs in `processInboundWithDebounce` (l.71-74) and `processInboundMessage` (l.200-203) BEFORE the whatsapp_sessions query and before debounce. `intent-router.ts` `classifyAndRoute` runs it at l.460-464 BEFORE `loadConversationHistory`/`classify`. A bare "yes" can never be misrouted into CREATE. Tested (handler-agentic-send-routing + intent-router-agentic-send). |
| 9 | The LLM has no send tool — draft only | ✓ VERIFIED | `makeManageTools` returns `[addServiceTool, addKnowledgeTool, draftCustomerMessageTool, getLatestEstimateForClientTool]` (manage-tools.ts:158). `draft_customer_message` "does NOT send" — creates a pending confirmation only. No send/confirm tool is exposed to the ReAct loop; confirmation is a separate deterministic pre-check turn. |
| 10 | Confirmation only on the OWNER'S NEXT message (structurally distinct turn) | ✓ VERIFIED | Draft tool returns the echo + "Reply YES/NO" but never sends (manage-tools.ts:111-113). Confirm is resolved only by `dispatchPendingSendReply` on a subsequent inbound (intent-router.ts:410-434), gated behind `resolvePendingByChannelRef`. A "yes" bundled in the same turn has no pending row yet → falls through to normal classification. |
| 11 | QA-01 never-reply regression stays green | ✓ VERIFIED | `never-reply-regression.test.ts` PASSES unmodified. No Phase 178 file touches `lib/whatsapp/estimate-graph.ts`. The unconditional new `resolvePendingByChannelRef` in the hot path is safe because it never throws (try/catch → null), verified against a no-`.select` mock shape. |
| 12 | Gate refusals produce conversational explanations, never silence | ✓ VERIFIED | `explainSendGateRefusal` maps each reason (suppressed/no_consent/quiet_hours/unresolvable_timezone/client_not_found/integrity_error) to a distinct human string, never empty (agentic-send-confirm.ts:138-157). `dispatchPendingSendReply` replies `result.ok ? 'Sent!' : explainSendGateRefusal(result.error)`; unclear → re-prompt; cancel → "Okay, I won't send that"; catch → apology (intent-router.ts:414-433). Tested. |

### AGENT-02 — MCP tool pair, same gates

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 13 | `draft_customer_message` (MCP) returns token + byte-exact preview, never sends | ✓ VERIFIED | `handleDraftCustomerMessage` calls neutral `draftCustomerMessage(triggerSource:'agentic-mcp')` and returns `confirmation_token + recipient + channel + subject + body` (write.ts:462-501). Never dispatches. Tested — preview payload asserts exact echo. |
| 14 | `send_customer_message` schema is token-only | ✓ VERIFIED | `SEND_CUSTOMER_MESSAGE_DEFINITION.inputSchema.properties` = exactly `{confirmation_token}`; zod `sendCustomerMessageInput = z.object({confirmation_token: z.string().min(1)})` (write.ts:211-227, 283-285). **Ran the schema-walk test:** asserts `Object.keys(props)` `toEqual(['confirmation_token'])` and `not.toHaveProperty` company_id/companyId/recipient/channel/body — PASS. No field a prompt injection could redirect. |
| 15 | auth.company_id trusted (never LLM-suppliable) | ✓ VERIFIED | Both MCP handlers pass `auth.company_id` into the neutral fns (write.ts:469-476, 510); no company field on either inputSchema. `handleSendCustomerMessage` → `confirmSendByToken(supabase, auth.company_id, token)`. Draft schema-walk test also confirms no company_id field on draft. |
| 16 | Preview byte-exact with delivery (SMS business-name prefix included) | ✓ VERIFIED | Draft SMS preview = `` `${businessName}: ${body}` `` via `resolveBusinessName` (send-customer-message.ts:168-171); the STORED row keeps the RAW pre-prefix body; dispatch re-applies the identical prefix `` `${params.businessName}: ${params.freeform!.body}` `` (customer-send.ts:158-162) using the same `resolveBusinessName` + `'Your contractor'` fallback → no double-prefix, byte-exact. Both MCP tools carry write annotations (readOnlyHint:false), not read-only. Tested. |

**Score: 16/16 truths verified.**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260721000005_...sql` | agentic_send_confirmations table | ✓ VERIFIED | `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` throughout (idempotent/inert); channel-binding CHECK constraint; RLS enabled with ZERO authenticated policies (service-role-only). Prefix 000005 does not collide (001-004 taken). |
| `lib/notifications/agentic-send-confirm.ts` | Confirmation state machine | ✓ VERIFIED | Hash/verify/interpret pure fns + create/resolve×2/markConfirmed(claim)/markCancelled/markRefused + fail-closed rate wrapper. Never-throw discipline on all reads/status-writes. Wired into handler.ts, intent-router.ts, write.ts, send-customer-message.ts. |
| `lib/agent-tools/send-customer-message.ts` | Neutral draft/confirm capability | ✓ VERIFIED | draft/confirmByChannelRef/confirmByToken/cancelByChannelRef. Channel-neutral (ENGINE-01 — `channelRef`, never `ownerPhone`; neutrality.test.ts green). Only dispatch path = `sendCustomerMessage`. |
| `lib/whatsapp/manage-tools.ts` | draft tool + pre-check | ✓ VERIFIED | `draft_customer_message` bound; companyId + ownerPhone are closures, never zod fields (T-lrf-01). |
| `lib/whatsapp/handler.ts` / `intent-router.ts` | Twin early pre-checks | ✓ VERIFIED | Both twins call resolvePendingByChannelRef before debounce/classify. |
| `lib/mcp/tools/write.ts` | MCP draft/send pair | ✓ VERIFIED | Both registered in buildWriteTools with WRITE_ANNOTATIONS; send schema token-only. |
| `lib/ratelimit.ts` | Named per-company limit | ✓ VERIFIED | `agenticSendPerCompanyPerDay` config entry, 10/day. |

---

## Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| manage-tools draft_customer_message | agent-tools draftCustomerMessage | `triggerSource:'agentic-whatsapp', channelRef: ownerPhone` | ✓ WIRED |
| intent-router dispatchPendingSendReply | agent-tools confirmSendByChannelRef/cancelSendByChannelRef | after resolvePendingByChannelRef pre-check | ✓ WIRED |
| mcp/write handleDraftCustomerMessage | agent-tools draftCustomerMessage | `triggerSource:'agentic-mcp', channelRef:null` | ✓ WIRED |
| mcp/write handleSendCustomerMessage | agent-tools confirmSendByToken | `(supabase, auth.company_id, token)` | ✓ WIRED |
| finalizeConfirmedSend | notifications/customer-send sendCustomerMessage | claim → verifyBinding → assertSendAllowed → dispatch (permit + stored subject/body) | ✓ WIRED |
| single funnel | — | grep `sendCustomerSms\|sendCustomerEmail` in manage-tools/write/send-customer-message = 0 real calls (only comments) | ✓ WIRED — nothing outside customer-send.ts calls the primitives |

---

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| AGENT-01 (WhatsApp confirm-gated send) | 178-01/02/03 | ✓ SATISFIED | Truths 8-12 verified; draft/confirm/cancel/gate-refusal all tested. |
| AGENT-02 (MCP tool pair, same gates) | 178-01/02/04 | ✓ SATISFIED | Truths 13-16 verified; token-only schema-walk is a permanent gate. |
| AGENT-03 (client-only recipients, re-validation, token binding, rate limit) | 178-01/02/03/04 | ✓ SATISFIED | Truths 1-7 verified; injection surface closed structurally, not by convention. |

No orphaned requirements: REQUIREMENTS mapping for Phase 178 = AGENT-01/02/03, all claimed by plans.

---

## Anti-Patterns Found

None in Phase 178 files. Never-throw fallbacks, `return null`/`return false` on read/status-write failures, and empty-string guards are intentional fail-safe design (documented + tested), not stubs. No TODO/FIXME/placeholder in the phase's source. Rate-limit fail-CLOSED is a deliberate, ratified deviation from the file's normal fail-open posture (irreversible third-party send).

---

## Milestone-Level Concern — Full-Suite Regression Gate

`npx vitest run tests/unit` → **4172 passed | 5 failed | 21 todo (527 files)**. **Zero** failures are in Phase 178's scope. The 5 failures sit in 3 files 178 never touched:

1. **`tests/unit/capture/blob-store.test.ts`** (1) — `Failed to resolve import "fake-indexeddb/auto"`. The dep IS in package.json (`^6.2.5`) but is not installed in the current local `node_modules`; a fresh `npm ci` (as CI does) resolves it. **Local-environment artifact, not CI-red, not a regression.**
2. **`tests/unit/actions/recording-early-return-events.test.ts`** (1) — `supabase.from(...).select is not a function` in `lib/actions/recording.ts` (quick-task 260707-grq harness). **Deterministic; likely CI-relevant. Independent of Phase 178.**
3. **`tests/unit/services/generate-estimate-captions.test.ts`** (4) — `supabase.from(...).select(...).eq(...).is is not a function` in `getPriceBookItems` (price-book.ts:60). The recent price-book Trash merge added `.is('deleted_at', null)`; the PHOTO-01 caption test's supabase mock doesn't chain `.is()`. Fails deterministically in isolation (4 failed | 2 passed). **CI-relevant; induced by the price-book merge, not Phase 178.**

Recommendation: files #2 and #3 should be triaged separately (update the two supabase test mocks to match the new query chains) before relying on a green full-suite deploy gate — per project history, a silently-red `tests/unit` blocks all deploys. This is a milestone hygiene item, not a Phase 178 gap.

---

## Human Verification Required

Four inherently-live checks (documented as Manual-Only in 178-VALIDATION.md): real WhatsApp SMS confirm round-trip (AGENT-01), real MCP OAuth draft/send + token single-use (AGENT-02), real-Redis 11th-send rate cap (AGENT-03), and manual prod migration apply. See frontmatter `human_verification` for exact steps/expected results.

---

## Gaps Summary

No gaps in Phase 178. All 16 must-have truths are VERIFIED against the actual code and backed by passing tests; the phase-scoped suite (747) is fully green and the scoped typecheck is clean. The injection surface is closed structurally (token-only MCP send schema; hash-bound rows; recipient re-fetched at send time; closure-captured tenant), the double-confirm race is closed by an atomic claim (concurrency test passes), and the rate limit is fail-closed in both Redis-down modes. The only open items are (a) the four inherently-live human verifications, and (b) the milestone-level full-suite hygiene concern — 5 failures in 3 unrelated files, none in Phase 178's scope.

---

_Verified: 2026-07-22T00:55:00Z_
_Verifier: Claude (gsd-verifier)_
