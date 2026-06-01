---
phase: quick-260601-law
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/whatsapp/confirm.ts
  - lib/inngest/functions/whatsapp-process.ts
  - lib/whatsapp/handler.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Bot outbound messages in confirm.ts (cancel, editField, setClient, regenerate, resendSummary, help) are persisted to whatsapp_messages with direction=outbound"
    - "Bot outbound messages in whatsapp-process.ts (send-audio-error, ask-details, confirm-and-session) are persisted before the Inngest step returns"
    - "The rejection reply in handler.ts processSingleMessageWithSession is persisted to whatsapp_messages"
    - "WhatsApp inbox panel displays all bot replies for a conversation"
  artifacts:
    - path: "lib/whatsapp/confirm.ts"
      provides: "logOutboundMessage calls after every sendWhatsAppMessage to ownerPhone"
    - path: "lib/inngest/functions/whatsapp-process.ts"
      provides: "awaited logOutboundMessage in all 3 Inngest step.run blocks"
    - path: "lib/whatsapp/handler.ts"
      provides: "fire-and-forget logOutboundMessage after non-text rejection reply"
  key_links:
    - from: "lib/whatsapp/confirm.ts"
      to: "lib/whatsapp/conversations.ts"
      via: "logOutboundMessage import"
      pattern: "logOutboundMessage"
    - from: "lib/inngest/functions/whatsapp-process.ts"
      to: "whatsapp_messages table"
      via: "await logOutboundMessage(...).catch(() => undefined)"
      pattern: "await logOutboundMessage"
    - from: "lib/whatsapp/handler.ts"
      to: "whatsapp_messages table"
      via: "fire-and-forget logOutboundMessage"
      pattern: "logOutboundMessage"
---

<objective>
Log all outbound bot replies so they appear in the WhatsApp inbox panel.

Purpose: The inbox panel only shows inbound messages because confirm.ts, whatsapp-process.ts, and handler.ts call sendWhatsAppMessage without ever calling logOutboundMessage. This makes the conversation thread incomplete for the business owner.

Output: Three modified files. Every bot reply to the owner phone is persisted to whatsapp_messages (direction='outbound') so the inbox panel can render a complete thread.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/whatsapp/conversations.ts
@lib/whatsapp/confirm.ts
@lib/inngest/functions/whatsapp-process.ts
@lib/whatsapp/handler.ts
</context>

