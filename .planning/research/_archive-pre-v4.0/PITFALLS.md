# Domain Pitfalls

**Domain:** Meta WhatsApp Cloud API channel — Adding to existing Next.js 16 / Supabase app
**Milestone:** v2.0 WhatsApp Estimate Channel
**Researched:** 2026-05-10
**Confidence:** HIGH (Meta official docs + multiple verified community sources)

---

## Critical Pitfalls

These mistakes cause silent failures, security holes, or rewrites.

---

### Pitfall 1: Raw Body Consumed Before HMAC Verification

**What goes wrong:** The webhook route calls `await req.json()` to read the payload, then tries to verify the `X-Hub-Signature-256` header using the parsed object re-serialized to a string. HMAC breaks because JSON serialization is not byte-for-byte identical to what Meta sent (key ordering, Unicode escaping, whitespace may differ).

**Why it happens:** The instinct is to parse the body first and work with a typed object. Next.js App Router's `Request` object is a standard Web API — the body stream can only be consumed once. Calling `req.json()` exhausts it; there is nothing left to hash.

**Consequences:** Every signature check fails. You either disable HMAC verification (leaving the endpoint open to forged requests) or the endpoint rejects all legitimate Meta traffic.

**Prevention:**
```typescript
// app/api/webhooks/whatsapp/route.ts
export async function POST(req: Request) {
  const rawBody = await req.text()           // read once as string
  const valid = verifyHmac(rawBody, req.headers.get('x-hub-signature-256'))
  if (!valid) return new Response('Forbidden', { status: 403 })
  const payload = JSON.parse(rawBody)        // parse after verification
  // ...
}
```
Never use `req.json()` in a webhook handler. Always `req.text()` first.

**Detection:** 403 responses to every Meta POST during initial integration. Signature mismatch errors in logs.

**Phase:** Phase 1 — Webhook Infrastructure.

---

### Pitfall 2: WABA Not Subscribed to App (Silent Delivery Failure)

**What goes wrong:** The webhook URL passes GET verification. The Meta Developer dashboard shows green. But no messages ever arrive at `POST /api/webhooks/whatsapp`. The WABA is not subscribed to the Meta app.

**Why it happens:** As of late 2025, Meta's developer UI no longer auto-subscribes the WABA when a phone number is added. Webhook configuration and WABA app subscription are separate steps shown in different UI panels. The GET challenge succeeds because that tests the URL, not the subscription.

**Consequences:** Development grinds to a complete halt with no useful error. Developers spend hours debugging their handler when the root cause is a Meta portal configuration step.

**Prevention:**
After webhook URL configuration, explicitly POST to the Graph API:
```
POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
Authorization: Bearer {SYSTEM_USER_TOKEN}
```
Verify with:
```
GET https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
```
Store this step in the integration setup checklist. If switching Meta apps (dev → staging → prod), re-run this POST for each app.

**Detection:** Webhook URL verified (GET works), but zero POST events arrive. Sending a test message from Meta's "Test" panel shows delivery but nothing hits the handler.

**Phase:** Phase 1 — Webhook Infrastructure.

---

### Pitfall 3: Temporary Access Token Used in Production

**What goes wrong:** The Meta Developer console generates a temporary token good for ~24 hours. The team uses it in the `.env` file. The integration works during development, then silently breaks the next day when the token expires.

**Why it happens:** The "Test" token is shown prominently in the Meta dashboard and is the easiest path to get started. There is no obvious warning that it expires.

**Consequences:** All outbound message sends fail with 401 after 24 hours. Any cached sessions or in-progress estimates are abandoned without notifying the user.

**Prevention:** Before any production deploy, create a **System User** in Meta Business Manager, assign it Full Control of the WhatsApp app, and generate a permanent (non-expiring) System User access token. Store this in the `platform_integrations` table under the existing AES-256-GCM encrypted credentials pattern — same as Claude and OpenAI keys. Never use the temporary console token anywhere except local smoke tests.

**Detection:** Outbound sends start failing exactly 24 hours after the token was generated. Error: `{"error":{"code":190,"type":"OAuthException"}}`.

**Phase:** Phase 1 — Webhook Infrastructure (credential setup step).

---

### Pitfall 4: Missing HMAC Timing-Safe Comparison

**What goes wrong:** Signature verification uses `===` or `==` for string comparison instead of `crypto.timingSafeEqual`. A timing oracle attack can recover the app secret byte-by-byte by measuring response time differences.

