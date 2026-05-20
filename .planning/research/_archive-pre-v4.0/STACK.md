# Technology Stack

**Project:** Xtimator v2.0 WhatsApp Estimate Channel
**Researched:** 2026-05-10
**Scope:** NEW capabilities only — additions required to integrate Meta WhatsApp Cloud API into the existing Next.js 16 / Supabase / Anthropic stack

---

## What NOT to Re-research (Already Exists and Validated)

| Capability | How It Exists |
|------------|--------------|
| Audio transcription | OpenAI Whisper via `transcribeRecording` server action |
| Photo analysis + AI estimate | `lib/ai/` abstraction — `AnthropicAdapter` (Claude Vision + tool_use) |
| PDF generation | `@react-pdf/renderer` + `/api/estimates/[id]/pdf` route |
| Plain-text estimate formatting | `lib/utils/estimate-template.ts` — `buildItemsBreakdown()` |
| Project creation (programmatic) | `createProjectAction` in `lib/actions/project.ts` — eager draft pattern |
| Supabase DB + RLS patterns | `company_price_book` table pattern to replicate for `company_whatsapp` |
| Email delivery | Resend — already used for estimate delivery |
| API credential encryption | AES-256-GCM pattern in `platform_integrations` table |

---

## New Capabilities Required for v2.0

### 1. Meta WhatsApp Cloud API — HTTP Client (no SDK needed)

**Decision: Native `fetch` with typed wrappers — NO third-party WhatsApp SDK.**

**Rationale:**
- The official Meta Node.js SDK (`whatsapp` npm package) was **archived June 7, 2023** and is no longer maintained. Do not use it.
- The unofficial `@great-detail/whatsapp` fork exists but adds a dependency on unmaintained-upstream code. Not worth the surface area.
- The Meta Cloud API is a clean REST API. All operations (send message, send document, upload media, download media) are `fetch` calls to `https://graph.facebook.com/v21.0/...` with a `Bearer` token and JSON or `multipart/form-data` body.
- A thin internal `lib/whatsapp/client.ts` with typed functions (`sendTextMessage`, `sendDocument`, `downloadMedia`, `uploadMedia`) is ~150 lines, fully testable, and zero dependency.
- This follows the same pattern already used for Anthropic and Gemini (provider abstraction in `lib/ai/`).

**Current Graph API version:** v21.0 (stable as of 2026-05-10). Use this in all endpoint URLs.

**Base endpoint:** `https://graph.facebook.com/v21.0`

**Key operations:**

| Operation | Endpoint | Method | Notes |
|-----------|----------|--------|-------|
| Send text message | `/{PHONE_NUMBER_ID}/messages` | POST | JSON body |
| Upload media (PDF, audio) | `/{PHONE_NUMBER_ID}/media` | POST | multipart/form-data |
| Download inbound media | `/{MEDIA_ID}` | GET | Returns temp URL; fetch that URL with Bearer token |
| Delete media | `/{MEDIA_ID}` | DELETE | After processing inbound files |

**Authorization:** All calls use `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}` header.

**Inbound audio download pattern (critical):** WhatsApp does NOT send audio bytes directly in the webhook payload. It sends a `media_id`. To process:
1. `GET https://graph.facebook.com/v21.0/{media_id}` → returns `{ url, mime_type, sha256 }` (temp URL, valid 5 min)
2. `GET {url}` with `Authorization: Bearer {token}` → returns audio bytes
3. Pass bytes to Whisper (existing pipeline)
4. Delete media after processing: `DELETE https://graph.facebook.com/v21.0/{media_id}`

---

### 2. Session State for Multi-Turn Confirmation Flow

**Decision: Upstash Redis (`@upstash/redis`) via Vercel KV — NOT Supabase rows.**

