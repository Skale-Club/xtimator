---
phase: quick-260601-lbg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/whatsapp/buffer.ts
  - lib/whatsapp/handler.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Debounce window is 15 seconds (not 5)"
    - "When an owner sends 3 rapid awaiting_details messages, only ONE Inngest job fires for the last message"
    - "The Inngest job dispatched from awaiting_details carries the correct existing draft_project_id"
  artifacts:
    - path: "lib/whatsapp/buffer.ts"
      provides: "DEBOUNCE_WAIT_MS = 15_000"
    - path: "lib/whatsapp/handler.ts"
      provides: "awaiting_details path uses debounce buffer + post-claim session re-query"
  key_links:
    - from: "handler.ts awaiting_details branch"
      to: "buffer.ts pushToBuffer + tryClaimBuffer"
      via: "same Redis debounce path as the no-session flow"
      pattern: "pushToBuffer.*fromPhone.*message"
    - from: "tryClaimBuffer winner"
      to: "whatsapp_sessions"
      via: "session re-query to recover draft_project_id"
      pattern: "select.*draft_project_id.*awaiting_details"
---

<objective>
Increase the WhatsApp debounce window from 5 s to 15 s, and apply the debounce buffer to
the `awaiting_details` path so rapid follow-up messages collapse into a single Inngest job.

Purpose: Job-site usage has natural gaps of 10-30 s between audio / photos / text. A 5 s
window is too narrow and causes missed batches. The `awaiting_details` path has no buffer at
all, firing 3 parallel Inngest estimate-regeneration jobs when the owner sends 3 messages
in quick succession.

Output: Two modified files. No schema changes, no new dependencies.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/whatsapp/buffer.ts
@lib/whatsapp/handler.ts
</context>

<interfaces>
<!-- Key contracts the executor needs. Extracted from buffer.ts. -->

```typescript
// lib/whatsapp/buffer.ts
export const DEBOUNCE_WAIT_MS = 5_000   // ← change to 15_000
export const BUFFER_TTL_SECONDS = 120

export interface BufferedMessage {
  id: string
  receivedAt: number
  message: WhatsAppMessage
}

export async function pushToBuffer(phoneNumber: string, message: WhatsAppMessage): Promise<boolean>
export async function tryClaimBuffer(phoneNumber: string, messageId: string): Promise<BufferedMessage[] | null>
export async function clearBuffer(phoneNumber: string): Promise<void>
export function debounceWait(ms?: number): Promise<void>
```

<!-- Key contracts from handler.ts awaiting_details path (lines 72-83 and 149-160). -->