**Why it happens:** Standard string equality is the first instinct. The difference in behavior is invisible during testing.

**Consequences:** App secret leaked over time, allowing forged webhooks from any source.

**Prevention:**
```typescript
import { createHmac, timingSafeEqual } from 'crypto'

function verifyHmac(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const appSecret = process.env.META_APP_SECRET!
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = signatureHeader.replace('sha256=', '')
  // Lengths must match before timingSafeEqual (it throws on mismatch)
  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}
```

**Phase:** Phase 1 — Webhook Infrastructure.

---

### Pitfall 5: Message Deduplication Not Implemented (Duplicate Estimate Generation)

**What goes wrong:** Meta uses at-least-once delivery. If the webhook handler returns non-200 (e.g., due to a transient Supabase error), Meta retries the same message for up to 7 days. Retries generate duplicate projects and duplicate AI estimates, inflating AI API costs and confusing owners who see two identical draft estimates.

**Why it happens:** Serverless functions are stateless. Without a deduplication store, each retry is treated as a new inbound message.

**Consequences:** Duplicate projects in the owner's dashboard, duplicate AI calls (each costing ~$0.10–$0.40 per estimate), potentially duplicate sends to clients.

**Prevention:** Use the message `wamid` (e.g., `wamid.HBgL...`) from the webhook payload as a deduplication key. Before processing any inbound message, check a `whatsapp_processed_messages` table (or Upstash Redis with a TTL of 48 hours):

```sql
CREATE TABLE whatsapp_processed_messages (
  wamid TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Auto-purge after 48 hours via pg_cron or Supabase scheduled function
```

Return 200 immediately on duplicate detection without re-processing.

**Detection:** Multiple identical projects created for same owner within minutes. Supabase logs show repeated inserts with identical content.

**Phase:** Phase 2 — Inbound Processing.

---

### Pitfall 6: Status Webhook Flood Consuming Serverless Invocations

**What goes wrong:** For every message the bot sends outbound, Meta fires three status webhooks back: `sent`, `delivered`, `read`. With a multi-company deployment where each company sends an estimate summary plus a confirmation, that is 6+ invocations per conversation on top of the inbound message. At Vercel Pro pricing, each function invocation counts toward limits. At scale this can consume 80% of monthly invocations on status noise.

**Why it happens:** Status webhooks arrive at the same `POST /api/webhooks/whatsapp` route as inbound messages. Not filtering them early means every status event runs the full handler logic.

**Consequences:** Inflated function invocation counts, unnecessary Supabase reads (company lookup, session lookup) per status event, potential throttling.

**Prevention:** Add an early-exit guard as the first statement after signature verification:
```typescript
const entries = payload?.entry ?? []
for (const entry of entries) {
  for (const change of entry.changes ?? []) {
    const statuses = change.value?.statuses
    if (statuses?.length && !change.value?.messages?.length) {
      return new Response('OK', { status: 200 }) // drop pure status events
    }
  }
}
```
Only process events that contain a `messages` array. Log status events to a separate lightweight table if delivery tracking is needed.

**Phase:** Phase 1 — Webhook Infrastructure.

---

### Pitfall 7: Media URL Expires Before Download

**What goes wrong:** The webhook payload for audio or photo messages does not contain the binary media. It contains a `media_id`. The handler must call the Graph API to retrieve a temporary download URL, then download the binary from that URL. That temporary URL expires in **5 minutes**. If the webhook handler is queued behind other invocations or if any async step introduces delay, the download fails with a 410 Gone.

**Why it happens:** Developers store the `media_id` and plan to process media asynchronously (e.g., via a queue). The media URL is only valid for 5 minutes, but this constraint is buried in the Media API documentation.

**Consequences:** Audio messages cannot be transcribed, photos cannot be analyzed. The bot falls back to an error state or silently drops the media.

