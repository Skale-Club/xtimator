# Architecture: WhatsApp Estimate Channel (v2.0)

**Domain:** WhatsApp channel integration via Meta Cloud API
**Researched:** 2026-05-10
**Confidence:** HIGH (codebase direct inspection + Meta official docs verification)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  META CLOUD API                                                       │
│  Graph API (send messages, upload media, download media)              │
│  Webhook → POST /api/webhooks/whatsapp (HMAC-SHA256 verified)         │
└──────────────┬──────────────────────────────┬────────────────────────┘
               │ inbound                      │ outbound
               ▼                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  WEBHOOK HANDLER  app/api/webhooks/whatsapp/route.ts                  │
│                                                                       │
│  GET  → hub.mode/hub.verify_token/hub.challenge verification          │
│  POST → HMAC-SHA256 validate X-Hub-Signature-256 (raw body)           │
│         → extract from_number + message type                          │
│         → lookup company_whatsapp WHERE phone_number = from_number    │
│         → dispatch to WhatsAppMessageHandler                          │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MESSAGE HANDLER  lib/whatsapp/handler.ts                             │
│                                                                       │
│  Session lookup/create (whatsapp_sessions table)                      │
│  State machine:                                                       │
│    awaiting_input  → collect media → fire AI pipeline                 │
│    awaiting_confirm → parse "send"/"edit X"/"cancel"                  │
│    awaiting_edit   → apply edit → return to confirm                   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ calls existing routes programmatically
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
  Whisper API    Claude Vision    generate-estimate
  (existing      (existing        pipeline (existing
  /transcribe)   /analyze-photos) /generate-estimate)
          │              │              │
          └──────────────┴──────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  OUTBOUND DELIVERY  lib/whatsapp/sender.ts                            │
│                                                                       │
│  WhatsAppProvider interface (mirrors lib/ai/ pattern)                  │
│  MetaAdapter → Graph API /messages endpoint                           │
│    - sendTextMessage(to, text)                                        │
│    - sendDocumentMessage(to, pdfBuffer, filename)  [upload then send] │
│    - sendShareLink(to, estimateToken)                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Decision: Meta Cloud API Only (Not Twilio)

**Verdict:** Build Meta Cloud API directly. Do NOT build a Twilio adapter for v2.0.

**Rationale:**
- SEED-008 lists Meta Cloud API as the lower-cost, direct option. Twilio is listed as "better DX, sandbox" but adds a paid intermediary and a second vendor dependency.
- The existing `lib/ai/` abstraction proved the interface pattern works — a `WhatsAppProvider` interface can accommodate Twilio later if the market requires it.
- Meta Cloud API is free at the message-delivery layer (businesses pay Meta per conversation type at scale, but this is per-message at the BSP level — not a platform fee).
- For a US-first SaaS product where cost per estimate matters, removing the Twilio layer from the critical path is the right call.
- v2.0 ships Meta adapter. Interface is designed for extensibility (Twilio slot exists in the type system).

**Confidence:** MEDIUM — Based on product reasoning + Meta API documentation. Twilio sandbox is genuinely easier to start with for dev, but the interface pattern makes the dev path manageable without it.

---

## Decision: Session State → Supabase PostgreSQL (Not Redis)

**Verdict:** Use the `whatsapp_sessions` table in Supabase PostgreSQL. Do NOT add Redis/Vercel KV.

**Rationale:**
- Sessions expire in 30 minutes. A `pg_cron` cleanup job (same pattern as orphan project cleanup already shipped) handles expiry without Redis.
- At Xtimator's current scale (hundreds to low-thousands of users), Redis adds infra complexity with no throughput benefit. WhatsApp sessions are low-frequency per user (one at a time per company).
- A Supabase row query against `whatsapp_sessions WHERE company_id = ? AND expires_at > NOW()` with a proper index is sub-millisecond at this scale.
- Webhook responses must be HTTP 200 within Meta's timeout window (roughly 20 seconds). The DB approach is fast enough; the actual latency bottleneck is the AI pipeline (Whisper + Claude), not the session lookup.
- Redis can be added in v3 if multi-region deployment or sub-5ms session reads become requirements.

**Confidence:** HIGH — Aligned with existing codebase pattern (no Redis anywhere), codebase already has pg_cron + Vercel cron dual pattern for cleanup.

---

