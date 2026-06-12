---
status: root_cause_found_infra
trigger: "whatsapp-inbound-no-reply-recurrence — registered company number messages admin Xtimator WhatsApp number, sees read+typing but never gets a reply; no project/estimate created"
created: 2026-06-08T00:00:00Z
updated: 2026-06-08T14:05:00Z
---

## CORRECTED ROOT CAUSE (live DB evidence, orchestrator 2026-06-08T14:05)

The gsd-debugger above worked WITHOUT DB access and inferred "estimate-graph throws
on a dead OpenRouter key." Live Supabase evidence overturns the specifics:

**The Inngest EVENT-triggered jobs are not executing in production at all.** This is
an infra/config problem on the Coolify deploy + Inngest Cloud — NOT a code bug in the
estimate graph (that code is never even reached).

Live evidence (mcp Supabase Xtimator, prod DB):
1. Today's 2 inbound texts (16:12:19 + 16:12:58 UTC = 13:12 local, matches the user's
   screenshot) ARE in `whatsapp_processed_messages`, resolved to company
   d0a4bf2b (Bidu tech, tier=trial). The webhook ran to completion: dedup written,
   company resolved, mark-read + typing fired (all SYNCHRONOUS, pre-Inngest-dispatch).
2. ZERO rows created platform-wide since 2026-06-03 20:00 UTC: projects=0, estimates=0,
   recordings=0 (across ALL companies, not just this one). The last successful WhatsApp
   estimate was 2026-06-03 ~19:10 UTC (project f248f7a5 "Upholstery Cleaning Service").
3. A diagnostic `insert into projects (...exact processInboundMessages shape...)`
   SUCCEEDED (rolled back) → project insert / schema is fine. Not a DDL break.
4. tier=trial → not the free-tier `whatsappEnabled=false` reply branch.
5. GET https://xtimator.com/api/inngest → `{"message":"Unauthorized"}` (NOT `mode:dev`)
   → prod IS in Inngest CLOUD mode, so the old INNGEST_DEV-truthy landmine is NOT the
   cause this time. /api/health → ok.

Airtight logic (independent of the platform-wide zero): the single-message no-session
path is dispatchIntentRouter → EVENT_WHATSAPP_INTENT → whatsAppIntentRouterJob →
classifyAndRoute. EVERY terminal path of classifyAndRoute either (a) creates a project
(CREATE → processInboundMessages, the default + the classifier-failure fallback) or
(b) sends the owner a reply (normalize-fail, QUERY answer). Today produced NEITHER a
project NOR a reply ⇒ the Inngest function never executed. Read+typing are emitted in
handler.ts (lines 57-58/138) BEFORE the `inngest.send()` dispatch, which is exactly why
the sender sees read+"typing…" then total silence.

Break window started ~2026-06-03 20:00 UTC — right after the 06-03 deploy that landed
the 260603-lrf intent-router + the NEW `whatsAppIntentRouterJob` function. Adding a new
Inngest function requires an Inngest Cloud re-sync of the serve endpoint; if that sync
is stale/failing (or the signing/event keys don't match), Cloud accepts events but never
invokes the functions → platform-wide silence.

Exact sub-cause is one of (needs the Inngest Cloud dashboard to pick between them):
  (a) App not synced to Inngest Cloud after the 06-03 deploy (functions not registered
      at the current serve URL) — events arrive, no runs.
  (b) INNGEST_SIGNING_KEY in Coolify ≠ Inngest Cloud app key → Cloud's POST invocations
      to https://xtimator.com/api/inngest get 401'd → runs never start.
  (c) INNGEST_EVENT_KEY in Coolify wrong/missing → app's `inngest.send()` throws (caught
      & swallowed by route.ts after()/try-catch) → events never reach Cloud.

Why the agent's code fix does NOT resolve the live outage: its `onFailure` handler and
in-graph catch only run if the function EXECUTES and exhausts retries. If Inngest Cloud
cannot invoke the function at all, onFailure never fires. The fix is good defense-in-depth
(keep it) but the production blocker is the Inngest Cloud ⇄ Coolify connection.

NEXT ACTION (user / infra — cannot be done from this session):
  1. Open Inngest Cloud dashboard → "xtimator" app. Is it synced? Are all 8 functions
     (incl. whatsapp-intent, whatsapp-process) listed against https://xtimator.com/api/inngest?
       - Not listed / stale URL → re-sync (Inngest dashboard "Sync new app" / re-deploy).
  2. Events tab: are `whatsapp/intent.requested` events arriving?
       - NO events → INNGEST_EVENT_KEY wrong/missing in Coolify (sub-cause c).
       - events but 0 runs / runs erroring at invoke → INNGEST_SIGNING_KEY mismatch or
         unreachable serve URL (sub-cause a/b).
  3. Confirm Coolify env: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY match the Cloud app,
     and INNGEST_DEV is unset/false. Re-deploy to force a fresh sync.
  4. Re-test: message the Xtimator number → a project row should appear in `projects`
     and a reply should arrive. Then (separately) a successful ESTIMATE still needs a
     valid AI provider key (selected provider = gemini per platform_integrations.ai_config).

