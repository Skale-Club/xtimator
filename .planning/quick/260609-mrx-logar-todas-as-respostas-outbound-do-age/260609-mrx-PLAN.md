---
phase: quick-260609-mrx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/whatsapp/send-welcome.ts
  - lib/whatsapp/handler.ts
  - app/api/cron/cleanup-whatsapp-sessions/route.ts
  - lib/errors/whatsapp.ts
  - lib/inngest/functions/whatsapp-process.ts
autonomous: true
requirements: [WA-OUTBOUND-LOG]
must_haves:
  truths:
    - "The first-contact WELCOME message appears in the conversation thread"
    - "The free-tier 'WhatsApp not on your plan' rejection appears in the thread"
    - "The expired-session reminder (cron) appears in the thread"
    - "The Inngest onFailure FALLBACK_ERROR_REPLY appears in the thread when companyId is available"
    - "handleWhatsAppError can log its outbound error message when given svc + companyId (backward-compatible signature)"
    - "No existing WhatsApp send is broken, blocked, or made to throw by the new logging"
  artifacts:
    - path: "lib/whatsapp/send-welcome.ts"
      provides: "welcomeOnFirstContact logs WELCOME_TEXT outbound"
      contains: "logOutboundMessage"
    - path: "lib/whatsapp/handler.ts"
      provides: "free-tier rejection logs outbound"
      contains: "logOutboundMessage"
    - path: "app/api/cron/cleanup-whatsapp-sessions/route.ts"
      provides: "expiry reminder logs outbound"
      contains: "logOutboundMessage"
    - path: "lib/errors/whatsapp.ts"
      provides: "handleWhatsAppError optional svc+companyId logging"
      contains: "logOutboundMessage"
    - path: "lib/inngest/functions/whatsapp-process.ts"
      provides: "sendFallbackReply logs fallback outbound when companyId present"
      contains: "logOutboundMessage"
  key_links:
    - from: "lib/whatsapp/send-welcome.ts"
      to: "lib/whatsapp/conversations.ts logOutboundMessage"
      via: "best-effort .catch(() => undefined) after sendWhatsAppWelcome"
      pattern: "logOutboundMessage\\("
    - from: "app/api/cron/cleanup-whatsapp-sessions/route.ts"
      to: "whatsapp_messages via logOutboundMessage"
      via: "requireServiceClient() + session.company_id"
      pattern: "logOutboundMessage\\("
---

<objective>
Several outbound bot/"agent" WhatsApp replies are sent via `sendWhatsAppMessage(...)` WITHOUT being logged to `whatsapp_messages`, so they never appear in the admin conversation thread. Add best-effort `logOutboundMessage(...)` calls at the 5 unlogged outbound send sites so EVERY agent response shows up in the thread.

Purpose: Make the WhatsApp conversation thread a complete record of the bot's outbound replies, matching what the user/admin actually received.
Output: 5 outbound send sites log their message (msgType 'text', status 'sent') best-effort, mirroring the existing `lib/whatsapp/intent-router.ts` / `agent.ts` pattern: `logOutboundMessage(svc, {...}).catch(() => undefined)`. No DB migration (the helper + existing tables suffice).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

<interfaces>
<!-- The logging helper. Service-role client REQUIRED (whatsapp_* tables are RLS deny-all). -->
<!-- Never throws blocking — existing call sites use .catch(() => undefined). -->

From lib/whatsapp/conversations.ts:
```typescript
export async function logOutboundMessage(
  svc: SupabaseClient,
  params: {
    companyId: string
    contactPhone: string
    contactName?: string | null
    clientId?: string | null
    body?: string | null
    msgType?: WaMsgType            // use 'text'
    waMessageId?: string | null
    mediaUrl?: string | null
    status?: WaMessageStatus       // use 'sent'
    errorMessage?: string | null
  },
): Promise<string>
```