## New Database Tables

### `company_whatsapp`

```sql
-- Migration: supabase/migrations/20260510_phase40_whatsapp_channel.sql (or next date)
CREATE TABLE public.company_whatsapp (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number        TEXT NOT NULL UNIQUE,     -- E.164: +15551234567
  waba_id             TEXT,                     -- Meta WABA ID (nullable until verified)
  phone_number_id     TEXT,                     -- Meta Phone Number ID for sending
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'verified', 'active', 'suspended')),
  delivery_format     TEXT NOT NULL DEFAULT 'text_and_link'
                      CHECK (delivery_format IN ('text_only', 'text_and_link', 'pdf_and_link')),
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_whatsapp ENABLE ROW LEVEL SECURITY;

-- RLS: company owns its own row
CREATE POLICY "company_whatsapp_select" ON company_whatsapp FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_whatsapp_insert" ON company_whatsapp FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_whatsapp_update" ON company_whatsapp FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_whatsapp_delete" ON company_whatsapp FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- Webhook handler reads by phone_number using service role (bypasses RLS)
-- No additional policy needed — service role bypasses RLS by design
```

**Key fields:**
- `phone_number_id` — Meta's internal ID for the business phone number; required for all outbound Graph API calls (NOT the user-visible phone number string)
- `waba_id` — WhatsApp Business Account ID; needed for some admin API operations
- `delivery_format` — per-company outbound format preference; drives what the bot sends to the client

### `whatsapp_sessions`

```sql
CREATE TABLE public.whatsapp_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number      TEXT NOT NULL,              -- from_number of the owner's WhatsApp
  state             TEXT NOT NULL DEFAULT 'awaiting_input'
                    CHECK (state IN ('awaiting_input', 'awaiting_confirm', 'awaiting_edit')),
  draft_project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  draft_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  context           JSONB,                      -- ephemeral context blob (pending media IDs etc.)
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast webhook lookup (hot path)
CREATE INDEX whatsapp_sessions_company_expires
  ON whatsapp_sessions (company_id, expires_at DESC);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Sessions are written/read exclusively via service role in the webhook handler
-- No authenticated-user RLS policies needed — deny-all by omission
-- (same pattern as platform_integrations / platform_admins)
```

**Deny-all RLS on `whatsapp_sessions`:** The webhook handler uses `requireServiceClient()`. No user-facing component ever reads session state directly. This is the same "platform table" posture as `platform_integrations`.

### Migration File Naming

Follow existing convention:
```
supabase/migrations/20260510000002_phase40_whatsapp_channel.sql
```
(use the next available date suffix after the Phase 38/39 migrations)

---

## New API Routes

### `app/api/webhooks/whatsapp/route.ts`

Two handlers in one file — Meta requires both GET and POST on the same URL.

**GET handler — webhook registration verification:**

```typescript
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode      = params.get('hub.mode')
  const token     = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**POST handler — inbound message processing:**

```typescript
export async function POST(req: NextRequest) {
  // 1. Read raw body FIRST (HMAC needs exact bytes before JSON parse)
  const rawBody = await req.text()

  // 2. Verify X-Hub-Signature-256 with timing-safe comparison
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? ''
  const expected  = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 3. Parse and dispatch
  const body = JSON.parse(rawBody)
  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages ?? []
  for (const message of messages) {
    await handleInboundMessage(message)  // lib/whatsapp/handler.ts
  }

  // 4. Always return 200 immediately — Meta retries if not 200
  return NextResponse.json({ status: 'ok' })
}
```

**Critical:** Return HTTP 200 before the AI pipeline completes. This means `handleInboundMessage` should be fire-and-forget for long operations (audio/photo processing), OR the webhook must respond immediately and queue work. See "Long Processing" section below.

### `app/api/settings/whatsapp/route.ts`

Settings API for the connect/verify flow from `/settings/integrations`.

```
POST /api/settings/whatsapp/connect   — register phone number, trigger OTP
POST /api/settings/whatsapp/verify    — submit OTP, activate connection
DELETE /api/settings/whatsapp         — disconnect number
GET /api/settings/whatsapp/status     — current connection status
```

These are authenticated routes (use `createClient()` + `getClaims()` pattern). They write to `company_whatsapp` via service role after auth check.

---

## Webhook Route Registration in `proxy.ts`

The webhook URL must be public — Meta sends unauthenticated GET and POST requests to it. Add it to the middleware bypass list:

**Modified `proxy.ts`:**

```typescript
// In the isPublicRoute check (or equivalent early-return logic)
// BEFORE updateSession() call — same pattern as /estimate/* pass-through
if (pathname.startsWith('/api/webhooks/')) {
  return NextResponse.next()
}
```

The existing `matcher` in `proxy.ts` config already excludes `_next/static`, etc. The webhook path `/api/webhooks/whatsapp` will hit the middleware. It must not be redirected to login. The early return `NextResponse.next()` skips all auth logic for webhook paths.

---

## New Library Modules

### `lib/whatsapp/provider.interface.ts`

```typescript
export interface WhatsAppProvider {
  sendTextMessage(to: string, body: string): Promise<void>
  sendDocumentMessage(to: string, pdfBuffer: Buffer, filename: string): Promise<void>
  parseInboundMessage(raw: unknown): InboundWhatsAppMessage
  downloadMedia(mediaId: string): Promise<Buffer>
}