---

## Current Focus

hypothesis: The WhatsApp estimate pipeline has NO error-reply guarantee. Every reply (welcome aside) is generated INSIDE the Inngest job's `orchestrate-estimate` step, which runs the LangGraph end-to-end. Any throw inside the graph — generateEstimateNode (OpenRouter dead key / 401 "User not found" / model missing), processMessageNode transcription, evaluateVaguenessNode, or even the dispatch chain — propagates up, fails the step, the job retries once (retries:1) and dies SILENTLY. Typing fires before the graph reaches the failing node (webhook path + job refresh-typing step), so the user sees read+typing then nothing. This is the recurrence-resistant root cause: prior fixes patched individual failure inputs (owner_phone backfill, classifier fallback, unknown-sender reply) but never guaranteed a reply when the graph itself throws. The single most likely live trigger is the dead OpenRouter key (per project memory: 401 "User not found" since 2026-02-20), the SAME family that silently broke transcribing-hangs + generating-estimate-error.
test: Static trace of dispatch→job→graph→send confirmed the silent-throw path. Live confirmation of WHICH input is dead (OpenRouter key vs INNGEST_DEV vs Meta token) requires Supabase MCP / Inngest Cloud logs — NEITHER is available in this session (mcp__claude_ai_Supabase_Xtimator__* tools are not exposed; prod is Coolify, unreachable from here).
expecting: Fix must make the failure non-silent regardless of which input is dead.
next_action: Wrap the graph invocation so any failure still sends the owner a fallback reply + logs the real error. This converts every silent failure into a visible, recoverable one and durably defeats the recurrence.

## Symptoms

expected: Company-registered number messages admin Xtimator number → company resolved → project/estimate created → WhatsApp reply sent.
actual: Sender sees read + typing indicators but NEVER receives reply. No project/estimate created. Silent after typing.
errors: None reported (silent). Must inspect logs.
reproduction: Send WhatsApp from a company-registered phone to the admin Xtimator number (+15082058044, phone_number_id 1188129477713223).
started: Recurrence — prior fixes (whatsapp-admin-number-no-reply, whatsapp-intent-no-reply, whatsapp-owner-phone-inbound) did not durably resolve.

## Eliminated

## Evidence

- timestamp: 2026-06-08
  checked: route.ts handleInboundMessage order
  found: Dedup insert into whatsapp_processed_messages (line 208) happens BEFORE processInboundWithDebounce (line 251). Typing fires inside processInboundWithDebounce (line 57-58), AFTER dedup. So a retry of a message whose first attempt inserted dedup but failed before dispatching would be dropped at dedup BEFORE typing fires — meaning if user sees typing, dedup passed this round. Typing therefore comes from the live processInboundWithDebounce, and the Inngest dispatch is downstream of typing.
  implication: The failure is at or after the Inngest dispatch (handler.ts) or inside the Inngest job. Typing working confirms webhook + service client + company resolution all succeeded.

- timestamp: 2026-06-08
  checked: Full dispatch path route.ts → handler.ts → whatsapp-process.ts → estimate-graph.ts → client.ts
  found: |
    Reply generation lives ENTIRELY inside the Inngest job. For a single new
    message with no session: processInboundWithDebounce → batch.length===1 →
    dispatchIntentRouter → EVENT_WHATSAPP_INTENT → whatsAppIntentRouterJob →
    classifyAndRoute → (CREATE) → processInboundMessages → EVENT_WHATSAPP_PROCESS
    → whatsAppProcessJob → step.run('orchestrate-estimate') → graph.invoke().
    The graph's generateEstimateNode (estimate-graph.ts:237-245) calls
    generateEstimateForProject → getAIProvider → OpenRouterAdapter.generateEstimate
    → callTool. callTool throws on: null key (openrouter.ts:137), non-OK HTTP
    incl. 401 (openrouter.ts:178-182), error.message (186-188), missing tool call
    (194-198), malformed JSON (224-225). generateEstimateNode has NO try/catch.
  implication: ANY OpenRouter failure throws → graph throws → orchestrate-estimate
    step throws → job retries 1x → dies. whatsAppProcessJob has NO onFailure. Net
    result: zero reply, zero error to user. Exactly the reported symptom.

- timestamp: 2026-06-08
  checked: client.ts sendTypingIndicator vs sendWhatsAppMessage vs getWhatsAppPlatformConfig
  found: |
    Typing (sendTypingIndicator) and reply (sendWhatsAppMessage) use the SAME
    token + phoneNumberId from getWhatsAppPlatformConfig() (DB meta_whatsapp row,
    env fallback). Both hit the same Graph API host. So typing succeeding proves
    the token + phone_number_id are valid and outbound HTTP works → the reply send
    WOULD succeed if it were ever reached. Therefore the failure is upstream of
    the send (job never runs OR graph throws before send), NOT the send itself.
  implication: Eliminates Meta-token-expiry as the live cause (typing works).
    Narrows to: graph throws before send (AI key) OR job never runs (INNGEST_DEV).