**Prevention:** Download and persist media to Supabase Storage **synchronously within the webhook handler**, before returning 200. The sequence must be:
1. Verify HMAC
2. Return 200 immediately to Meta (using `waitUntil` if using Vercel's `after()` or background job pattern — see Pitfall 8)
3. In background: call `GET https://graph.facebook.com/v21.0/{media_id}` → get URL → download binary with Bearer token → upload to Supabase Storage
4. Trigger Whisper / Claude Vision pipeline only after media is in Supabase Storage

Additionally, note the audio MIME type from WhatsApp is `audio/ogg; codecs=opus` — Whisper accepts this directly. Do not assume it is `audio/opus` (different MIME type, causes 131053 errors on some endpoints).

**Detection:** 410 errors on media download URLs in logs. Errors appear intermittently, more often under load.

**Phase:** Phase 2 — Inbound Processing.

---

### Pitfall 8: Long AI Pipeline Exceeds Vercel Function Timeout

**What goes wrong:** A full inbound audio message handling sequence — download audio (Meta CDN) + Whisper transcription + Claude estimate generation — takes 30–90 seconds. Vercel Pro serverless functions have a 60-second hard timeout. The function is killed mid-pipeline. Meta receives a 5xx and retries, triggering the full pipeline again.

**Why it happens:** The existing `generate-estimate` route runs synchronously (it is called from the app UI where the user waits for a response). The WhatsApp handler reuses the same synchronous pattern in a context where the caller (Meta) has a 5-second expectation for initial response.

**Consequences:** Estimate generation fails silently. Meta retries, triggering Pitfall 5 (duplicates) unless deduplication is in place. Owner gets no estimate.

**Prevention:**
- **Immediate 200 strategy:** Return `200 OK` to Meta within 2 seconds. Use Next.js 15's `after()` (or Vercel's `waitUntil`) to run the AI pipeline after the response is sent:
  ```typescript
  import { after } from 'next/server'
  
  export async function POST(req: Request) {
    // verify HMAC, mark wamid as received
    after(async () => {
      // full pipeline: download media → Whisper → Claude → persist
    })
    return new Response('OK', { status: 200 })
  }
  ```
- Use `maxDuration = 300` in the route segment config (Vercel Pro/Enterprise Fluid Compute supports up to 800 seconds).
- If `after()` is not available, use Supabase Edge Functions or a queue (Upstash QStash) for the heavy work.

**Detection:** `FUNCTION_INVOCATION_TIMEOUT` errors in Vercel logs. Estimates never created from WhatsApp but no error returned to owner.

**Phase:** Phase 2 — Inbound Processing.

---

### Pitfall 9: Race Condition on Session State in Concurrent Webhooks

**What goes wrong:** An owner sends an audio message AND immediately sends a text message (or the audio generates a status webhook that arrives concurrently). Two invocations of the webhook handler run simultaneously. Both read the `whatsapp_sessions` row and see no existing session. Both insert a new session row, violating the `UNIQUE(company_id, phone_number)` constraint — or worse, if no unique constraint exists, two sessions are created, splitting the conversation across them.

**Why it happens:** Serverless functions are stateless and horizontally scaled. Two requests arriving within milliseconds spawn two independent function instances with no shared memory.

**Consequences:** Duplicate session rows, conversation state corruption, owner gets two confirmation messages for one estimate.

**Prevention:**
- Add a database-level unique constraint: `UNIQUE (company_id, phone_number)` on `whatsapp_sessions`. Use an upsert pattern with conflict handling instead of insert.
- Use Postgres advisory locks or `SELECT ... FOR UPDATE` when reading + writing session state atomically:
  ```sql
  -- Atomic upsert
  INSERT INTO whatsapp_sessions (company_id, phone_number, state, expires_at)
  VALUES ($1, $2, 'awaiting_input', NOW() + INTERVAL '30 minutes')
  ON CONFLICT (company_id, phone_number)
  DO UPDATE SET state = EXCLUDED.state, expires_at = EXCLUDED.expires_at
  ```
- Deduplicate by `wamid` first (Pitfall 5) — this eliminates most race triggers.

**Detection:** Duplicate session rows in `whatsapp_sessions`. Owner receives two confirmation messages. Supabase logs show unique constraint violations.

**Phase:** Phase 3 — Confirmation Flow.

---

### Pitfall 10: Webhook Supabase Client Uses Auth Cookie (Wrong Client)

**What goes wrong:** The webhook handler imports the standard `createClient()` from `lib/supabase/server.ts` — the one that reads the `cookies()` store for user session auth. A webhook request from Meta carries no cookies, no user session. The Supabase client is initialized with the anon key and no auth context. All RLS-protected table queries return empty results. The company lookup by phone number fails silently, the handler drops the message, and there is no error in the logs.

**Why it happens:** The existing `createClient()` is correct for all app routes (auth context present). The webhook route looks identical at a glance, so the same import is used without thinking.