EXISTING CALL STYLE TO MIRROR — from lib/whatsapp/intent-router.ts (sendOwnerReply, ~line 119):
```typescript
await sendWhatsAppMessage(input.ownerPhone, { type: 'text', text: { body } })
logOutboundMessage(input.supabase, {
  companyId: input.companyId,
  contactPhone: input.ownerPhone,
  body,
  msgType: 'text',
  status: 'sent',
}).catch(() => undefined)
```

Service-role client import: `import { requireServiceClient } from '@/lib/supabase/service'`

The Inngest onFailure payload type (lib/inngest/events.ts) — BOTH fields available:
```typescript
export type WhatsAppProcessPayload = {
  companyId: string
  projectId: string
  ownerPhone: string
  messages: unknown[]
  batchKey: string
}
```
</interfaces>

<discovery_findings>
<!-- Pre-verified during planning — executor should NOT re-investigate these. -->
- `handleWhatsAppError` has ZERO production callers. Confirmed via grep across `app/` and `lib/`:
  the only references are its own definition (lib/errors/whatsapp.ts), unit tests
  (tests/unit/errors/whatsapp-adapter.test.ts), and `.planning/` SEED/ROADMAP docs.
  => Task 2's "update all callers with svc+companyId" is therefore a NO-OP for production code.
  Still change the signature backward-compatibly and document the no-caller finding in the SUMMARY.
- `welcomeOnFirstContact(serviceClient, companyId, toPhone)` already has BOTH service client and
  companyId in scope. WELCOME_TEXT is a module const in lib/whatsapp/send-welcome.ts.
  sendWhatsAppWelcome(toPhone) (the bare helper) has NO companyId — log in welcomeOnFirstContact, NOT there.
- handler.ts free-tier branch is at ~line 344 (`if (!entitlements.whatsappEnabled) { ... return }`),
  with `supabase`, `companyId`, `ownerPhone` all in scope. handler.ts does NOT yet import logOutboundMessage.
- cron route (app/api/cron/cleanup-whatsapp-sessions/route.ts) ALREADY imports `requireServiceClient`
  and has `const supabase = requireServiceClient()` in scope. BUT its select is
  `.select('id, phone_number, draft_project_id')` — it does NOT currently select `company_id`.
  The select MUST be extended to include `company_id` to log. `session.phone_number` is the recipient.
- Inngest onFailure already does `const payload = (event as {...}).data?.event?.data` and uses
  `payload?.ownerPhone`. `payload?.companyId` is available the same way (WhatsAppProcessPayload has it).
</discovery_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Log the 3 in-scope outbound sites (welcome, free-tier rejection, cron expiry)</name>
  <files>lib/whatsapp/send-welcome.ts, lib/whatsapp/handler.ts, app/api/cron/cleanup-whatsapp-sessions/route.ts</files>
  <action>
Add a best-effort `logOutboundMessage(...).catch(() => undefined)` after each successful send at three sites. Mirror the exact intent-router.ts style (msgType 'text', status 'sent', contactPhone = the recipient that was sent to, companyId = company in scope). Logging must NEVER throw or block the send.

**Site A — lib/whatsapp/send-welcome.ts (`welcomeOnFirstContact`, ~line 57-71):**
- Add import: `import { logOutboundMessage } from '@/lib/whatsapp/conversations'`.
- Inside the `try` block, AFTER `await sendWhatsAppWelcome(toPhone)` succeeds and BEFORE `return true`, add:
  ```typescript
  logOutboundMessage(serviceClient, {
    companyId,
    contactPhone: toPhone,
    body: WELCOME_TEXT,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
  ```
  `WELCOME_TEXT` is already a module-level const in this file — reference it directly. Do NOT log inside the bare `sendWhatsAppWelcome` helper (it has no companyId).