- timestamp: 2026-06-08
  checked: Correlation with resolved sessions transcribing-hangs.md + generating-estimate-error.md + project memory
  found: |
    Both prior resolved sessions had identical mechanism: AI provider key
    (OpenRouter) missing/dead → generateEstimateForProject throws inside an Inngest
    step → job fails silently → UI/user sees nothing actionable. Memory note
    "OpenRouter 401 is not transient" states the OpenRouter key is dead ("User not
    found"). WhatsApp is just another consumer of the SAME generateEstimateForProject.
  implication: The recurrence is a CLASS of bug (silent AI-failure inside an Inngest
    graph step with no reply guarantee), not a single input. Prior WhatsApp fixes
    (owner_phone backfill, classifier→CREATE fallback, unknown-sender reply) each
    patched ONE input but left the graph able to fail silently. Durable fix must
    guarantee a reply on ANY graph failure.

- timestamp: 2026-06-08
  checked: Tool availability for live confirmation
  found: |
    Supabase MCP tools (mcp__claude_ai_Supabase_Xtimator__execute_sql / list_tables)
    are NOT exposed in this session despite the prompt assuming them. Prod runs on
    Coolify (not reachable from here); local Inngest dev server (localhost:8288) is
    not running. Cannot fetch live run logs or DB rows to confirm WHICH input is dead.
  implication: Cannot empirically isolate the single live trigger. Fix is therefore
    designed to be cause-agnostic: convert silent graph failure into a visible,
    logged, user-replied failure so the symptom (no reply) cannot recur regardless
    of which underlying input (OpenRouter key, transcription, INNGEST_DEV) is at fault.

## Resolution

root_cause: |
  The WhatsApp inbound estimate pipeline generates EVERY owner reply inside the
  Inngest job's single `orchestrate-estimate` step (the LangGraph estimate-graph).
  generateEstimateNode (and the media/vagueness nodes) re-throw on failure with no
  catch, so any failure — most likely a dead/missing OpenRouter API key
  (generateEstimateForProject → OpenRouterAdapter.callTool throws on 401 "User not
  found" / null key), but also transcription failure or INNGEST_DEV misconfig — kills
  the step. whatsAppProcessJob (retries:1, no onFailure) then dies silently. Because
  read-receipt + typing indicators fire on the webhook path and in the job's
  refresh-typing step BEFORE the graph reaches the failing node, the sender sees
  read + "typing…" and then nothing: no estimate, no error reply. The prior three
  debug fixes patched individual resolution inputs but never guaranteed a reply when
  the graph itself throws, which is why the symptom keeps recurring whenever any AI
  input degrades.
fix: |
  Make the failure non-silent and recoverable (cause-agnostic durable fix):
  1. estimate-graph.ts: wrap generateEstimateNode in try/catch — on throw, route to
     a new "sendError"-style reply ("Sorry, I hit a problem generating your estimate.
     Please try again in a moment.") instead of throwing out of the graph.
  2. whatsapp-process.ts whatsAppProcessJob: wrap graph.invoke so a thrown graph
     guarantees a fallback owner reply + console.error with the real cause, and add
     an onFailure handler that sends the same fallback reply after retries exhaust.
     This guarantees a reply even if the graph itself cannot be entered.
verification: |
  Re-trace: with the catch in place, a forced generateEstimate throw now hits the
  error reply path (sendWhatsAppMessage to ownerPhone) instead of propagating. Unit
  test asserts generateEstimateNode failure → error reply sent, not rethrown.
  NOTE: end-to-end confirmation (real inbound from the registered number now gets a
  reply) requires the user to test against the live Coolify prod number, AND — for a
  successful estimate (not just an error reply) — the OpenRouter key must be valid in
  prod platform_integrations. The code fix stops the SILENCE; a valid OpenRouter key
  is still required for a successful estimate. Both are called out in the checkpoint.
files_changed:
  - lib/whatsapp/estimate-graph.ts (generateEstimateNode now catches → generationFailed flag; new checkGeneratedEdge routes failures to sendError; sendErrorNode message branches on generationFailed)
  - lib/inngest/functions/whatsapp-process.ts (added sendFallbackReply + onFailure handler on whatsAppProcessJob that replies after retries exhaust)
  - tests/unit/inngest/whatsapp-process-job.test.ts (updated stale post-graph-refactor assertions; added reply-on-failure-guarantee coverage)

self_verified:
  - tsc --noEmit: zero errors in changed files (pre-existing errors only in tests/unit/notifications/account-emails.test.ts, untouched by this fix)
  - vitest tests/unit/inngest/whatsapp-process-job.test.ts: 5 passed
  - vitest whatsapp handler + handler-inngest-dispatch + intent-router: 31 passed
  - confirmed tests/unit/whatsapp/client.test.ts failure is PRE-EXISTING (fails on original unmodified code; mock fetch returns undefined Response — unrelated to this fix)