**Consequences:** All message routing fails. No company is found for any phone number. Every inbound message is silently dropped.

**Prevention:** The webhook handler must use a separate **service role client** that bypasses RLS:
```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```
This is the same pattern already used by the PDF route and platform admin operations. Never expose this client outside server-side route handlers. Keep a clear naming convention: `createClient()` = auth-scoped, `createServiceClient()` = webhook/admin operations.

**Detection:** `company_whatsapp` lookup returns null for every phone number, even after correct phone registration. No Supabase errors, just empty results.

**Phase:** Phase 1 — Webhook Infrastructure.

---

## Moderate Pitfalls

---

### Pitfall 11: 24-Hour Messaging Window Violation

**What goes wrong:** The bot sends an outbound estimate to a client's WhatsApp number that has never messaged the business. Or the owner's 30-minute confirmation session expires and the bot tries to re-contact the owner after more than 24 hours. Both are outbound-initiated messages outside an active conversation window and require an approved **Message Template**.

**Why it happens:** In the Xtimator flow, the owner initiates via WhatsApp (inbound), so the owner → bot direction stays within the 24-hour window. But sending the estimate to the **client's** WhatsApp number (Phase 4, outbound delivery) is a bot-initiated conversation that requires template approval if the client has never messaged the bot's phone number.

**Consequences:** `131026` error from the Graph API: "Message undeliverable. The recipient hasn't opted in." Account quality score damaged with repeated violations. Potential WABA suspension.

**Prevention:**
- For outbound delivery to clients: default delivery format must be **share link** or **email**, not WhatsApp direct. WhatsApp-direct-to-client should be clearly marked as an advanced option requiring the client to have first messaged the business number.
- If WhatsApp-to-client is offered, create a pre-approved template (e.g., `estimate_ready`) and submit for Meta approval during Phase 5. Templates can only be used to initiate; free-form text requires the client to have messaged first.
- The owner confirmation flow is safe as long as the bot responds within 24 hours of the owner's initial inbound message.

**Phase:** Phase 4 — Outbound Delivery.

---

### Pitfall 12: Phone Number Format Mismatch (E.164 vs. Meta's Internal Format)

**What goes wrong:** The `company_whatsapp.phone_number` column stores numbers in E.164 format with a leading `+` (e.g., `+15551234567`). The webhook payload's `from` field contains the number **without** the `+` prefix (e.g., `15551234567`). The lookup `WHERE phone_number = from_number` returns null for every message.

**Why it happens:** Meta's webhook delivers phone numbers in E.164 but without the `+`. The `to` field (your business number) also arrives without `+`. The stored format and the lookup value are off by one character.

**Additionally:** Starting June 2026, Meta is rolling out WhatsApp Usernames. The `wa_id` / `from` field may contain a Business-Scoped User ID (BSUID) in the format `CC.alphanumeric` instead of a phone number for users who have set a username. Phone-number-based routing will fail for these users.

**Prevention:**
- Normalize at both storage and lookup time. Always strip `+` before storage OR always add `+` before lookup. Pick one convention and enforce it at the boundary:
  ```typescript
  function normalizePhone(raw: string): string {
    return raw.startsWith('+') ? raw : `+${raw}`
  }
  ```
- For BSUID migration: design the `company_whatsapp` routing lookup to handle both phone numbers and BSUIDs. Track the `wa_id` Meta returns, not just the human-readable phone number.

**Phase:** Phase 1 — Webhook Infrastructure.

---

### Pitfall 13: Audio Format Mismatch Passed to Whisper

**What goes wrong:** WhatsApp voice messages arrive as `audio/ogg` with Opus codec. The handler passes the raw bytes to the OpenAI Whisper API with MIME type `audio/opus`. Whisper returns a 400 error or a garbled transcription.

**Why it happens:** The Meta documentation lists `audio/ogg; codecs=opus` as the received MIME type, but developers abbreviate it to `audio/opus` when constructing the Whisper API call — a different and invalid MIME type for that format.

**Prevention:** Always set MIME type as `audio/ogg` (Whisper accepts OGG/Opus natively). If conversion is needed for any edge case, use FFmpeg to convert OGG/Opus → MP3 before sending. Verify correct Content-Type in the Whisper FormData upload:
```typescript
const formData = new FormData()
formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg')
formData.append('model', 'whisper-1')
```