**Rationale:**
- The confirmation flow (generate → confirm → edit → send) requires temporary state (30-min expiry) that must survive across multiple HTTP requests (each inbound WhatsApp message is a separate webhook POST).
- Supabase is viable (see SEED-008's `whatsapp_sessions` schema), but has downsides: migrations for ephemeral data, no native TTL support, polling for expiry, more RLS surface area.
- Upstash Redis with `EXPIRY` on keys handles 30-min session cleanup natively and at zero cost for this traffic volume.
- `@upstash/redis` is the correct package for Vercel serverless — it uses HTTP (not TCP sockets), which works in serverless environments. Standard `ioredis` and `redis` npm packages require persistent TCP connections and do NOT work reliably on Vercel.
- Vercel KV is powered by Upstash and integrates natively — one dashboard, same SDK.

**Package:** `@upstash/redis` — latest stable: **1.38.0** (verified 2026-05-10)

**Session key pattern:** `whatsapp:session:{company_id}:{from_number}` with 30-minute TTL.

**Session state stored:**
```typescript
interface WhatsAppSession {
  state: 'awaiting_input' | 'awaiting_confirm' | 'awaiting_edit';
  draft_project_id: string | null;
  draft_estimate_id: string | null;
  from_number: string;
  company_id: string;
  expires_at: number; // Unix timestamp, informational — Redis TTL is authoritative
}
```

---

### 3. Rate Limiting for Webhook Endpoint

**Decision: `@upstash/ratelimit` — co-installed with Upstash Redis.**

**Rationale:**
- SEED-008 specifies a hard cap of 20 projects/day per company via WhatsApp.
- `@upstash/ratelimit` integrates directly with the `@upstash/redis` instance already required above — no second Redis client.
- Sliding window algorithm: `new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 d'), prefix: 'whatsapp:ratelimit' })`.
- `identifier`: `company_id` (not IP — the webhook is server-to-server from Meta; IP-based limiting would block all WhatsApp traffic).

**Package:** `@upstash/ratelimit` — latest stable: **2.0.8** (verified 2026-05-10)

---

### 4. Webhook Signature Verification — No New Package

**Decision: Node.js built-in `node:crypto` — NO new package.**

**Rationale:**
- Meta signs every webhook POST with HMAC-SHA256 using the App Secret. The signature is in the `x-hub-signature-256` header as `sha256={hex_digest}`.
- Verification uses `createHmac` and `timingSafeEqual` from `node:crypto`, which is already available in Next.js App Router (Node.js runtime).
- **Critical implementation detail:** Read body as raw text FIRST (`await request.text()`), verify HMAC, then `JSON.parse()`. Never parse JSON first — re-stringification changes bytes and breaks signature comparison.
- The GET handler on the same route handles Meta's webhook verification handshake (checks `hub.mode`, `hub.verify_token`, returns `hub.challenge` as plain text).

```typescript
// Pattern (no imports beyond node:crypto)
const rawBody = await request.text();
const appSecret = process.env.WHATSAPP_APP_SECRET!;
const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
const received = request.headers.get('x-hub-signature-256') ?? '';
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  return new Response('Unauthorized', { status: 401 });
}
const payload = JSON.parse(rawBody);
```

---

## Net-New npm Packages

| Package | Version | Purpose | Why This One |
|---------|---------|---------|-------------|
| `@upstash/redis` | `^1.38.0` | Session storage for multi-turn confirmation flow | HTTP-based Redis client — only option that works reliably in Vercel serverless. Vercel KV native integration. |
| `@upstash/ratelimit` | `^2.0.8` | Per-company rate limiting (20 projects/day via WhatsApp) | Co-designed with @upstash/redis; sliding window algorithm built-in; no second Redis client needed |

**Total net-new packages: 2.**

Everything else — HMAC verification, HTTP calls to Meta Graph API, media processing, PDF generation, estimate text formatting — uses existing code or Node.js built-ins.

---

## Installation

```bash
npm install @upstash/redis @upstash/ratelimit
```

Vercel KV setup (dashboard):
1. Go to Vercel project → Storage → Create KV Database
2. Vercel auto-injects `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` as env vars
3. `@upstash/redis` reads these via `Redis.fromEnv()`

---

## Environment Variables

### New Variables Required

| Variable | Source | Where Set | Purpose |
|----------|--------|-----------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Manager → System User → Generate Token | Vercel env (production) + `.env.local` (dev) | Bearer token for all Graph API calls. Use a **System User token** (never the temporary dev token — expires in 23h). |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Developer Dashboard → WhatsApp → API Setup → Phone Number ID | Vercel env + `.env.local` | The numeric ID of the sending phone number. Used in every send-message URL. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta Business Manager → WhatsApp Business Account ID | Vercel env + `.env.local` | The WABA ID. Needed for account-level API calls (e.g., phone number registration). |
| `WHATSAPP_APP_SECRET` | Meta Developer Dashboard → App → App Settings → App Secret | Vercel env (server-only, never client) + `.env.local` | Used to verify HMAC-SHA256 webhook signatures. NEVER expose to browser. |
| `WHATSAPP_VERIFY_TOKEN` | Self-generated random string | Vercel env + `.env.local` | Shared secret between your webhook endpoint and Meta's webhook config. Choose any value; register the same string in Meta Dashboard. |
| `KV_REST_API_URL` | Vercel KV dashboard (auto-injected by Vercel) | Vercel env (auto) | Upstash Redis endpoint URL |
| `KV_REST_API_TOKEN` | Vercel KV dashboard (auto-injected by Vercel) | Vercel env (auto) | Upstash Redis auth token |

### Existing Variables Already Present (No Change)

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY` — all already in use; WhatsApp pipeline reuses these.

---

## Meta App Configuration Requirements

### Developer Account Setup

1. **Meta Developer Account** at developers.facebook.com — must be verified
2. **Meta Business Manager** account — required for System User token generation
3. **Create a Meta App** → choose type "Business"
4. **Add WhatsApp product** to the app

### Required Permissions

| Permission | Purpose | Access Level |
|------------|---------|-------------|
| `whatsapp_business_messaging` | Send/receive messages, download media | Advanced Access (requires App Review for production) |
| `whatsapp_business_management` | Phone number management, account info | Standard (available immediately for dev) |

### Webhook Configuration

In Meta Developer Dashboard → WhatsApp → Configuration:
- **Callback URL:** `https://your-domain.vercel.app/api/webhooks/whatsapp`
- **Verify Token:** value of `WHATSAPP_VERIFY_TOKEN` env var
- **Webhook fields to subscribe:** `messages` (required), `message_statuses` (optional for delivery receipts)

### Phone Number Setup

- Add a phone number to your WABA (WhatsApp Business Account)
- The **Phone Number ID** (numeric) goes in `WHATSAPP_PHONE_NUMBER_ID`
- For development: Meta provides a free test number (5 recipient numbers, no business verification needed)
- For production: requires **Business Verification** on Meta Business Manager (government ID or business documents)

### Access Token for Production

- **Do NOT use** the temporary token from "Getting Started" (expires in 23 hours)
- **Do use** a System User token:
  1. Business Settings → System Users → Create Admin System User
  2. Assign assets: your app + whatsapp_business_messaging permission
  3. Generate Token → no expiration → copy to `WHATSAPP_ACCESS_TOKEN`

### Response Time Requirement

Meta requires the webhook endpoint to respond with HTTP 200 within **5 seconds**. If 5 consecutive webhooks fail to receive 200, Meta disables the webhook subscription. The webhook route must acknowledge receipt immediately and process asynchronously (or process fast enough — Vercel serverless functions have up to 60s execution time on pro plan).

**Pattern for heavy processing:** Acknowledge with 200 immediately, then spawn background work. For Vercel, `waitUntil` via `after()` (Next.js 15+) or optimistic 200 + Supabase queue are both valid.

---

## What NOT to Add

| Technology | Why NOT |
|------------|---------|
| Twilio WhatsApp API | User has Meta Cloud API approved. Twilio adds per-message cost ($0.005 extra/msg) on top of Meta fees, plus Twilio account complexity. The SEED-008 note recommending Twilio was written before Meta approval was confirmed. |
| Official Meta `whatsapp` npm package | Archived June 7, 2023. Unmaintained. |
| `@great-detail/whatsapp` | Fork of above. Adds dependency weight for a thin wrapper around fetch calls you can write directly. |
| `whatsapp-web.js` / `@whiskeysockets/baileys` | These reverse-engineer the WhatsApp Web protocol. They are unofficial, violate WhatsApp ToS, and can be terminated by Meta at any time. Not appropriate for a SaaS product. |
| `ioredis` / `redis` (standard) | TCP-socket-based Redis clients. Do NOT work reliably in Vercel serverless functions due to connection lifecycle. Use `@upstash/redis` (HTTP-based) instead. |
| Bull / BullMQ | Job queue library. Requires persistent Redis TCP connection — incompatible with Vercel serverless. `after()` or Supabase-based queue covers the async webhook processing need. |
| Socket.io / WebSockets for real-time | WhatsApp channel is webhook-push from Meta's servers. No persistent connection needed on the Xtimator side. |
| Separate WhatsApp microservice | Overkill for this milestone. The webhook handler is a standard Next.js API route. Microservice complexity is not warranted until traffic > 10K messages/day. |
| `formdata-node` or `form-data` npm package | Node.js 18+ (used by Next.js 16) has native `FormData` and `Blob` in the runtime. No polyfill needed for multipart/form-data uploads to Meta's media endpoint. |

---

## Integration Points with Existing Code

| Existing File | How WhatsApp Uses It |
|--------------|---------------------|
| `app/api/generate-estimate/route.ts` | Called programmatically from webhook handler (not via browser) — no changes needed, just internal HTTP call |
| `app/api/estimates/[id]/pdf/route.ts` | Called to generate PDF buffer for WhatsApp document attachment |
| `lib/utils/estimate-template.ts` — `buildItemsBreakdown()` | Formats estimate summary text for the WhatsApp confirmation message |
| `lib/ai/index.ts` — `WhatsAppProvider` interface | New `MetaAdapter` follows same factory pattern as `AIProvider` |
| `lib/actions/project.ts` — `createProjectAction` | Called without wizard — programmatic project creation from inbound message |
| `lib/actions/recording.ts` — `transcribeRecording()` | Reused for inbound WhatsApp audio after media download |
| `platform_integrations` table | WhatsApp access token stored encrypted (AES-256-GCM), same pattern as other API keys |
| `company_price_book` table + RLS | `company_whatsapp` table follows same RLS isolation pattern |

---

## New DB Tables Required

These are schema decisions, not library decisions — documented here for completeness.

```sql
-- Phone number → company mapping (1:1)
CREATE TABLE company_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,   -- E.164 format: +15551234567
  waba_phone_number_id TEXT,           -- Meta phone_number_id
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'active', 'suspended')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: company_id = auth.company_id()
```

Session state in Redis (not a DB table) — see Session State section above.

---

## Architecture: WhatsApp Message Flow

```
Meta servers
    │  POST /api/webhooks/whatsapp
    │  x-hub-signature-256: sha256={hmac}
    ▼
[1] Verify HMAC signature (node:crypto — synchronous, ~0ms)
    │  Return 200 immediately (within Meta's 5s window)
    ▼
[2] Route by from_number → company_id
    │  SELECT company_id FROM company_whatsapp WHERE phone_number = $1
    ▼
[3] Load/update Upstash Redis session (whatsapp:session:{company_id}:{from_number})
    ▼
[4] Dispatch by message type:
    ├── text  → parse intent (send/edit/cancel/new job description)
    ├── audio → download media → Whisper → text description
    └── image → download media → Claude Vision → structured analysis
    ▼
[5] If new estimate needed:
    createProjectAction() → generate-estimate (internal) → store in DB
    ▼
[6] Send confirmation summary via Meta Graph API
    POST graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
    ▼
[7] On "send" command: deliver to client
    ├── Text: sendTextMessage() to client phone
    ├── PDF:  generatePDF() → uploadMedia() → sendDocument()
    └── Link: sendTextMessage() with /estimate/{token} URL
```

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| No SDK needed (raw fetch) | HIGH | Official SDK archived 2023; Meta Graph API is documented REST; verified against current Meta docs |
| Graph API version v21.0 | HIGH | Multiple sources (Medium 2026 article, Meta changelog) confirm v21.0 current stable |
| `@upstash/redis` for sessions | HIGH | Official Vercel KV docs; Upstash docs confirm HTTP-based Redis is the correct serverless choice |
| Package versions (1.38.0 / 2.0.8) | HIGH | Verified via `npm view` at time of research |
| HMAC with `node:crypto` | HIGH | Confirmed in Meta docs (x-hub-signature-256); Node.js crypto built-in |
| System User token required for production | HIGH | Multiple official sources confirm temporary token expires in 23h |
| Business Verification required for production | HIGH | Meta docs consistently state this requirement |
| `after()` for async webhook processing | MEDIUM | Next.js 15+ feature; behavior on Vercel Edge vs Node runtime needs verification at implementation time |

---

## Sources

- Meta WhatsApp Cloud API official docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
- Meta Developer webhook setup: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- Meta System User access tokens: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/
- WhatsApp Node.js SDK archived (GitHub): https://github.com/WhatsApp/WhatsApp-Nodejs-SDK
- Next.js + WhatsApp webhook implementation (Feb 2026): https://pons.chat/blog/whatsapp-cloud-api-webhook-nextjs
- Graph API v21.0 release: https://ppc.land/meta-releases-graph-api-v21-0-and-marketing-api-v21-0/
- Upstash Redis npm: https://www.npmjs.com/package/@upstash/redis
- Upstash Ratelimit npm: https://www.npmjs.com/package/@upstash/ratelimit
- Vercel KV session store guide: https://vercel.com/kb/guide/session-store-nextjs-redis-vercel-kv
- Meta media upload/download API: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/
- Meta document messages: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages/
- WhatsApp Cloud API 2026 integration guide: https://medium.com/@aktyagihp/whatsapp-cloud-api-integration-in-2026-0493dd05d644
