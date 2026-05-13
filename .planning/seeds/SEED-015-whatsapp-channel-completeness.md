---
id: SEED-015
status: cancelled
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone audit of SEED-008 vs delivered MVP)
partial_harvest: 2026-05-11
partial_harvest_in:
  - v2.1 Phase 50 (OTP Verification — Gap 2)
  - v2.1 Phase 51 (Pre-Send Edit Commands — Gap 1, MVP subset)
  - v2.2 Phase 53 (PDF Attachment Delivery — Gap 3)
  - v2.2 Phase 54 (WhatsApp Status Flow — Gap 5)
cancelled: 2026-05-13
cancellation_reason: Gap 4 (Twilio provider abstraction) deferred indefinitely — no active pain point with Meta. All other gaps harvested.
remaining_gaps: Gap 4 (Twilio provider abstraction) — cancelled
trigger_when: n/a — cancelled
scope: Medium
---

# SEED-015: WhatsApp Channel Completeness

## Why This Matters

v2.0 (Phases 40-45) delivered a functional MVP of the WhatsApp channel, but **left out several elements that the original SEED-008 proposed**. The result is a usable system with serious limitations for production use:

1. **No pre-send edit** — the owner can't fix the estimate before the client receives it. If they spot a mistake, they have to cancel and redo all the input (re-recording audios, retaking photos). Brutally broken UX.
2. **No OTP verification** — anyone with `phoneNumberId` + `wabaId` (public in Meta Business Suite) can claim a number in Xtimator. Without proof of ownership, this is a vulnerability.
3. **No PDF attachment** — clients who prefer formal documents (especially high-ticket segments: construction, commercial HVAC) only get text or links.
4. **No provider abstraction** — if the Meta account gets suspended or Meta changes terms, there's no fallback to Twilio. Risky lock-in.
5. **Status jumps straight to 'active'** — the `pending → verified → active → suspended` flow was a schema promise but never used. Status is cosmetic.

This seed **does not duplicate SEED-008** — it completes what was left out. The gaps below are independent of each other and can be tackled in priority order.

## The Gaps in Detail

### Gap 1: Pre-Send Edit Commands (HIGH PRIORITY)

**Current state:** `lib/whatsapp/confirm.ts:49-54` only accepts `send` / `cancel`.

**Promising state:** parser recognizes structured commands:

```
edit total 450
edit section 1 "Living Room Deep Clean"
edit item 2.3 price 85
edit timeline "Job completes in 2 days"
edit payment "50% upfront, 50% on completion"
client "Maria Silva" 5551234567
add item kitchen "Stove cleaning" 60
remove item 1.2
regenerate         ← rebuild estimate from scratch with same input
```

Each command triggers a mutation in Supabase (estimate/sections/items/project tables) and re-sends the updated summary. The session **stays in `awaiting_confirm`** — it doesn't change state.

For ambiguous or invalid commands, a lightweight agent (Claude Haiku) interprets:
```
"increase the bedroom prices by 10%"
"remove the kitchen"
"the client is João, phone 555..."
```

This approach respects Xtimator's LLM-first pattern (estimate gen already uses Claude), but keeps direct commands as shortcuts without AI dependency.

### Gap 2: OTP Verification During Setup (HIGH PRIORITY)

**Current state:** `lib/actions/whatsapp-settings.ts → connectWhatsApp()` upserts directly with status='active'. Zero proof that the user controls that number.

**Promising state:** two-step flow:

```
[1] User submits phoneNumber + phoneNumberId + wabaId
   → status='pending'
   → generates 6-digit code
   → sends code via WhatsApp to phoneNumber
   → returns success to UI

[2] User enters code received on phone
   → server validates code (10min TTL, max 3 attempts)
   → if OK: status='verified' → 'active'
   → revalidate cache
```

Schema:
```sql
ALTER TABLE company_whatsapp
  ADD COLUMN verification_code TEXT,
  ADD COLUMN verification_attempts INT DEFAULT 0,
  ADD COLUMN verification_expires_at TIMESTAMPTZ;
```

UI: two cards in `WhatsAppConnectCard`:
- Connection (current) → change button label to "Send verification code"
- Verification (new) → 6-digit input + "Verify"

### Gap 3: PDF Attachment Delivery (MEDIUM PRIORITY)

**Current state:** `lib/whatsapp/confirm.ts → handleSend` sends share link or formatted text. The `company_whatsapp.delivery_format` column is enum `share_link | formatted_text`.

**Promising state:** third option `pdf_attachment`:

```typescript
const PDF_DELIVERY_FORMATS = ['share_link', 'formatted_text', 'pdf_attachment'] as const
```

Pipeline:
1. Generate PDF reusing `app/api/estimates/[id]/pdf/route.ts`
2. Upload PDF to Supabase Storage (bucket `estimates-pdf`, 24h TTL)
3. Get signed URL
4. Meta API call with `type: "document"`:
```json
{
  "messaging_product": "whatsapp",
  "to": "{clientPhone}",
  "type": "document",
  "document": {
    "link": "{signedUrl}",
    "filename": "Estimate-MariaSilva-2026-05-10.pdf",
    "caption": "Your estimate from {companyName}"
  }
}
```

UI: add option to `delivery_format` select in `WhatsAppConnectCard`.

### Gap 4: Provider Abstraction (LOW PRIORITY)

**Current state:** `lib/whatsapp/client.ts` calls Meta Graph API hardcoded. Token comes from `platform_integrations`.

**Promising state:** `WhatsAppProvider` interface:

```typescript
interface WhatsAppProvider {
  send(to: string, content: MessageContent): Promise<MessageResult>
  sendDocument(to: string, document: DocumentContent): Promise<MessageResult>
  markAsRead(messageId: string): Promise<void>
  verifySignature(rawBody: string, signature: string): boolean
  parseInboundPayload(payload: unknown): InboundMessage[]
}

class MetaWhatsAppProvider implements WhatsAppProvider { /* current */ }
class TwilioWhatsAppProvider implements WhatsAppProvider { /* new */ }

// lib/whatsapp/index.ts
export function getProvider(companyId: string): WhatsAppProvider {
  const config = await getCompanyWhatsAppConfig(companyId)
  return config.provider === 'twilio' ? new TwilioWhatsAppProvider() : new MetaWhatsAppProvider()
}
```

Schema:
```sql
ALTER TABLE company_whatsapp ADD COLUMN provider TEXT NOT NULL DEFAULT 'meta';
```

The webhook handler needs to route by `provider` (Twilio and Meta have different payloads).

### Gap 5: Real Status Flow (LOW PRIORITY)

**Current state:** SQL accepts 4 values (`pending | verified | active | suspended`) but only `active` is used. Dead values:
- `pending` should be the initial state pre-OTP (Gap 2 resolves this)
- `verified` should be post-OTP, pre-admin activation
- `suspended` should be admin-controlled (abuse, payment failure)

After resolving Gap 2, the natural flow is:
```
pending  → user entered credentials, awaiting OTP
verified → OTP confirmed, ready to activate
active   → admin/billing approved (or auto-approves on paid plans)
suspended → admin paused for abuse or cancelled plan
```

The inbound webhook only processes messages from numbers with status='active'. Already the case — the change is in setup, not runtime.

## Suggested Sequence

```
v2.1 (UX Hotfix)
├── Gap 1: Edit commands ← biggest impact, connects with SEED-006 and SEED-010
└── Gap 2: OTP verification ← critical security, blocks escalation

v2.2 (Polish & Reliability)
├── Gap 3: PDF attachment ← specific demand from high-ticket segments
└── Gap 5: Real status flow ← depends on Gap 2

v3.x (Hedge against lock-in)
└── Gap 4: Provider abstraction ← only relevant if Meta becomes a problem
```

## Scope Estimate

**Medium** — 2-3 phases distributed across milestones:

- **Gap 1 (Edit)** — 1 phase, 2-3 days. Parser + mutations + summary re-send. Optional: Claude Haiku agent for ambiguous commands.
- **Gap 2 (OTP)** — 1 phase, 1-2 days. Schema migration + send-code action + verify-code action + updated UI.
- **Gap 3 (PDF)** — 0.5 phase, 1 day. Reuses existing PDF pipeline, adds signed URL + Meta API call.
- **Gap 4 (Provider)** — 1 phase, 2-3 days. Refactor + TwilioAdapter implementation.
- **Gap 5 (Status flow)** — 0.5 phase, 0.5 day. Wiring after Gap 2.

## Breadcrumbs

**Gap 1 (Edit):**
- `lib/whatsapp/confirm.ts:49-54` — `parseCommand()` needs to become a structured parser
- `lib/whatsapp/confirm.ts:23-44` — `processConfirmationReply()` dispatcher; add branches for edit/add/remove/regenerate/client
- `lib/queries/estimate.ts` — existing mutations can be reused
- `app/api/estimates/[id]/refine/` — reference for refinement pipeline (web-side); pattern to port to WhatsApp

**Gap 2 (OTP):**
- `lib/actions/whatsapp-settings.ts:connectWhatsApp` — split into `requestVerification()` + `confirmVerification()`
- `components/settings/whatsapp-connect-card.tsx:76+` — add second UI step
- `lib/whatsapp/client.ts:sendWhatsAppMessage` — existing function works for sending the code
- `supabase/migrations/` — new migration for verification columns

**Gap 3 (PDF):**
- `app/api/estimates/[id]/pdf/route.ts` — existing PDF endpoint; call internally
- `lib/whatsapp/confirm.ts:handleSend` — `if (deliveryFormat === 'pdf_attachment')` branch
- Supabase Storage bucket `estimates-pdf` — provision with 24h TTL or use signed URL

**Gap 4 (Provider):**
- `lib/whatsapp/client.ts` — refactor entirely as `MetaWhatsAppProvider`
- `lib/whatsapp/verify.ts` — `verifyWebhookSignature()` becomes interface method
- `app/api/webhooks/whatsapp/route.ts` — provider routing before parsing
- Twilio docs: https://www.twilio.com/docs/whatsapp/api

**Gap 5 (Status flow):**
- `lib/whatsapp/handler.ts:33-39` — query filters `status='active'`; already correct, just needs the real flow upstream
- `app/admin/integrations/` — admin UI to force status=suspended (abuse)

## Notes

- **Connection with SEED-010 (debounce buffer):** edit commands and debounce buffer are adjacent features. Implementing them together makes sense — the user sends 5 messages (debounce aggregates), receives summary, then can edit before sending.
- **Connection with SEED-013 (entitlements):** PDF attachment could be a paid-tier feature (Business only). Provider choice (Twilio) could also be premium.
- **Connection with SEED-014 (errors):** invalid edit commands are perfect candidates for `XtimatorError('bad_request', 'whatsapp', ...)` with contextual user message.
- **Why split SEED-008 into SEED-015?** SEED-008 was officially harvested — its history should be preserved as the v2.0 "vision document". Reopening the status would be historical revisionism. SEED-015 is the natural continuation, explicitly marking what was left out.
- **Deliberate decision vs oversight?** The gaps above were probably conscious scope cuts during v2.0 planning (deliver MVP in 6 phases). This seed just makes explicit what was in implicit backlog.