export type InboundWhatsAppMessage = {
  from: string                  // E.164 phone number of sender
  messageId: string
  type: 'text' | 'audio' | 'image' | 'unsupported'
  text?: string                 // type === 'text'
  mediaId?: string              // type === 'audio' | 'image'
  mimeType?: string
  timestamp: number
}
```

### `lib/whatsapp/providers/meta.ts`

Meta Cloud API adapter. Calls `graph.facebook.com/v21.0/{phone_number_id}/messages`.

Key operations:
1. **Send text:** POST `/messages` with `{ type: 'text', text: { body }, to, messaging_product: 'whatsapp' }`
2. **Send PDF:**
   - Upload: POST `/{phone_number_id}/media` with `multipart/form-data` — returns `{ id: mediaId }`
   - Send: POST `/messages` with `{ type: 'document', document: { id: mediaId, filename }, to, messaging_product: 'whatsapp' }`
3. **Download media:** GET `/{mediaId}` → returns URL → GET that URL with Authorization Bearer token → returns binary
4. **Phone number ID:** Sourced from `company_whatsapp.phone_number_id` (not the human-readable number)

The Meta access token (permanent system user token or page access token) is stored in `platform_integrations` under provider `'whatsapp_meta'`, using the existing AES-256-GCM encryption + `getIntegrationKey()` pattern. A new `platform_integrations` row is needed.

### `lib/whatsapp/index.ts`

```typescript
export async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
  // For v2.0, always return MetaAdapter
  // Same dynamic import pattern as lib/ai/index.ts
  const { MetaAdapter } = await import('./providers/meta')
  return new MetaAdapter()
}
```

### `lib/whatsapp/handler.ts`

The core state machine. Called by the webhook POST handler.

```typescript
export async function handleInboundMessage(
  raw: unknown,
  fromNumber: string
): Promise<void>
```

**State machine:**

```
LOOKUP: company_whatsapp WHERE phone_number = fromNumber
  → not found: silently return (no error, no response — security)

LOOKUP: whatsapp_sessions WHERE company_id = ? AND expires_at > NOW()
  → not found OR expired: CREATE new session (state = 'awaiting_input')

DISPATCH by session.state:

  'awaiting_input':
    audio  → downloadMedia() → buffer → Whisper transcription
           → save recording row (storage_path = null, transcript = text)
           → if session has no project yet: createProject() programmatically
           → trigger generate-estimate pipeline
           → on complete: update session.state = 'awaiting_confirm'
           → sendConfirmationMessage(to, estimateSummary)

    image  → downloadMedia() → buffer → upload to Supabase Storage
           → create photo row → run Claude Vision analysis
           → accumulate in session.context (up to 5 photos then auto-generate)
           → if text also received: combine with photos → generate

    text   → if looks like content (not a command):
               save as transcript → generate estimate
             else:
               sendHelpMessage()

  'awaiting_confirm':
    "send"   → trigger outbound delivery to client → session expires
    "edit X" → apply edit to estimate → state = 'awaiting_confirm' (re-send summary)
    "cancel" → delete draft project/estimate → session expires
    other    → sendHelpMessage() with valid commands

  'awaiting_edit':
    (future) — v2.0 treats edits inline in 'awaiting_confirm'