```typescript
// Both processInboundWithDebounce and processInboundMessage have this branch:
if (existingSession?.state === 'awaiting_details') {
  await sendTypingIndicator(message.id).catch(() => undefined)
  return dispatchToExistingProject(
    [message],
    existingSession as { draft_project_id: string | null },
    companyId,
    ownerPhone,
  )
}

// dispatchToExistingProject signature:
async function dispatchToExistingProject(
  messages: WhatsAppMessage[],
  session: { draft_project_id: string | null },
  companyId: string,
  ownerPhone: string,
): Promise<void>
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Increase DEBOUNCE_WAIT_MS to 15 seconds</name>
  <files>lib/whatsapp/buffer.ts</files>
  <action>
    Change line 25 of `lib/whatsapp/buffer.ts`:

    ```typescript
    // Before
    export const DEBOUNCE_WAIT_MS = 5_000

    // After
    export const DEBOUNCE_WAIT_MS = 15_000
    ```

    Update the comment on lines 6-8 from "~5 seconds of silence" to "~15 seconds of silence".
    No other changes to buffer.ts.
  </action>
  <verify>
    grep -n "DEBOUNCE_WAIT_MS" lib/whatsapp/buffer.ts
    # Must output: export const DEBOUNCE_WAIT_MS = 15_000
  </verify>
  <done>DEBOUNCE_WAIT_MS is 15_000 in buffer.ts. Comment reflects 15 seconds.</done>
</task>

<task type="auto">
  <name>Task 2: Apply debounce buffer to awaiting_details path in handler.ts</name>
  <files>lib/whatsapp/handler.ts</files>
  <action>
    The `awaiting_details` branch exists in TWO functions: `processInboundWithDebounce`
    (lines ~72-83) and `processInboundMessage` (lines ~149-160). Both need the same fix.
    Apply option (c) from the planning context: push to buffer, wait, claim, then re-query
    the session to recover `draft_project_id`.

    **Replace BOTH awaiting_details blocks** with the following pattern:

    ```typescript
    if (existingSession?.state === 'awaiting_details') {
      await sendTypingIndicator(message.id).catch(() => undefined)

      // Buffer rapid follow-up messages to avoid multiple parallel Inngest jobs
      // for the same project. Uses the same rolling debounce as the no-session path.
      const pushed = await pushToBuffer(fromPhone, message)
      if (!pushed) {
        // Redis unavailable — fall back to immediate dispatch
        return dispatchToExistingProject(
          [message],
          existingSession as { draft_project_id: string | null },
          companyId,
          ownerPhone,
        )
      }

      await debounceWait()
      await sendTypingIndicator(message.id).catch(() => undefined)

      const batch = await tryClaimBuffer(fromPhone, message.id)
      if (!batch) return // A newer message is handling this batch

      // Re-query the session to get the current draft_project_id.
      // The session is still active (30-min TTL); this is safe.
      const { data: refreshedSession } = await supabase
        .from('whatsapp_sessions')
        .select('draft_project_id')
        .eq('company_id', companyId)
        .eq('phone_number', ownerPhone)
        .eq('state', 'awaiting_details')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!refreshedSession?.draft_project_id) return // Session expired or no project

      return dispatchToExistingProject(
        batch.map((b) => b.message),
        { draft_project_id: refreshedSession.draft_project_id },
        companyId,
        ownerPhone,
      )
    }
    ```

    IMPORTANT: The `processInboundMessage` function does not receive `supabase` as a
    parameter in the `awaiting_details` branch today — but it does have `supabase` as a
    parameter at the function level (line ~116). Pass it through to the refreshed session
    query. The `supabase` client is available in scope in both functions.

    Also import `debounceWait` at the top of handler.ts if it is not already imported.
    Check the current import on line 29:
    ```typescript
    import {
      pushToBuffer,
      tryClaimBuffer,
      debounceWait,
    } from '@/lib/whatsapp/buffer'
    ```
    `debounceWait` is already imported — no import change needed.
  </action>
  <verify>
    npx tsc --noEmit 2>&1 | head -30
    # Must produce no errors in lib/whatsapp/handler.ts or lib/whatsapp/buffer.ts
  </verify>
  <done>
    Both awaiting_details branches in handler.ts use pushToBuffer + debounceWait +
    tryClaimBuffer + session re-query before calling dispatchToExistingProject.
    TypeScript compiles clean. Rapid follow-up messages in awaiting_details state now
    collapse to a single Inngest dispatch carrying the correct draft_project_id.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Meta webhook → handler.ts | Untrusted phone numbers; message IDs from Meta |
| handler.ts → Redis buffer | Redis key derived from fromPhone (E.164 sans +) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lbg-01 | Spoofing | buffer key `buffer:whatsapp:{fromPhone}` | accept | fromPhone is already validated by Meta webhook signature (Phase 40); buffer key collisions require controlling the phone number |
| T-lbg-02 | Denial of Service | 15s debounce extends window Redis key lives | accept | BUFFER_TTL_SECONDS=120 auto-expires orphaned keys; 15s window still short enough to not meaningfully extend DoS surface |
| T-lbg-03 | Information Disclosure | Session re-query after tryClaimBuffer | mitigate | Query scoped by `company_id + phone_number + state + expires_at`; service client not used (RLS deny-all on whatsapp_sessions — uses the service client passed in from the webhook route already) |
</threat_model>

<verification>
After execution, verify end-to-end:

1. `grep -n "DEBOUNCE_WAIT_MS" lib/whatsapp/buffer.ts` — shows `15_000`
2. `grep -n "awaiting_details" lib/whatsapp/handler.ts` — shows the two blocks each contain `pushToBuffer`
3. `npx tsc --noEmit` — exits 0
4. Functional test (manual, optional): send 3 rapid text messages while a session is in `awaiting_details` state; confirm only 1 Inngest event appears in the Inngest dev UI for that batch
</verification>

<success_criteria>
- `DEBOUNCE_WAIT_MS` is `15_000` in `lib/whatsapp/buffer.ts`
- Both `awaiting_details` branches in `handler.ts` (`processInboundWithDebounce` and `processInboundMessage`) use the debounce buffer path
- After the buffer is claimed, the session is re-queried to get the current `draft_project_id` before calling `dispatchToExistingProject`
- `npx tsc --noEmit` passes with no new errors
</success_criteria>

<output>
After completion, create `.planning/quick/260601-lbg-increase-whatsapp-debounce-window-from-5/260601-lbg-SUMMARY.md`
</output>