**Site B — lib/whatsapp/handler.ts free-tier branch (~line 344, `if (!entitlements.whatsappEnabled) { ... }`):**
- Add `logOutboundMessage` to the existing `@/lib/whatsapp/conversations` import if present, otherwise add a new import line `import { logOutboundMessage } from '@/lib/whatsapp/conversations'` (handler.ts does NOT currently import it).
- Capture the rejection body in a const so the same string is sent and logged:
  ```typescript
  if (!entitlements.whatsappEnabled) {
    const body = 'WhatsApp channel is not available on your current plan. Upgrade at /settings/billing'
    await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
    logOutboundMessage(supabase, {
      companyId,
      contactPhone: ownerPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
    return
  }
  ```
  `supabase` here is the service client passed into `processInboundMessages`; `companyId` and `ownerPhone` are in scope.

**Site C — app/api/cron/cleanup-whatsapp-sessions/route.ts (~line 34, inside the `sessions.map` loop):**
- Add import: `import { logOutboundMessage } from '@/lib/whatsapp/conversations'`.
- Extend the session select to include `company_id`: change `.select('id, phone_number, draft_project_id')` to `.select('id, phone_number, draft_project_id, company_id')`.
- Capture the reminder body in a const, send it, then log best-effort. The existing send is wrapped in a `try { ... } catch { }` that is non-fatal — keep that. Add the log AFTER the successful send (inside the same try, after the await), using `supabase` (already `requireServiceClient()` in scope):
  ```typescript
  const body = '⏰ Your estimate confirmation window has expired.\n\nSend a new audio, text, or photo to create a fresh estimate.'
  try {
    await sendWhatsAppMessage(session.phone_number as string, { type: 'text', text: { body } })
    logOutboundMessage(supabase, {
      companyId: session.company_id as string,
      contactPhone: session.phone_number as string,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
  } catch {
    // Non-fatal — still delete the session
  }
  ```
  Keep the subsequent `await supabase.from('whatsapp_sessions').delete()...` exactly as-is.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>All three sites compile under TS strict; each calls logOutboundMessage best-effort (`.catch(() => undefined)`) after its successful send with msgType 'text', status 'sent', the correct recipient phone, and the correct companyId; the cron select now includes company_id; no existing send behavior changed.</done>
</task>

<task type="auto">
  <name>Task 2: Thread svc+companyId into handleWhatsAppError and the Inngest fallback reply</name>
  <files>lib/errors/whatsapp.ts, lib/inngest/functions/whatsapp-process.ts</files>
  <action>
Two signature-threading sites. Both must remain best-effort and never crash their caller.

**Site D — lib/errors/whatsapp.ts (`handleWhatsAppError`, ~line 56):**
- Add imports: `import type { SupabaseClient } from '@supabase/supabase-js'` and `import { logOutboundMessage } from '@/lib/whatsapp/conversations'`.
- Change the signature to be backward-compatible:
  ```typescript
  export async function handleWhatsAppError(
    err: unknown,
    toPhone: string,
    opts?: { svc?: SupabaseClient; companyId?: string },
  ): Promise<void> {
  ```
- After the successful `await sendWhatsAppMessage(toPhone, { type: 'text', text: { body } })` inside the existing `try`, log ONLY when both are provided:
  ```typescript
  if (opts?.svc && opts.companyId) {
    logOutboundMessage(opts.svc, {
      companyId: opts.companyId,
      contactPhone: toPhone,
      body,
      msgType: 'text',
      status: 'sent',
    }).catch(() => undefined)
  }
  ```
  `body` is already computed earlier in the function — reuse it. Keep the existing `catch (sendErr)` swallow. Existing 2-arg callers (the unit tests in tests/unit/errors/whatsapp-adapter.test.ts) must still compile unchanged because `opts` is optional.
- THEN grep the codebase for ALL callers of `handleWhatsAppError` and pass `{ svc, companyId }` where both are available at the call site. NOTE (pre-verified during planning): there are currently ZERO production callers — only the definition, the unit tests, and `.planning/` docs reference it. So this is expected to be a no-op for production code. Still run the grep to confirm nothing was missed, and if a real production caller exists with svc+companyId in scope, thread them through. Do NOT modify the unit tests (they intentionally call the 2-arg form). Do NOT break any caller.