```

### `lib/whatsapp/session.ts`

CRUD helpers for `whatsapp_sessions`:

```typescript
getActiveSession(companyId: string, phoneNumber: string): Promise<WhatsAppSession | null>
createSession(companyId: string, phoneNumber: string): Promise<WhatsAppSession>
updateSession(sessionId: string, patch: Partial<WhatsAppSession>): Promise<void>
expireSession(sessionId: string): Promise<void>
```

Uses `requireServiceClient()` — no user auth context exists in webhook handler.

### `lib/whatsapp/formatter.ts`

Formats the confirmation message using existing `buildItemsBreakdown()` + `resolveTemplate()` from `lib/utils/estimate-template.ts`. Pure function, no DB calls.

```typescript
export function buildConfirmationMessage(estimate: EstimateWithSections, clientName: string | null): string
export function buildClientDeliveryText(estimate: EstimateWithSections, company: Company, shareToken: string | null): string
```

---

## Existing Code Reused (Unchanged)

| Existing Asset | Reused How |
|----------------|-----------|
| `app/api/generate-estimate/route.ts` | Called programmatically from `handler.ts` via internal fetch or direct function call |
| `app/api/analyze-photos/route.ts` | Called programmatically for image messages |
| `app/api/estimates/[id]/pdf/route.ts` | Called to generate PDF buffer for document delivery |
| `lib/utils/estimate-template.ts` — `buildItemsBreakdown()` | Formats line items for confirmation and delivery messages |
| `lib/utils/estimate-template.ts` — `resolveTemplate()` | Formats the client-facing plain text delivery |
| `lib/supabase/service.ts` — `requireServiceClient()` | All webhook handler DB calls use service role |
| `lib/platform-config.ts` — `getIntegrationKey()` | Fetch Meta access token from `platform_integrations` |
| `lib/crypto/aes.ts` | Encrypt/decrypt Meta access token at rest |
| `lib/actions/recording.ts` — `createTextTranscript()` | Save Whisper transcript from audio message |
| `lib/actions/photo.ts` | Save photo after downloading from Meta CDN |
| `supabase/migrations/*.sql` pattern | Follow for new migration file |
| `company_price_book` RLS policy pattern | Replicated for `company_whatsapp` |

**Important:** The `generate-estimate` route currently requires an authenticated user (`getClaims()` + company lookup by user_id). The webhook handler has no user session. Two options:

**Option A (recommended):** Extract the generation logic into a shared service function in `lib/services/generate-estimate.ts` that accepts `(companyId, projectId)` directly, bypassing auth. The API route becomes a thin auth wrapper calling this function. The webhook handler calls the same function with the service-client-resolved `companyId`.

**Option B:** The webhook handler calls `/api/generate-estimate` via internal fetch with a signed internal token (simpler initially but creates an internal HTTP call overhead on serverless).

**Recommendation:** Option A. The codebase already has the pattern of extracting logic into `lib/actions/` and `lib/queries/` — the generate-estimate route is long overdue for this extraction. This is a prerequisite phase.

---

## New Settings UI

### `/settings/integrations` (NEW route)

New sub-route following the price-book and estimate-templates pattern:

```
app/(app)/settings/integrations/
  page.tsx           — server component, loads company_whatsapp row
  loading.tsx        — skeleton
  whatsapp-connect-card.tsx  — client component (connect/verify flow)
```

The `/settings/page.tsx` gets a new Link card entry (below Custom Domain), same pattern as the existing Price Book and Estimate Templates cards.

### WhatsApp Connect Card States

```
State 1: Not connected
  [Connect WhatsApp] button
  → opens dialog with phone number input

State 2: Pending verification
  Phone number shown, "Awaiting verification"
  OTP input field + [Verify] button

State 3: Active
  Phone number shown, green status indicator
  [Disconnect] button (with AlertDialog confirmation)
  Delivery format selector (text + link / PDF + link / text only)
```

---

## Integration Points Summary

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `app/api/webhooks/whatsapp/route.ts` | NEW API route | Webhook registration GET + inbound message POST |
| `app/api/settings/whatsapp/route.ts` | NEW API route | Settings CRUD for phone registration |
| `lib/whatsapp/provider.interface.ts` | NEW | WhatsAppProvider interface |
| `lib/whatsapp/providers/meta.ts` | NEW | Meta Cloud API adapter |
| `lib/whatsapp/index.ts` | NEW | Factory function `getWhatsAppProvider()` |
| `lib/whatsapp/handler.ts` | NEW | Inbound message state machine |
| `lib/whatsapp/session.ts` | NEW | Session CRUD via service role |
| `lib/whatsapp/formatter.ts` | NEW | Message text formatting (wraps existing utilities) |
| `lib/services/generate-estimate.ts` | NEW | Extracted business logic from API route |
| `app/(app)/settings/integrations/page.tsx` | NEW | Integrations settings page |
| `app/(app)/settings/integrations/loading.tsx` | NEW | Skeleton |
| `components/settings/whatsapp-connect-card.tsx` | NEW | Connect/verify/status UI |
| Migration: `whatsapp_channel.sql` | NEW | `company_whatsapp` + `whatsapp_sessions` tables |

### Modified Components

| Component | What Changes |
|-----------|-------------|
| `proxy.ts` | Add `/api/webhooks/` early-return bypass before `updateSession()` |
| `app/(app)/settings/page.tsx` | Add Link card for `/settings/integrations` |
| `app/api/generate-estimate/route.ts` | Thin wrapper calling new `lib/services/generate-estimate.ts` |
| `lib/platform-config.ts` — `IntegrationProvider` type | Add `'whatsapp_meta'` to the union |
| `lib/schemas/admin.ts` (or equivalent) | Add `'whatsapp_meta'` to `integrationKeySchema` |
| Admin panel `/admin/integrations` | Add WhatsApp Meta token card (same pattern as Anthropic/Gemini) |

---

## Data Flow: Full Inbound Estimate Generation

```
Owner sends audio via WhatsApp
    ↓
Meta Cloud API → POST /api/webhooks/whatsapp
    ↓
HMAC-SHA256 verification (X-Hub-Signature-256)
    ↓
Extract: from="+15551234567", type="audio", mediaId="abc123"
    ↓
requireServiceClient()
SELECT * FROM company_whatsapp WHERE phone_number = '+15551234567'
  → finds company_id
    ↓
SELECT * FROM whatsapp_sessions WHERE company_id = ? AND expires_at > NOW()
  → no active session → CREATE session (state='awaiting_input', expires_at=NOW()+30min)
    ↓
[Return 200 to Meta immediately — fire-and-forget the pipeline below]
    ↓
downloadMedia(mediaId) → audio Buffer (ogg/opus or m4a)
    ↓
Whisper API → transcript text
    ↓
createProject(companyId, placeholderName) → projectId
    ↓
createTextTranscript(projectId, transcript) — saves recordings row (storage_path=null)
    ↓
generateEstimateForProject(companyId, projectId) — lib/services/generate-estimate.ts
    ↓
estimate persisted to DB (estimates + estimate_sections + estimate_items)
    ↓
buildConfirmationMessage(estimate, detectedClientName) — lib/whatsapp/formatter.ts
    ↓
getWhatsAppProvider().sendTextMessage(from, confirmationText)
    ↓
UPDATE whatsapp_sessions SET
  state = 'awaiting_confirm',
  draft_project_id = projectId,
  draft_estimate_id = estimateId,
  expires_at = NOW() + INTERVAL '30 minutes'
```

## Data Flow: Confirmation → Client Delivery

```
Owner replies "send" via WhatsApp
    ↓
Meta Cloud API → POST /api/webhooks/whatsapp
    ↓
HMAC verified → from="+15551234567", type="text", text="send"
    ↓
SELECT session WHERE company_id=? AND state='awaiting_confirm'
    ↓
Parse command: "send" detected
    ↓
Load estimate (draft_estimate_id) + company + client
    ↓
Load company delivery_format from company_whatsapp row
    ↓
if delivery_format includes 'text':
  buildClientDeliveryText() → send text to client phone number
if delivery_format includes 'link':
  share token already exists (or create) → send /estimate/[token] link
if delivery_format includes 'pdf':
  renderToBuffer(EstimatePDF) → uploadMedia(pdfBuffer) → sendDocument(clientPhone)
    ↓
UPDATE estimate SET status = 'sent'
UPDATE project SET status = 'sent'
    ↓
expireSession(sessionId)
    ↓
sendTextMessage(ownerPhone, "Estimate sent to [clientName] ✓")
```

---

## Webhook Processing: Handling Meta's 20-Second Timeout

Meta retries if it does not receive HTTP 200 within the timeout. The AI pipeline (Whisper + Claude) takes 5-15 seconds. This is a tight race.

**Recommended approach for v2.0:** Respond 200 immediately, then process asynchronously.

```typescript
// In POST handler:
// 1. Verify signature synchronously
// 2. Parse message
// 3. Return 200 immediately
// 4. Use waitUntil() (Vercel) or fire-and-forget Promise (acceptable on serverless with care)

export async function POST(req: NextRequest) {
  // ... verify signature ...
  const body = JSON.parse(rawBody)

  // Respond to Meta immediately
  const responsePromise = NextResponse.json({ status: 'ok' })

  // Process in background (Vercel: NextResponse supports waitUntil via EdgeRuntime context)
  // For Node.js runtime: fire-and-forget with error logging
  handleInboundMessage(body).catch((err) =>
    console.error('[whatsapp-webhook] handler error:', err)
  )

  return responsePromise
}
```

**Note:** On Vercel, the Node.js runtime continues executing after the response is sent as long as the function has not been frozen. For short pipelines (text-only messages), this is fine. For audio messages, the Whisper transcription + Claude generation may outlive the function execution window on the free/hobby tier. On the Pro tier, functions can run up to 60 seconds (or 300s on Enterprise). This must be validated against Vercel plan limits and flagged in the phase plan.

**Fallback:** If execution window is a concern, the webhook handler inserts a job row into a `whatsapp_jobs` queue table, and a separate cron endpoint processes pending jobs. This is a v2.1 concern — not needed for v2.0 at launch scale.

---

## Security Architecture

### Signature Verification

- Read raw body as text before JSON parse (HMAC requires exact bytes)
- Use `crypto.timingSafeEqual()` — prevents timing oracle attacks
- `WHATSAPP_APP_SECRET` stored as env var (NOT in `platform_integrations` — it's a platform-level secret, not a per-company key)
- `WHATSAPP_VERIFY_TOKEN` stored as env var (used only for webhook registration)

### Phone Number Routing

- Only messages from a registered `company_whatsapp.phone_number` are processed
- Unregistered numbers: silently drop (no response, no error, no log at INFO level — prevents enumeration)
- The `company_whatsapp.phone_number` is the owner's number (the sender), not the Meta business number

### Meta Access Token

- Stored in `platform_integrations` under provider `'whatsapp_meta'`, encrypted with AES-256-GCM (existing `lib/crypto/aes.ts`)
- Fetched via `getIntegrationKey('whatsapp_meta')` with the existing 30s TTL cache
- Never exposed to browser — all Graph API calls are server-side only

### Rate Limiting

- Add `whatsapp_daily_usage` counter to `company_whatsapp` or a separate table
- Check before processing: if count >= 20 (configurable), respond with a WhatsApp message explaining the daily limit
- Increment atomically using Supabase's `rpc()` or a direct UPDATE with RETURNING

---

## Suggested Build Order (Phase Dependencies)

Phase ordering is driven by three hard dependency chains:

**Chain A: Infrastructure must precede everything**
```
Phase 40: Infrastructure
  - company_whatsapp + whatsapp_sessions tables + migration
  - WhatsAppProvider interface + MetaAdapter skeleton
  - POST /api/webhooks/whatsapp (GET verification + POST signature check)
  - proxy.ts webhook bypass
  - WHATSAPP_APP_SECRET + WHATSAPP_VERIFY_TOKEN env vars
  - Admin panel: Meta access token card
```

**Chain B: Extraction unlocks programmatic pipeline use**
```
Phase 41: Generate-Estimate Service Extraction
  - lib/services/generate-estimate.ts (extracted from API route)
  - app/api/generate-estimate/route.ts becomes thin wrapper
  - Unit tests validate service function directly
  [This is a refactor phase — no user-visible change]
```

**Chain C: Inbound processing requires Chain A + Chain B**
```
Phase 42: Inbound Processing
  - lib/whatsapp/handler.ts state machine (awaiting_input only)
  - lib/whatsapp/session.ts CRUD
  - Audio message: downloadMedia → Whisper → createProject → generate-estimate
  - Text message: save as transcript → generate-estimate
  - Image message: downloadMedia → Supabase Storage → Claude Vision → generate-estimate
  - sendConfirmationMessage to owner
  - Session created + updated to awaiting_confirm
```

**Chain D: Confirmation flow requires Chain C**
```
Phase 43: Confirmation Flow
  - lib/whatsapp/handler.ts awaiting_confirm state
  - lib/whatsapp/formatter.ts buildConfirmationMessage()
  - Parse "send" / "edit X" / "cancel" commands
  - Session expiry logic
  - Session cleanup cron (pg_cron or Vercel cron — same pattern as orphan project cleanup)
```

**Chain E: Outbound delivery requires Chain D**
```
Phase 44: Outbound Client Delivery
  - lib/whatsapp/formatter.ts buildClientDeliveryText()
  - MetaAdapter.sendDocumentMessage() (PDF upload + send)
  - sendTextMessage to client phone
  - sendShareLink to client
  - delivery_format respected per company_whatsapp row
```

**Chain F: Settings UI can start in parallel with Chain B**
```
Phase 45: Settings UI + Admin
  - /settings/integrations page + Link card on /settings/page.tsx
  - WhatsAppConnectCard (connect/verify/disconnect/delivery format)
  - POST /api/settings/whatsapp/connect + /verify + DELETE
  - Admin panel usage visibility (optional for v2.0)
```

**Recommended phase order:**

1. Phase 40: Infrastructure (blocks everything)
2. Phase 41: Service extraction (blocks inbound)
3. Phase 42: Inbound processing (core value — delivers end-to-end for text messages)
4. Phase 45: Settings UI (can be built in parallel with 42 by sharing types from Phase 40)
5. Phase 43: Confirmation flow (completes the conversational loop)
6. Phase 44: Outbound delivery (delivers the estimate to the client)

**Note:** Phase 45 (Settings UI) is listed before 43/44 because users need to connect their number before the feature is usable end-to-end. In practice, build Phases 40, 41, 42, and 45 in the same milestone pass — with 45 providing the connection mechanism for 42 to be testable.

---

## Environment Variables Required

```bash
# Webhook verification (set in Meta App Dashboard)
WHATSAPP_VERIFY_TOKEN=<random-string-you-choose>

# HMAC signature verification (from Meta App Dashboard > App Secret)
WHATSAPP_APP_SECRET=<meta-app-secret>

# Meta access token stored via platform_integrations (not a direct env var)
# Managed through /admin/integrations UI — not committed to env
```

No new `NEXT_PUBLIC_*` variables are needed — all WhatsApp communication is server-side only.

---

## Sources

- Direct inspection of `app/api/generate-estimate/route.ts` — auth pattern, pipeline structure
- Direct inspection of `lib/ai/index.ts`, `lib/ai/provider.interface.ts` — provider abstraction to replicate
- Direct inspection of `lib/platform-config.ts` — `getIntegrationKey()`, `IntegrationProvider` union, TTL cache
- Direct inspection of `lib/supabase/service.ts` — `requireServiceClient()` for webhook context
- Direct inspection of `proxy.ts` — middleware structure, custom host bypass pattern
- Direct inspection of `lib/utils/estimate-template.ts` — `buildItemsBreakdown()`, `resolveTemplate()` for reuse
- Direct inspection of `supabase/migrations/20260506000001_phase19_price_book.sql` — RLS policy pattern to replicate
- Direct inspection of `app/(app)/settings/page.tsx` — Link card pattern for new integrations entry
- [pons.chat — WhatsApp Cloud API Webhook Next.js guide](https://pons.chat/blog/whatsapp-cloud-api-webhook-nextjs) — GET verification + POST HMAC implementation
- [Meta for Developers — messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/) — inbound payload structure
- [Meta for Developers — audio messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages/) — audio media handling
- [Meta for Developers — document messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages/) — PDF send via media upload
- [Meta for Developers — media reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/) — upload/download endpoints
- [hookdeck.com — WhatsApp webhooks guide](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices) — signature verification best practices
- [SEED-008 — WhatsApp Estimate Channel](..//seeds/SEED-008-whatsapp-estimate-channel.md) — product scope and breadcrumbs
- .planning/PROJECT.md — existing tech stack constraints and key decisions

---
*Architecture research for: v2.0 WhatsApp Estimate Channel*
*Researched: 2026-05-10*
