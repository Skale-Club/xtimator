---
phase: quick-260603-lrf
plan: 01
subsystem: whatsapp-inbound
tags: [whatsapp, langgraph, intent-routing, multi-tenant, inngest, ai]
requires:
  - lib/ai/openrouter-client (transcribeAudioOR, analyzePhotoOR)
  - lib/whatsapp/client (downloadWhatsAppMedia, sendWhatsAppMessage)
  - lib/whatsapp/agent (runConfirmationAgent)
  - lib/whatsapp/confirm (processConfirmationReply)
  - lib/whatsapp/confirm-actions (actionCancel)
  - lib/whatsapp/handler (processInboundMessages)
  - lib/whatsapp/conversations (logOutboundMessage)
provides:
  - lib/whatsapp/normalize (normalizeMessage)
  - lib/whatsapp/query-tools (makeQueryTools — company-scoped read-only tools)
  - lib/whatsapp/intent-router (classifyAndRoute)
  - lib/inngest/events (EVENT_WHATSAPP_INTENT, WhatsAppIntentPayload)
  - lib/inngest/functions/whatsapp-process (whatsAppIntentRouterJob)
affects:
  - lib/whatsapp/handler (awaiting_confirm branch rerouted)
  - app/api/inngest/route (new function registered)
tech-stack:
  added: []
  patterns:
    - LangChain ChatOpenAI gpt-4o temp 0 classifier (same as agent.ts)
    - createReactAgent over closure-scoped read-only tools (QUERY)
    - Inngest dispatch off webhook ack path (mirrors EVENT_WHATSAPP_PROCESS)
key-files:
  created:
    - lib/whatsapp/normalize.ts
    - lib/whatsapp/query-tools.ts
    - lib/whatsapp/intent-router.ts
    - tests/unit/whatsapp/normalize.test.ts
    - tests/unit/whatsapp/query-tools.test.ts
    - tests/unit/whatsapp/intent-router.test.ts
    - tests/unit/whatsapp/handler-intent-routing.test.ts
  modified:
    - lib/inngest/events.ts
    - lib/inngest/functions/whatsapp-process.ts
    - lib/inngest/functions/index.ts
    - app/api/inngest/route.ts
    - lib/whatsapp/handler.ts
    - tests/unit/whatsapp/handler.test.ts
decisions:
  - company_id is a closure param of makeQueryTools, never a zod tool-input field — sole cross-tenant isolation control under service-client reads (T-lrf-01)
  - Unrecognized classifier output defaults to CREATE (safe estimate path), never a privileged action (T-lrf-02)
  - Only awaiting_confirm is rerouted through the classifier; awaiting_details debounce continuation left untouched (preserves multi-message burst handling)
  - intent-router runs inside Inngest (whatsAppIntentRouterJob) after the webhook ack; read receipt + typing fire first in handler before dispatch
metrics:
  tasks: 3
  files-created: 7
  files-modified: 6
  tests-added: 32
  completed: 2026-06-03
---

# Quick Task 260603-lrf: WhatsApp Inbound AI Intent Routing Summary

Replaced the rigid awaiting_confirm send/cancel gate with an AI intent classifier that normalizes every inbound message (audio→Whisper, photo→vision, text→as-is via the existing provider path) then routes it into CONFIRM_OR_CANCEL / EDIT / CREATE / QUERY using session + conversation history, with strictly company-scoped read-only QUERY tools — all run inside Inngest off the Meta webhook ack path.

## What Changed

### Task 1 — Normalizer + multi-tenant QUERY tools (commit df59e84)
- `lib/whatsapp/normalize.ts`: `normalizeMessage(msg, companyId, supabase) → { text, kind, ok, reason? }`. Reuses `transcribeAudioOR`/`analyzePhotoOR` + `downloadWhatsAppMedia` with the exact mime/ext derivation from estimate-graph.ts (strip codec param, mp4→m4a for Whisper). Never throws — returns `ok:false` with a reason on download/transcription/analysis failure.
- `lib/whatsapp/query-tools.ts`: `makeQueryTools(companyId, supabase)` returns 4 read-only LangChain tools (`find_client_by_name`, `get_latest_estimate_for_client`, `get_project_status`, `list_recent_estimates`). `companyId` is a closure parameter; every read chains `.eq('company_id', companyId)`; no zod schema accepts a tenant field.