**Site E — lib/inngest/functions/whatsapp-process.ts (`sendFallbackReply`, ~line 27, called from onFailure ~line 48):**
- Add imports: `import { logOutboundMessage } from '@/lib/whatsapp/conversations'` and `import { requireServiceClient } from '@/lib/supabase/service'`.
- Change `sendFallbackReply` to also accept companyId and log after a successful send:
  ```typescript
  async function sendFallbackReply(ownerPhone: string, companyId?: string): Promise<void> {
    await sendWhatsAppMessage(ownerPhone, {
      type: 'text',
      text: { body: FALLBACK_ERROR_REPLY },
    }).catch((sendErr) => {
      console.error('[WhatsApp] fallback error reply failed:', sendErr)
    })
    if (companyId) {
      logOutboundMessage(requireServiceClient(), {
        companyId,
        contactPhone: ownerPhone,
        body: FALLBACK_ERROR_REPLY,
        msgType: 'text',
        status: 'sent',
      }).catch(() => undefined)
    }
  }
  ```
- In the `onFailure` handler (~line 45-49), companyId is on the same payload already used for ownerPhone (`WhatsAppProcessPayload` has `companyId`). Update the call:
  ```typescript
  if (payload?.ownerPhone) await sendFallbackReply(payload.ownerPhone, payload.companyId)
  ```
  If `payload.companyId` is somehow absent at runtime, `sendFallbackReply` still sends (just unlogged) and never crashes onFailure — preserved by the `if (companyId)` guard and the existing `.catch` on the send.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>handleWhatsAppError has a backward-compatible optional `opts?: { svc?; companyId? }` param and logs only when both are present; existing 2-arg unit tests still compile; grep confirmed no production callers needed updating (documented). sendFallbackReply accepts companyId and logs the fallback via requireServiceClient() best-effort; onFailure passes payload.companyId; onFailure never crashes when companyId is absent.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (TypeScript strict, whole project).
- Run the existing WhatsApp unit tests to confirm no regression: `npx vitest run tests/unit/errors/whatsapp-adapter.test.ts` (the 2-arg `handleWhatsAppError` calls must still pass — the new `opts` param is optional and unused by these tests).
- Manual reasoning check (no automated UI test): every one of the 5 sites now calls `logOutboundMessage` best-effort after a successful send, so each outbound bot reply lands in `whatsapp_messages` with direction='outbound' and appears in the admin thread.
</verification>

<success_criteria>
- All 5 outbound send sites (welcome, free-tier rejection, cron expiry, handleWhatsAppError, Inngest fallback) call `logOutboundMessage` best-effort (`.catch(() => undefined)` or guarded) with msgType 'text', status 'sent', correct recipient phone, and correct companyId.
- A service-role client is used for every log (welcome/free-tier reuse the in-scope service client; cron and fallback use `requireServiceClient()`).
- No existing send is blocked, reordered destructively, or made to throw.
- `handleWhatsAppError`'s new parameter is optional and backward-compatible (no caller breaks; unit tests untouched).
- `npx tsc --noEmit` is clean.
- EXPLICITLY OUT OF SCOPE / NOT TOUCHED: `app/api/webhooks/whatsapp/route.ts:191` ("couldn't find an Xtimator account" reply) — at that point company_id is unresolved (unknown sender), so there is no conversation to attach the message to. Left unlogged by design. This is documented as an intentional exclusion in the SUMMARY.
</success_criteria>

<output>
After completion, create `.planning/quick/260609-mrx-logar-todas-as-respostas-outbound-do-age/260609-mrx-SUMMARY.md`.

The SUMMARY MUST note:
1. The 5 sites changed and the helper used.
2. The cron select was extended to include `company_id`.
3. handleWhatsAppError gained a backward-compatible optional `opts` param; grep confirmed ZERO production callers currently exist (only def + unit tests + planning docs), so no call-site threading was needed — documented for future callers.
4. The intentional exclusion: `app/api/webhooks/whatsapp/route.ts:191` unknown-sender "no account" reply stays unlogged because company_id is unresolved (no conversation to attach to).
</output>