**Phase:** Phase 2 — Inbound Processing.

---

### Pitfall 14: Session Expiry Not Enforced at Query Time

**What goes wrong:** The `whatsapp_sessions` table has an `expires_at` column, but the handler queries sessions without filtering expired ones: `WHERE company_id = $1 AND phone_number = $2`. An expired session from a conversation two hours ago is returned. The handler uses its stale `draft_estimate_id`, corrupting the new conversation.

**Why it happens:** The expiry column is added with good intentions but the WHERE clause omits the check during implementation.

**Prevention:** Every session read must include the expiry guard:
```sql
WHERE company_id = $1
  AND phone_number = $2
  AND expires_at > NOW()
```
Add a database index on `(company_id, phone_number, expires_at)`. Use the existing `pg_cron` pattern (already in the codebase for orphan cleanup) to purge expired sessions daily.

**Phase:** Phase 3 — Confirmation Flow.

---

### Pitfall 15: Meta App in Wrong Mode (Development vs. Live)

**What goes wrong:** The Meta app is left in "Development" mode. In development mode, the app can only send messages to phone numbers explicitly added to the allowed list (max 5). Any message sent to a real customer's number returns error `131030: Recipient phone number not in allowed list`.

**Why it happens:** The path from development → Live mode requires Meta Business Verification (uploading official documents, 2–10 business day review). Developers complete integration before starting this process, then cannot test with real phone numbers.

**Consequences:** The entire production deployment is blocked until Business Verification completes. This review process cannot be expedited.

**Prevention:** Start Meta Business Verification during Phase 1, in parallel with webhook infrastructure development. Do not wait until the feature is "done" to submit. Required documents: US business registration, EIN confirmation letter, or utility bill in the business name. Build with the test number for functional testing while waiting for verification.

**Phase:** Phase 1 — Webhook Infrastructure (submit verification immediately).

---

### Pitfall 16: Opt-In Compliance for Owner Registration

**What goes wrong:** A company phone number is added to `company_whatsapp` and "activated" by an admin without the actual phone number owner's explicit consent. Messages are sent from that number without opt-in. Meta's policy enforcement flags the account.

**Why it happens:** The registration flow in `/settings/integrations` might allow any admin to register any phone number without proof of ownership.

**Consequences:** WhatsApp Business Policy violation. Account quality score degraded. Potential WABA suspension.

**Prevention:** The phone number registration flow must include a verification step where a code is sent via WhatsApp to the number being registered, and the owner confirms it in the UI. This proves the person registering the number is the one who controls it — this is already described in SEED-008's connection flow. Do not skip this verification step even in MVP.

**Phase:** Phase 5 — Setup and Admin.

---

## Minor Pitfalls

---

### Pitfall 17: Verify Token Hardcoded or Weak

**What goes wrong:** The GET webhook verification endpoint checks `hub.verify_token` against a hardcoded string like `"xtimator_verify"`. This string is visible in source code and could allow someone to register a fake webhook endpoint if Meta's portal is ever compromised.

**Prevention:** Store the verify token in the encrypted `platform_integrations` table alongside other API credentials. Use a cryptographically random string (32+ bytes, base64 encoded). Rotate it after initial setup.

**Phase:** Phase 1 — Webhook Infrastructure.

---

### Pitfall 18: No Guard Against Unknown Message Types

**What goes wrong:** The handler processes `text`, `audio`, `image` message types. A user sends a video, sticker, location, or contact card. The handler throws an unhandled case, returns 500, Meta retries, and the failure loop continues for 7 days.

