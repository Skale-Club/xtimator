---
phase: quick-260603-lrf
verified: 2026-06-03T16:05:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
---

# Quick Task 260603-lrf: WhatsApp Inbound AI Intent Routing Verification Report

**Task Goal:** Every inbound WhatsApp message (any session state) is normalized to text (audio→transcription, photo→vision, text→as-is), AI-classified into CONFIRM_OR_CANCEL / EDIT / CREATE / QUERY, and routed to the existing reused flows — inside Inngest after the fast webhook ack. Core requirement: audio/photo arriving during awaiting_confirm is READ, not bounced with a canned reply. #1 security invariant: QUERY tools strictly scoped to the sender's company_id via a closure param (never from LLM/tool input/message text).
**Verified:** 2026-06-03T16:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Audio/photo arriving during awaiting_confirm is transcribed/analyzed and acted on (NOT canned-rejected) | ✓ VERIFIED | `handler.ts:71-83` (and twin `177-187`) replace the old gate with `dispatchIntentRouter` → `EVENT_WHATSAPP_INTENT`. `processSingleMessageWithSession` has zero references in source (only planning docs). intent-router.ts normalizes then classifies regardless of media type. |
| 2 | Every inbound is normalized to text via the SAME provider path as estimate-graph.ts | ✓ VERIFIED | `normalize.ts:20-21` imports `transcribeAudioOR, analyzePhotoOR` from `@/lib/ai/openrouter-client` and `downloadWhatsAppMedia` from client. No new provider. mp4→m4a remap copied verbatim (`normalize.ts:49-51`). |
| 3 | Inbound classified into exactly one of CONFIRM_OR_CANCEL / EDIT / CREATE / QUERY using session + history context | ✓ VERIFIED | `intent-router.ts:128-165` classify() builds prompt with session state + draft flag + last 20 messages (`loadConversationHistory:60-89`); `parseIntent:95-102` maps to the 4-label set; tests assert routing for each. |
| 4 | QUERY returns data ONLY for the sender's resolved company_id | ✓ VERIFIED | `query-tools.ts` every read chains `.eq('company_id', companyId)` (7 occurrences); `dispatchQuery:171-191` builds tools with `input.companyId`. Security test `query-tools.test.ts:70-95` asserts every tenant-table query received the closure value. |
| 5 | MULTI-TENANT INVARIANT: company_id never from message text or LLM output; closure only | ✓ VERIFIED | `makeQueryTools(companyId, supabase)` captures companyId as closure param; NO zod schema contains company_id (schemas only accept `name`/`{}`). Test `query-tools.test.ts:55-68` asserts no schema key is company_id/companyid. companyId flows route.ts → Inngest payload → job → classifyAndRoute → makeQueryTools, never from `message`. |
| 6 | CREATE on new media while a draft is pending discards the pending session then runs create path | ✓ VERIFIED | `intent-router.ts:255-264` dispatchCreate: `if (sess) await actionCancel(sess, supabase)` then `processInboundMessages([msg], companyId, fromPhone, supabase)`. Test 2 asserts actionCancel then processInboundMessages with fromPhone (no +). |
| 7 | Read receipt + typing fire first; heavy work runs in Inngest after webhook ack | ✓ VERIFIED | `handler.ts:57-58` markMessageAsRead + sendTypingIndicator before any dispatch; awaiting_confirm path then dispatches `EVENT_WHATSAPP_INTENT` (Inngest); `whatsAppIntentRouterJob` runs normalize+classify in step.run off the ack path. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/whatsapp/normalize.ts` | normalizeMessage reusing transcribeAudioOR/analyzePhotoOR + downloadWhatsAppMedia | ✓ VERIFIED | 100 lines, imports the 3 reused fns only, never throws (ok:false on failure), mp4→m4a remap present. |
| `lib/whatsapp/query-tools.ts` | makeQueryTools → 4 company-scoped read-only tools | ✓ VERIFIED | 189 lines, 4 tools (find_client_by_name, get_latest_estimate_for_client, get_project_status, list_recent_estimates), companyId closure, 7 `.eq('company_id', companyId)`, no company_id in any schema. |
| `lib/whatsapp/intent-router.ts` | classifyAndRoute: normalize → classify (ChatOpenAI) → dispatch | ✓ VERIFIED | 266 lines, full normalize→loadHistory→classify→4-way dispatch; QUERY via createReactAgent over makeQueryTools; graceful failure reply. |
| `lib/inngest/functions/whatsapp-process.ts` | whatsAppIntentRouterJob + unchanged whatsAppProcessJob | ✓ VERIFIED | whatsAppIntentRouterJob id `whatsapp-intent`, idempotency `event.data.batchKey`, retries 1, imports intent-router; whatsAppProcessJob untouched. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| handler.ts | EVENT_WHATSAPP_INTENT | dispatchIntentRouter for awaiting_confirm | ✓ WIRED | `handler.ts:248-260` inngest.send(EVENT_WHATSAPP_INTENT, ...). Old canned reply removed. |
| whatsapp-process.ts | intent-router.ts | classifyAndRoute in step.run | ✓ WIRED | `whatsapp-process.ts:91-101` dynamic import + classifyAndRoute with service client. |
| query-tools.ts | clients/projects/estimates | service-client reads filtered by company_id | ✓ WIRED | `.eq('company_id', companyId)` on every read (7×). |
| normalize.ts | transcribeAudioOR / analyzePhotoOR | reused from openrouter-client | ✓ WIRED | `normalize.ts:20` import + used at :62 and :87. |
| index.ts + route.ts | whatsAppIntentRouterJob | function registry | ✓ WIRED | Exported in `functions/index.ts:8`; registered in `app/api/inngest/route.ts` (2 refs). |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| WA-INTENT-01 | normalize-first for every inbound, any session state | ✓ SATISFIED | normalize.ts + intent-router step 1. |
| WA-INTENT-02 | AI intent classifier (4 labels) | ✓ SATISFIED | intent-router classify() + parseIntent. |
| WA-INTENT-03 | multi-tenant-scoped read-only QUERY tools | ✓ SATISFIED | query-tools.ts closure scoping + security test. |
| WA-INTENT-04 | route heavy work through Inngest after fast ack | ✓ SATISFIED | EVENT_WHATSAPP_INTENT + whatsAppIntentRouterJob; read receipt/typing before dispatch. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Type safety after rewire | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Task-owned tests (5 files) | `npx vitest run normalize/query-tools/intent-router/handler-intent-routing/handler` | 5 files, 32/32 passed | ✓ PASS |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder/canned-reply remnants in the task files. `processSingleMessageWithSession` fully deleted from source (only appears in planning docs). All flows wire to real reused modules; no hardcoded-empty data paths introduced.

### Out-of-Scope / Pre-Existing Failures (NOT counted against this task)

Confirmed per task instructions — these files were not touched by this task's commits:
- `tests/unit/inngest/whatsapp-process-job.test.ts` — greps source patterns moved by task 260602-mq2 into estimate-graph.ts. (The whatsAppProcessJob id+idempotency contract still holds; whatsapp-process.ts here leaves whatsAppProcessJob unchanged.)
- `tests/unit/whatsapp/client.test.ts` — pre-existing GRAPH_BASE template-string change (commit 6ab78e4).
- `tests/unit/whatsapp/integrations-page.test.tsx` — unrelated UI multiple-match.

### Human Verification Required

None. All must-haves verified programmatically (existence + substance + wiring + data-flow + tsc + unit tests). The classifier/LLM behavior and live Inngest dispatch are covered by mocked routing tests; no item strictly requires manual UI/real-time verification to confirm goal achievement at the code level.

### Gaps Summary

No gaps. All 7 observable truths verified, all 4 artifacts pass all levels, all 5 key links wired, all 4 requirements satisfied, tsc clean, 32/32 task-owned tests green. The #1 security invariant (company_id closure-scoping, never from LLM/message/schema) is enforced in code and asserted by a dedicated security test.

---

_Verified: 2026-06-03T16:05:00Z_
_Verifier: Claude (gsd-verifier)_
