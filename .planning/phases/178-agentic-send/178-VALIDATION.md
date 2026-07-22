---
phase: 178
slug: agentic-send
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
---

# Phase 178 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Covers AGENT-01 (WhatsApp confirmation-gated send), AGENT-02 (MCP tool pair with token-based confirmation), and AGENT-03 (injection-resistant recipient resolution + rate limiting) — the milestone's final and highest-risk phase (first LLM-authored message sent to a real third party).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` — `include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/eval/**/*.test.ts', ...]` |
| **Quick run command** | `npx vitest run tests/unit/notifications/agentic-send-confirm.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/notifications tests/unit/agent-tools tests/unit/whatsapp tests/unit/mcp tests/unit/ratelimit.test.ts` (phase-scoped) |
| **Estimated runtime** | ~5-10s quick; ~40-60s phase-scoped full sweep (the WhatsApp suite is the largest slice) |

No new test dependencies. Entirely unit-level: pure functions (hash, classifier), mocked `SupabaseClient` objects passed directly as function arguments (178-01/178-02's own convention — NOT `vi.mock('@/lib/supabase/service')`), and module-boundary mocks for the channel adapters (178-03/178-04). No live Twilio/Resend/MCP-client round-trip is required or possible in CI — those are the phase's Manual-Only verifications below.

---

## Sampling Rate

- **Per task commit:** targeted `npx vitest run <specific test file>` (every task names its own file in `<verify><automated>`).
- **Per wave merge:**
  - Wave 1 (178-01): `npx vitest run tests/unit/notifications/agentic-send-confirm.test.ts tests/unit/ratelimit.test.ts`
  - Wave 2 (178-02): `npx vitest run tests/unit/agent-tools`
  - Wave 3 (178-03 + 178-04, parallel): `npx vitest run tests/unit/whatsapp tests/unit/mcp`
- **Phase gate:** full `npx vitest run tests/unit tests/integration` green + `npx tsc -p tsconfig.ci.json --noEmit` exits 0, before `/gsd:verify-work`. Additionally re-run `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` in isolation as an explicit frozen-regression check (178-03 does not touch its source files, but the phase's own safety bar requires confirming it directly, not just trusting the full-suite pass).
- **Max feedback latency:** <10s per task, <60s per wave.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| AGENT-03 (foundation) | Confirmation row binds (client_id, channel, body) via a recomputable hash; a CHECK constraint enforces exactly one channel-binding kind per trigger_source | unit + schema | `npx vitest run tests/unit/notifications/agentic-send-confirm.test.ts` (178-01 Task 2) | ❌ W0 |
| AGENT-01/02 | `interpretConfirmationReply()` is a pure, deterministic, multilingual (en/pt/es) classifier — no LLM call in the confirm-turn hot path | unit | `npx vitest run tests/unit/notifications/agentic-send-confirm.test.ts` (178-01 Task 2) | ❌ W0 |
| AGENT-03 | Read functions (`resolvePendingByChannelRef`/`resolveByToken`) never throw — proven against a mock shape with no `.select` method (the exact fallback shape existing WhatsApp test mocks use) | unit | `npx vitest run tests/unit/notifications/agentic-send-confirm.test.ts` (178-01 Task 2) | ❌ W0 |
| AGENT-03 | Per-company (not per-user) rate limit, named config entry, fail-open on Redis outage | unit | `npx vitest run tests/unit/notifications/agentic-send-confirm.test.ts` (178-01 Task 2) | ❌ W0 |
| AGENT-03 | `draftCustomerMessage()` resolves recipients ONLY from `clients` rows scoped to companyId; ambiguous/not-found never proceeds to a confirmation row; rate limit checked before any DB write | unit | `npx vitest run tests/unit/agent-tools/send-customer-message.test.ts` (178-02 Task 1) | ❌ W0 |
| AGENT-03 | Confirm/cancel NEVER dispatches without a fresh `assertSendAllowed()` permit; gate refusal marks the row 'refused', never 'confirmed'; the ONLY dispatch path is Phase 177's `sendCustomerMessage()` | unit | `npx vitest run tests/unit/agent-tools/send-customer-message.test.ts` (178-02 Task 1) | ❌ W0 |
| AGENT-01/02/03 | `lib/agent-tools/` stays channel-neutral with the new file present (ENGINE-01) | static source-grep | `npx vitest run tests/unit/agent-tools/neutrality.test.ts` (178-02 Task 1) | ✅ pre-existing, re-verify |
| AGENT-01 | Owner drafts a message via WhatsApp MANAGE intent; confirmation echo shows EXACT recipient + body; owner must confirm on the OWNER'S NEXT message, never the same turn | unit | `npx vitest run tests/unit/whatsapp/manage-tools-agentic-send.test.ts tests/unit/whatsapp/intent-router-agentic-send.test.ts` (178-03 Tasks 1-2) | ❌ W0 |
| AGENT-01 | A pending confirmation is checked BEFORE debounce/batching (handler.ts) and BEFORE the LLM classifier (intent-router.ts) — a bare "yes" can never be misrouted into CREATE | unit | `npx vitest run tests/unit/whatsapp/handler-agentic-send-routing.test.ts tests/unit/whatsapp/intent-router-agentic-send.test.ts` (178-03 Task 2) | ❌ W0 |
| AGENT-01 | Gate refusal produces a specific WhatsApp reply, never silence | unit | `npx vitest run tests/unit/whatsapp/intent-router-agentic-send.test.ts` (178-03 Task 2) | ❌ W0 |
| AGENT-01 (regression) | Zero edits to any pre-existing WhatsApp test file; the frozen QA-01 never-reply regression stays green | regression | `npx vitest run tests/unit/whatsapp` + isolated re-run of `never-reply-regression.test.ts` | ✅ pre-existing, must stay green |
| AGENT-02 | `draft_customer_message` (MCP) returns a token + exact preview, never sends | unit | `npx vitest run tests/unit/mcp/agentic-send-write-tools.test.ts` (178-04 Task 1) | ❌ W0 |
| AGENT-02/AGENT-03 (mandatory) | `send_customer_message`'s inputSchema contains ONLY `confirmation_token` — no field a prompt injection could redirect | schema-walk (structural) | `npx vitest run tests/unit/mcp/agentic-send-write-tools.test.ts` (178-04 Task 1) | ❌ W0 |
| AGENT-02 | A token only resolves within the drafting company + the `agentic-mcp` trigger source | unit | `npx vitest run tests/unit/mcp/agentic-send-write-tools.test.ts` (178-04 Task 1) | ❌ W0 |
| AGENT-02 | Both MCP tools carry write annotations, not read-only | unit | `npx vitest run tests/unit/mcp/agentic-send-write-tools.test.ts` (178-04 Task 1) | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every Wave 0 test file below is created inline as the first artifact of its owning plan's task — no separate scaffold-only wave in this phase's design:

- [ ] `tests/unit/notifications/agentic-send-confirm.test.ts` — covers AGENT-01/02/03 foundation (178-01 Task 2; new file, new module)
- [ ] `tests/unit/agent-tools/send-customer-message.test.ts` — covers AGENT-01/02/03 neutral capability (178-02 Task 1; new file, new module)
- [ ] `tests/unit/whatsapp/manage-tools-agentic-send.test.ts` — covers AGENT-01 draft side (178-03 Task 1; new file — `manage-tools.ts` has no prior test coverage of any kind)
- [ ] `tests/unit/whatsapp/intent-router-agentic-send.test.ts` — covers AGENT-01 confirm side (178-03 Task 2; new file, mirrors `intent-router-knowledge.test.ts`'s harness-cloning convention)
- [ ] `tests/unit/whatsapp/handler-agentic-send-routing.test.ts` — covers AGENT-01 early-routing (178-03 Task 2; new file, mirrors `handler.test.ts`'s harness)
- [ ] `tests/unit/mcp/agentic-send-write-tools.test.ts` — covers AGENT-02/03 (178-04 Task 1; new file — `write.ts` currently has no dedicated handler-level test file, only the source-string `mcp-generation-parity.test.ts`)

*Framework already installed — no `npm install` needed.*

---

## Hidden Regressions the Plan MUST Guard Against

- **`tests/unit/whatsapp/handler.test.ts`, `handler-inngest-dispatch.test.ts`, `handler-intent-routing.test.ts`, `intent-router.test.ts`, `intent-router-knowledge.test.ts`, `webhook-route.test.ts` must ALL stay green UNMODIFIED.** 178-03 introduces an unconditional new DB lookup (`resolvePendingByChannelRef`) into the hot path of `classifyAndRoute`/`processInboundMessage`/`processInboundWithDebounce`. This is only safe because 178-01's `resolvePendingByChannelRef` is designed to NEVER throw — a mock `.from()` call that doesn't recognize the `agentic_send_confirmations` table (every existing test's mock shape) resolves to `null`, not a thrown error. If a future edit removes that try/catch, this entire regression class reopens silently. Verification: run the full `tests/unit/whatsapp` suite with zero test-file diffs beyond the three NEW files 178-03 adds.
- **`tests/unit/whatsapp/never-reply-regression.test.ts` (QA-01, frozen) must stay green with ZERO assertion changes.** No plan in this phase touches `lib/whatsapp/estimate-graph.ts` or any file that test imports — confirm via `git diff --name-only` after 178-03 that `estimate-graph.ts` is absent from the changed-files list.
- **`sendCustomerSms`/`sendCustomerEmail` are never called directly by anything this phase adds.** Every agentic dispatch must go through `lib/notifications/customer-send.ts`'s `sendCustomerMessage()` (Phase 177's single funnel) so every agentic send is audited in `customer_messages` exactly like a manual send, with the correct `trigger_source` (`agentic-whatsapp`/`agentic-mcp`). Verification: `grep -rn "sendCustomerSms\|sendCustomerEmail" lib/agent-tools/send-customer-message.ts lib/whatsapp/manage-tools.ts lib/mcp/tools/write.ts` → zero matches.
- **`lib/agent-tools/` channel neutrality (ENGINE-01) must hold for the new file.** `tests/unit/agent-tools/neutrality.test.ts` is a static source-grep against the FORBIDDEN token list (`lib/whatsapp`, `ownerPhone`, `WhatsAppMessage`, `sendWhatsAppMessage`, `whatsapp_`) — `lib/agent-tools/send-customer-message.ts` must use `channelRef` (never `ownerPhone`) throughout, including in comments. This is the single most likely accidental regression in this phase given the feature's WhatsApp-heavy framing.
- **Migration idempotency.** `supabase/migrations/20260721000005_phase178_agentic_send_confirmations.sql` must use `IF NOT EXISTS` throughout (table, indexes) — safe to re-run, consistent with every migration in this repo. Prefix `20260721000005` — 001 (Phase 172), 002 (Phase 175), 003 (Phase 176), 004 (Phase 177) are taken.
- **`send_customer_message` (MCP) schema drift.** Any future change that adds a second field to this tool's `inputSchema` re-opens the exact injection surface AGENT-03 closes. The schema-walk test in 178-04 must be treated as a permanent gate, not a one-time check — do not weaken it when the tool is next touched.
- **Rate limit identifier.** `checkAgenticSendRateLimit` must key on `companyId`, never a `userId`/session id — a single company must not be able to bypass the daily cap by having multiple staff/owners each trigger sends from their own WhatsApp number or MCP session.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Migration applies cleanly to prod | AGENT-01/02/03 (schema) | Deploy is CI→GHCR→Coolify; migrations are applied manually per project convention | After merge, manually apply `20260721000005_phase178_agentic_send_confirmations.sql` to the prod Supabase project (after Phases 172/175/176/177's migrations, if not already applied); verify via `select column_name from information_schema.columns where table_name='agentic_send_confirmations'` (expect all 13 columns) and confirm the CHECK constraint exists. |
| Real end-to-end WhatsApp confirm flow | AGENT-01 | Requires a live WhatsApp number, a real consented test client, and the Phase 177 operational gates (dedicated Twilio Messaging Service, Resend domain) already configured | In a staging company with a consented test client: ask the assistant "text [client] that we're running a day late", confirm the draft echoes the exact phone + body, reply YES on the NEXT message, confirm the SMS actually arrives and a `customer_messages` row appears with `trigger_source='agentic-whatsapp'`. Repeat with NO — confirm nothing sends and the `agentic_send_confirmations` row status is `'cancelled'`. |
| Real end-to-end MCP draft/send round-trip | AGENT-02 | Requires a real MCP client (Claude.ai) connected via OAuth to a staging company | From Claude.ai (or another MCP client), call `draft_customer_message`, inspect the returned preview + `confirmation_token`, then call `send_customer_message` with that token; confirm delivery and a `customer_messages` row with `trigger_source='agentic-mcp'`. Then attempt to call `send_customer_message` again with the SAME token — confirm it fails (`not_found`, already consumed). |
| Rate limit under real Redis | AGENT-03 | Requires the platform's live Upstash Redis instance, not exercised by the fail-open unit tests | Trigger 11 agentic drafts for the same company within 24h (staging); confirm the 11th is refused with `rate_limited` and no confirmation row is created. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task in every plan has one)
- [x] Wave 0 covers all MISSING references (6 test files, all owned by their respective plan's task)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency <10s per task, <60s per wave
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Initial plan-phase pass. This is the milestone's final phase and its highest-risk surface (first LLM-authored message sent to a real third party) — the never-throw/try-catch discipline in 178-01, the structural (not conventional) `send_customer_message` schema restriction in 178-04, and the zero-existing-test-file-edit constraint in 178-03 are all treated as load-bearing, not stylistic. Ready for `/gsd:execute-phase 178`.