**Prevention:** Add a default catch-all case that:
1. Returns 200 (to stop Meta's retry loop)
2. Optionally sends the owner a polite "I can't process videos yet" message
3. Does not throw

```typescript
switch (msgType) {
  case 'text': // handle
  case 'audio': // handle
  case 'image': // handle
  default:
    await sendTextMessage(from, "I can process audio, text, and photos. Video is not supported yet.")
    return new Response('OK', { status: 200 })
}
```

**Phase:** Phase 2 — Inbound Processing.

---

### Pitfall 19: Storing Media in `/tmp` Instead of Supabase Storage

**What goes wrong:** The handler downloads WhatsApp media to the function's `/tmp` directory (available on Vercel up to 512 MB) and passes the file path to Whisper or Claude. Works in development. In production, the AI call runs in a different function instance that has no access to `/tmp` from the previous instance.

**Prevention:** Always stream media bytes directly to the AI API call as a buffer, or persist to Supabase Storage first and pass the URL. Never rely on `/tmp` persistence across invocations.

**Phase:** Phase 2 — Inbound Processing.

---

### Pitfall 20: Rate Limit on Per-User Outbound Messages

**What goes wrong:** During the confirmation flow, the bot sends a summary message, then the owner replies "edit line 2 to $150", the bot updates and re-sends the summary. Multiple rapid edits trigger Meta's per-user rate limit: 1 message per 6 seconds to the same number (10 messages/minute).

**Prevention:** Add a 1-second minimum delay between successive outbound messages to the same number. Queue outbound messages rather than sending inline. For the confirmation flow, this is unlikely to be a problem in normal use (owners rarely send more than 2–3 edit commands per estimate), but the handler should catch `131056` (rate limit) errors and retry after 7 seconds.

**Phase:** Phase 3 — Confirmation Flow.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | Webhook handler | Raw body consumed before HMAC (#1) | Always `req.text()` first |
| Phase 1 | Webhook handler | WABA not subscribed to app (#2) | POST to `/{WABA_ID}/subscribed_apps` immediately after URL verification |
| Phase 1 | Credentials | Temporary token in production (#3) | System User token via Business Manager |
| Phase 1 | Security | String equality for HMAC (#4) | `crypto.timingSafeEqual` only |
| Phase 1 | Routing | Phone number format mismatch (#12) | Normalize at read/write boundary |
| Phase 1 | Supabase | Auth-scoped client in webhook (#10) | Separate `createServiceClient()` |
| Phase 1 | Meta setup | App left in Development mode (#15) | Submit Business Verification immediately |
| Phase 2 | Media | 5-minute media URL expiry (#7) | Download synchronously before returning 200 |
| Phase 2 | Performance | AI pipeline timeout (#8) | `after()` + `maxDuration` config |
| Phase 2 | Dedup | Duplicate estimates (#5) | `wamid` dedup table before any processing |
| Phase 2 | Status floods | Invocation waste (#6) | Early-exit for pure status events |
| Phase 2 | Audio | Wrong MIME type to Whisper (#13) | `audio/ogg`, not `audio/opus` |
| Phase 2 | Serverless | `/tmp` file persistence (#19) | Buffer to Supabase Storage, never `/tmp` |
| Phase 3 | Concurrency | Race on session creation (#9) | DB unique constraint + upsert |
| Phase 3 | Session | Expired session returned (#14) | Always filter `expires_at > NOW()` |
| Phase 4 | Compliance | 24-hour window violation (#11) | Default outbound to link/email, not WhatsApp direct |
| Phase 5 | Compliance | No opt-in verification (#16) | Require code verification in registration flow |

---

## Sources

- Meta Webhooks documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- Meta Media API documentation: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/
- Meta System User access tokens: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/
- Meta Business Messaging Policy: https://business.whatsapp.com/policy
- Meta Policy Enforcement: https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement
- "Shadow Delivery" WABA subscription issue: https://medium.com/@siri.prasad/the-shadow-delivery-mystery-why-your-whatsapp-cloud-api-webhooks-silently-fail-and-how-to-fix-2c7383fec59f
- Hookdeck WhatsApp Webhook Guide: https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices
- Duplicate webhook handling with Redis: https://medium.com/@nkangprecious26/handling-duplicate-webhooks-in-whatsapp-api-using-redis-d7d117731f95
- WhatsApp Cloud API + Next.js webhook setup: https://pons.chat/blog/whatsapp-cloud-api-webhook-nextjs
- Vercel Function Duration configuration: https://vercel.com/docs/functions/configuring-functions/duration
- BSUID migration (June 2026): https://github.com/chatwoot/chatwoot/issues/13837
- WhatsApp audio/ogg Opus + Whisper: https://github.com/openai/whisper/discussions/294
- Status webhook flood on n8n: https://community.n8n.io/t/how-to-stop-whatsapp-cloud-api-status-webhooks-from-eating-your-n8n-executions-using-a-cloudflare-worker-for-generic-webhook-node-users/294956
- Next.js App Router issue — App Directory does not support disabling body parsing: https://github.com/vercel/next.js/issues/54090
- Supabase service role + webhook pattern: https://github.com/hetref/whatsapp-chat