### Task 2 — Intent-router + Inngest job + event (commit aafb88f)
- `lib/whatsapp/intent-router.ts`: `classifyAndRoute(input)` runs normalize → loadHistory (same query shape as agent.ts, last 20 messages) → classify (ChatOpenAI gpt-4o temp 0) → dispatch. CONFIRM_OR_CANCEL→`processConfirmationReply`; EDIT→`runConfirmationAgent`; CREATE→`actionCancel` (discard pending) then `processInboundMessages`; QUERY→`createReactAgent` over `makeQueryTools` then `sendWhatsAppMessage`. Unrecognized label defaults to CREATE. Normalize `ok:false` sends a graceful "couldn't read your audio/photo" reply.
- `lib/inngest/events.ts`: `EVENT_WHATSAPP_INTENT` + `WhatsAppIntentPayload`.
- `lib/inngest/functions/whatsapp-process.ts`: `whatsAppIntentRouterJob` (id `whatsapp-intent`, idempotency `event.data.batchKey`, retries 1) — refresh typing then `step.run('route-intent')` invoking `classifyAndRoute` with a service client. `whatsAppProcessJob` untouched.
- Registered the new job in `index.ts` and `app/api/inngest/route.ts`.

### Task 3 — Handler rewire (commit 8d39708)
- `lib/whatsapp/handler.ts`: both `processInboundWithDebounce` and `processInboundMessage` awaiting_confirm branches now call `dispatchIntentRouter` → `inngest.send(EVENT_WHATSAPP_INTENT, { message, session, ownerPhone(+), fromPhone(no +), batchKey: wa-intent-{id} })` via the existing dynamic-import pattern. Read receipt + typing still fire first. Deleted the dead `processSingleMessageWithSession` canned-reply function and its now-unused imports. awaiting_details debounce + no-session EVENT_WHATSAPP_PROCESS paths unchanged. Updated handler.test.ts awaiting_confirm assertions.

## Verification

- `npx vitest run` on all 5 task-owned test files: **32/32 passed**.
- `npx tsc --noEmit`: **clean** (no dangling imports after the handler rewire).
- Multi-tenant proof: `query-tools.ts` has 7 `.eq('company_id', companyId)` reads; `companyId` appears only as the closure param + in filters — never in a zod schema (dedicated security test asserts both).
- Provider-reuse proof: `normalize.ts` imports/uses `transcribeAudioOR`/`analyzePhotoOR` only (no new transcription provider).
- Placement proof: `handler.ts` dispatches `EVENT_WHATSAPP_INTENT`; zero `processSingleMessageWithSession` references remain.

## Deviations from Plan

None to the implementation. Two test-only adjustments made during TDD (both fix over-strict test assertions, not source behavior):
- query-tools.test.ts Test 3: relaxed `1234` → `/1,?234/` + date assertion because `formatMoney` renders `$1,234.00`.
- intent-router.test.ts: class-based `ChatOpenAI` mock (constructible after clearAllMocks) and resolved-promise defaults for collaborator mocks in `beforeEach`; typed the `makeQueryTools` mock signature so `tsc` is clean.

## Deferred Issues (out of scope — pre-existing, not caused by this task)

See `deferred-items.md`. The full `tests/unit/whatsapp/` run shows 4 failures in files this task never touched:
- `tests/unit/inngest/whatsapp-process-job.test.ts` (2) — greps source patterns that quick task 260602-mq2 moved from whatsapp-process.ts into estimate-graph.ts. The whatsAppProcessJob id+idempotency contract test still passes.
- `tests/unit/whatsapp/client.test.ts` (3) — pre-existing commit 6ab78e4 changed `GRAPH_BASE` to a template string; the tests hardcode `v21.0`.
- `tests/unit/whatsapp/integrations-page.test.tsx` (1) — unrelated UI getByText multiple-match.

`git diff 932a31c..HEAD` confirms this task's commits only touched the 13 listed files; `client.ts`/`estimate-graph.ts`/`docker-compose.yaml` changes belong to earlier commits (6ab78e4, 2866e9b, 8b00b34) already on main at session start.

## Known Stubs

None. All flows wire to real reused modules; no placeholder/empty-data paths introduced.

## Self-Check: PASSED

All 7 created files present on disk; all 3 task commits (df59e84, aafb88f, 8d39708) present in git history.