<interfaces>
<!-- logOutboundMessage signature from lib/whatsapp/conversations.ts -->
```typescript
export async function logOutboundMessage(
  svc: SupabaseClient,
  params: {
    companyId: string
    contactPhone: string
    contactName?: string | null
    clientId?: string | null
    body?: string | null
    msgType?: WaMsgType          // 'text' | 'image' | 'audio' | 'document' | ...
    waMessageId?: string | null
    mediaUrl?: string | null
    status?: WaMessageStatus     // 'sent' | 'delivered' | 'read' | 'failed'
    errorMessage?: string | null
  },
): Promise<string>
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add logOutboundMessage to confirm.ts after every sendWhatsAppMessage call</name>
  <files>lib/whatsapp/confirm.ts</files>
  <action>
Import logOutboundMessage at the top of the file alongside the existing imports:

```ts
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
```

Add `companyId: string` parameter to the four helpers that are missing it — `handleCancel`, `handleEditField`, `handleRegenerate`, and `resendSummary` — and thread `companyId` down from `processConfirmationReply` which already has it.

Current signatures to change:
- `handleCancel(session, ownerPhone, supabase)` → `handleCancel(session, companyId, ownerPhone, supabase)`
- `handleEditField(session, ownerPhone, supabase, patch)` → `handleEditField(session, companyId, ownerPhone, supabase, patch)`
- `handleRegenerate(session, companyId, ownerPhone, supabase)` — already has companyId, no change
- `resendSummary(estimateId, ownerPhone, supabase, prefix)` → `resendSummary(estimateId, companyId, ownerPhone, supabase, prefix)`
- `handleSetClient` already has companyId, no change

Update all call sites inside `processConfirmationReply` accordingly:
- `handleCancel(session, ownerPhone, supabase)` → `handleCancel(session, companyId, ownerPhone, supabase)`
- `handleEditField(session, ownerPhone, supabase, ...)` → `handleEditField(session, companyId, ownerPhone, supabase, ...)`
- (handleRegenerate and handleSetClient already pass companyId)

After every `sendWhatsAppMessage(ownerPhone, ...)` call in the file, add a fire-and-forget log. Use the body string that was sent. Pattern:

```ts
logOutboundMessage(supabase, {
  companyId,
  contactPhone: ownerPhone,
  body: <exact body string sent>,
  msgType: 'text',
  status: 'sent',
}).catch(() => undefined)
```

Locations requiring this addition (one per sendWhatsAppMessage call to ownerPhone):

1. `handleEditField` — "No estimate to edit..." message
2. `handleEditField` — "Could not apply that edit..." message
3. `resendSummary` — the `body` variable passed to sendWhatsAppMessage (resendSummary already builds `body` via `buildConfirmationMessage`)
4. `handleSetClient` — "No project to attach..." message
5. `handleSetClient` — "Could not save that client..." message
6. `handleSetClient` — "Could not link client..." message
7. `handleSetClient` — the "Client set to *name*..." success message
8. `handleRegenerate` — "No project to regenerate..." message
9. `handleRegenerate` — "Regeneration failed..." message
10. `handleCancel` — the "Estimate discarded..." message
11. `handleSend` — "Could not find your estimate..." (two occurrences)
12. `handleSend` — the final `ownerMessage` (Estimate sent! / Estimate ready!)
13. `processConfirmationReply` help branch — `EDIT_HELP_MESSAGE`

For `resendSummary`, capture the body into a variable first so it can be logged:

```ts
const body = buildConfirmationMessage(estimate, prefix)
await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
logOutboundMessage(supabase, {
  companyId,
  contactPhone: ownerPhone,
  body,
  msgType: 'text',
  status: 'sent',
}).catch(() => undefined)
```

For `handleSend`, the `ownerMessage` variable is already declared before the sendWhatsAppMessage call — log it after.

All logs are fire-and-forget (.catch(() => undefined)) — never block the reply path.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>tsc reports no errors in confirm.ts; logOutboundMessage is called after every sendWhatsAppMessage(ownerPhone, ...) in the file.</done>
</task>

<task type="auto">
  <name>Task 2: Await logOutboundMessage in whatsapp-process.ts + add logOutboundMessage to handler.ts</name>
  <files>
    lib/inngest/functions/whatsapp-process.ts
    lib/whatsapp/handler.ts
  </files>
  <action>
**whatsapp-process.ts** — 3 places where logOutboundMessage is called fire-and-forget (unawaited). In an Inngest step.run context, the step function returns before an unawaited promise completes, so the DB write is silently dropped. Change all three to `await`:

1. `send-audio-error` step — change:
   ```ts
   logOutboundMessage(requireServiceClient(), { ... }).catch(() => undefined)
   ```
   to:
   ```ts
   await logOutboundMessage(requireServiceClient(), { ... }).catch(() => undefined)
   ```

2. `ask-details` step — same pattern, same fix.

3. `confirm-and-session` step — same pattern, same fix.

No other changes to whatsapp-process.ts are needed; the import already exists at the top of the file.

---

**handler.ts** — `processSingleMessageWithSession` (around line 177) has an else branch that sends a rejection message when the inbound message is not text. That call to `sendWhatsAppMessage` has no corresponding log. Add one:

```ts
} else {
  const body = 'Reply *send* to deliver your estimate or *cancel* to discard it.'
  await sendWhatsAppMessage(ownerPhone, {
    type: 'text',
    text: { body },
  })
  logOutboundMessage(supabase, {
    companyId,
    contactPhone: ownerPhone,
    body,
    msgType: 'text',
    status: 'sent',
  }).catch(() => undefined)
}
```

Import `logOutboundMessage` at the top of handler.ts (it is not currently imported there):

```ts
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
```

The `supabase` client is already available as a parameter to `processSingleMessageWithSession`. Fire-and-forget is correct here because this runs inside the webhook hot path (same pattern as the logOutboundMessage calls in whatsapp-process.ts non-step context).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>tsc reports no errors; all three logOutboundMessage calls in whatsapp-process.ts are awaited; handler.ts logs the non-text rejection reply.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Inngest step → DB | logOutboundMessage writes to whatsapp_messages via service role inside step.run |
| Webhook hot path → DB | fire-and-forget log in handler.ts — never blocks ack |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-law-01 | Information Disclosure | logOutboundMessage body field | accept | Bot reply bodies are non-sensitive operational messages; service role client already used |
| T-law-02 | Denial of Service | logOutboundMessage on every send | accept | .catch(() => undefined) on all calls; DB failure never blocks the reply path |
</threat_model>

<verification>
After execution:
1. `npx tsc --noEmit` passes with zero errors across all three files
2. In Supabase, after a WhatsApp flow (send / cancel / edit / help / regenerate), `SELECT direction, body FROM whatsapp_messages WHERE direction='outbound' ORDER BY created_at DESC LIMIT 10` returns rows matching the bot replies
3. WhatsApp inbox panel for the conversation shows bot replies interleaved with owner messages
</verification>

<success_criteria>
- All bot replies to ownerPhone in confirm.ts have a corresponding fire-and-forget `logOutboundMessage` call immediately after `sendWhatsAppMessage`
- All three `logOutboundMessage` calls in whatsapp-process.ts are `await`ed so the DB write completes before the Inngest step returns
- handler.ts non-text rejection reply is logged fire-and-forget
- `npx tsc --noEmit` exits 0
- Commit message: `fix(whatsapp-inbox): log all outbound bot replies so they appear in the inbox panel`
</success_criteria>

<output>
After completion, create `.planning/quick/260601-law-log-all-outbound-bot-replies-in-confirm-/260601-law-SUMMARY.md`
</output>
