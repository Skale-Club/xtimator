# Feature Landscape: v2.0 WhatsApp Estimate Channel

**Domain:** WhatsApp Business Bot — service business estimate generation via Meta Cloud API
**Researched:** 2026-05-10
**Milestone context:** Adding WhatsApp as an inbound channel to existing Xtimator estimate pipeline

---

## Context

This is a subsequent milestone. All AI pipeline plumbing is live. What is new is the
*channel surface* — Meta Cloud API as the inbound/outbound transport — not the estimate
generation logic itself.

The existing pipeline handles the heavy work:
- `app/api/generate-estimate/route.ts` — called programmatically, no wizard needed
- `app/api/analyze-photos/route.ts` — Claude Vision, unchanged
- Whisper transcription — server-side, reusable with any audio buffer
- `lib/utils/estimate-template.ts` — `buildItemsBreakdown()` + `resolveTemplate()` produce the text that the bot sends as the confirmation summary
- `app/api/estimates/[id]/pdf/route.ts` — PDF buffer for document attachment delivery
- `/estimate/[token]` — existing share link for link-based delivery

The WhatsApp channel is a new entry surface and delivery surface wrapped around the existing core.

---

## How the Meta Cloud API Works (Mechanics Every Feature Depends On)

Understanding the API mechanics is prerequisite to categorizing features correctly.

### Webhook Inbound Payload

Meta POSTs all inbound messages to your registered webhook URL. Canonical payload shape (HIGH confidence — confirmed from Meta Node.js SDK + community implementation):

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550716952",
          "phone_number_id": "171370726059401"
        },
        "contacts": [{
          "profile": { "name": "John Smith" },
          "wa_id": "15551234567"
        }],
        "messages": [{
          "from": "15551234567",
          "id": "wamid.HBgM...",
          "timestamp": "1703462814",
          "type": "audio | text | image | document | interactive",
          "text":  { "body": "..." },
          "audio": { "id": "725847798869820", "mime_type": "audio/ogg; codecs=opus" },
          "image": { "id": "725847798869820", "mime_type": "image/jpeg", "sha256": "..." }
        }]
      }
    }]
  }]
}
```

**Key extraction path:** `entry[0].changes[0].value`

**Relevant inbound message types:**
- `type: "text"` — body at `message.text.body`
- `type: "audio"` — media ID at `message.audio.id`; mime_type is `audio/ogg; codecs=opus` (WhatsApp voice notes) or `audio/mp4` (forwarded recordings)
- `type: "image"` — media ID at `message.image.id`
- `type: "interactive"` — button reply at `message.interactive.button_reply.id` and `.title`

**Media download is always two steps — there is no direct URL in the webhook:**
1. GET `https://graph.facebook.com/v19.0/{media_id}` with Bearer token → returns `{ url: "...", mime_type: "..." }`
2. GET that temporary URL with Bearer token → returns raw bytes

Audio arrives as OGG/Opus from WhatsApp voice notes. Whisper accepts OGG natively — no
transcode needed. Must be confirmed in implementation testing.

### Webhook Verification (GET Handshake)

Meta sends a GET to your webhook URL during setup with `hub.mode`, `hub.verify_token`,
and `hub.challenge`. The endpoint must return `hub.challenge` if the verify token matches.
Required before Meta will send any POST events.

### Outbound Messages

POST to `https://graph.facebook.com/v19.0/{phone_number_id}/messages`:
- `type: "text"` — up to 4096 chars, free-form
- `type: "interactive"` — up to 3 reply buttons; recipient selects one
- `type: "document"` — PDF attachment; requires uploading the file to Meta's media endpoint first to get a media ID
- `type: "template"` — pre-approved template for business-initiated messages outside the 24-hour window

### The 24-Hour Service Window

When the owner messages the bot, a 24-hour free-form response window opens. Inside this
window: unlimited text, interactive buttons, and media — no template approval required.
Outside this window: only pre-approved template messages.

For Xtimator, the entire owner ↔ bot flow (record → confirm → send) is user-initiated,
so the confirmation exchange always happens inside the service window. Interactive buttons
are fully usable without any template approval process.

### Outbound to Clients

A message to the client's WhatsApp is a business-initiated contact. If the client has not
previously messaged the bot's number, a pre-approved template is required. This is a
significant constraint for PDF/text delivery directly to the client via WhatsApp.

### Idempotency Requirement (HIGH confidence)

Meta delivers webhooks at-least-once. Duplicate message IDs are a normal operating
condition. The `messages[].id` field (the `wamid.*` string) is the deduplication key.
Must be stored before processing and checked on every incoming message.

### Messaging Limits

New WABA: 250 unique recipients per 24 hours for business-initiated messages. Service-
window replies (user messaged first, bot replies) are not subject to this cap. The v2.0
owner↔bot conversation is always user-initiated — limits are not a concern for that path.
Outbound to clients is business-initiated — the 250/day limit applies unless the client has
messaged the bot first.

---

## Table Stakes

Features the bot must have. Missing any of these means the channel does not function.

| Feature | Why Expected | Complexity | Dependency on Existing Pipeline |
|---------|--------------|------------|---------------------------------|
| `POST /api/webhooks/whatsapp` with HMAC-SHA256 signature verification | Meta requires signature check; security baseline; without it any actor can forge messages | Low | None — new route; `X-Hub-Signature-256` header + crypto.createHmac |
| GET verification handshake on same route | Meta sends this during setup; without 200 + challenge, Meta will not activate the webhook | Low | None — same route, GET handler, returns `hub.challenge` |
| Inbound message routing: phone number → company | Single webhook serves all tenants; sender `from` field must map to a company record | Low | New `company_whatsapp` table (RLS pattern mirrors `company_price_book`) |
| Immediate HTTP 200 response | Meta retries if endpoint is slow; retries cause duplicate processing | Low | Architectural discipline — respond before async work starts |
| Deduplication via `wamid.*` message ID | At-least-once delivery is guaranteed; duplicates cause double estimates | Low | New `whatsapp_processed_messages(message_id TEXT PRIMARY KEY)` table or Supabase insert-on-conflict |
| Text message handling | Owner types job description; simplest input type | Low | Calls `generate-estimate` API programmatically with transcript |
| Audio message handling | Primary use case for field workers; must download OGG from Meta, pass to Whisper | Medium | Two-step media download (new) → Whisper (reuse) → `generate-estimate` (reuse) |
| Image message handling | Photographs of job site; must download JPEG from Meta, pass to Claude Vision | Medium | Two-step media download (new) → `analyze-photos` (reuse) → `generate-estimate` (reuse) |
| Programmatic project creation | No wizard available via WhatsApp; project must be created without user navigating a form | Low | Server-side Supabase insert mirroring wizard's project creation action |
| Confirmation summary message to owner | Owner must see the estimate before it is sent; review step that prevents errors | Medium | `buildItemsBreakdown()` + `resolveTemplate()` from `lib/utils/estimate-template.ts` (reuse) |
| Session state — `awaiting_confirm` | Multi-turn flow requires storing draft estimate ID between the summary message and the owner's reply | Medium | New `whatsapp_sessions` table with `state`, `draft_estimate_id`, `expires_at` |
| Session expiry (30 minutes) | Prevents abandoned drafts; WhatsApp-native UX expectation that stale sessions die | Low | `expires_at` column + existing `pg_cron` cleanup pattern |
| "send" command: deliver estimate to client | The core action — owner approves, estimate goes to the client | Medium | Triggers outbound delivery |
| "cancel" command: discard draft | Clean abort; session cleared, no client contact | Low | Session delete + project status update |
| Outbound delivery to client: plain text | Send formatted estimate text to client's WhatsApp number | Medium | `resolveTemplate()` (reuse) + new outbound Meta API call to client number; requires pre-approved template if client has not messaged the bot first |
| Outbound delivery to client: share link | Send the existing `/estimate/[token]` URL via WhatsApp message | Low | Existing share link system entirely reused; can be appended to plain text message |
| Phone number registration UI in settings | Owner must connect their WhatsApp number; without this, the bot is unreachable | Medium | New card in `/settings/integrations`; settings pattern already established |
| Phone number verification: OTP flow | Confirms ownership of the number before activating; bot sends or assists with verification code | Medium | One pre-approved AUTHENTICATION template message; number status updated on code confirmation |
| Channel status display in settings | Owner must know if their WhatsApp channel is active, pending, disconnected, or suspended | Low | Status badge in settings card; reads from `company_whatsapp.status` |

---

## Differentiators

Features that meaningfully improve the experience beyond "it works."

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Interactive reply buttons (Send / Cancel) | Owner taps a button rather than typing "send"; eliminates mis-typed commands; works inside 24-hour window with no template approval | Low-Medium | Outbound `type: "interactive"` message with up to 3 buttons; inbound handled via `type: "interactive"` button_reply |
| "client [name]" command: assign client mid-flow | Owner names the job client in the reply ("client Maria Silva"); bot records it against the estimate and creates a client record if none exists | Low-Medium | Client lookup/creation server action (already built for web wizard); new command parser |
| Delivery format preference per company | Owner sets preferred outbound format (text, link, PDF, or combination) in settings; bot remembers it | Low | New column on `company_whatsapp` or `companies` table; small settings UI addition |
| Multi-input session: audio + photo before generating | Owner sends audio then adds a photo in the same session; bot waits for explicit "go" before triggering pipeline | Medium | Session state extended to `awaiting_input` with input accumulation; trigger word or timer-based auto-fire |
| Error messages in WhatsApp-native tone | Friendly, action-oriented responses ("I didn't catch that — try sending an audio description") rather than generic server error text | Low | Copywriting + response map; no new infrastructure |
| Admin visibility: WhatsApp usage per company | Platform admin can see which companies are using the channel, message volume, estimate counts | Medium | New admin dashboard query; no new infrastructure; uses existing admin panel pattern |
| PDF attachment outbound | Send branded PDF as WhatsApp document message to client | Medium | Re-uses `/api/estimates/[id]/pdf` buffer; new: upload PDF buffer to Meta media endpoint → send document message; requires pre-approved template for client-initiated delivery |

---

## Anti-Features

Features to explicitly not build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Video message handling | WhatsApp sends video as a media object but the AI pipeline has no video understanding; Whisper cannot process video directly without extraction; adds transcode complexity for marginal value | Bot replies: "Video not supported — please send an audio note or photo instead." |
| Full LLM-free-form conversational chatbot | Open-ended "ask me anything" behavior invites scope creep, unpredictable output, prompt injection risk, and support burden | Keep the bot strictly scripted: receive input → generate → confirm → send. That is the full script. |
| Multi-number per company | One company owning multiple registered phone numbers complicates the routing table, support, and RLS logic | One company : one phone number. Document this constraint clearly in the setup UI. |
| WhatsApp as ongoing client-facing chat channel | Allowing the client to reply and have a live conversation with the bot or owner is a different product (v3 scope); adds conversation management surface the bot is not designed for | Client receives the estimate as a one-way message. Accept/decline continues via the existing share link. |
| International phone numbers | Non-US prefixes add E.164 complexity, WhatsApp Business policy variation by country, and legal considerations | US only (+1XXXXXXXXXX) for MVP. Validate format at registration. |
| Per-message template approval for all outbound | Getting every bot message pre-approved as a template creates 1-7 day review cycles per message type and blocks the confirmation flow | Rely entirely on the 24-hour service window for owner↔bot conversation. The only template needed is the AUTHENTICATION template for phone verification, which is straightforward to approve. |
| Storing WhatsApp media permanently | Keeping received audio/image files in Supabase Storage creates GDPR/privacy exposure, storage costs, and no additional value after processing | Download → process → discard. Only the transcription and analysis results are persisted, consistent with the existing web app pipeline. |
| Dual provider in production (Meta + Twilio simultaneously) | Supporting both Cloud API and Twilio for the same company creates dual-state complexity in webhook routing and credential management | Pick one provider per platform configuration. Meta Cloud API direct is recommended for production (no per-message intermediary fee). Twilio sandbox may be used during development only. |
| Proactive outbound messages to owner (digests, reminders) | Business-initiated messages require pre-approved UTILITY templates; approval adds delay; not a user-requested feature for MVP | Bot only responds to inbound. Owner initiates the conversation. |

---

## Feature Dependencies

```
[Platform prerequisite — must happen before any customer can use this]
Meta Business Verification (Xtimator the platform, one-time)
  → Embedded Signup available to customers
    → Phone number registration UI (/settings/integrations)
      → Owner completes Embedded Signup or manual registration
        → Meta OTP verification confirms ownership
          → company_whatsapp record: status = "active"
            → Webhook routing: incoming from_number → company_id resolved

[Per-message inbound processing]
Inbound webhook receives message
  → HMAC-SHA256 signature verified
    → Deduplication check (wamid ID not seen before)
      → from_number routed to company record
        → Message type dispatched:
            text:  transcript = message.text.body
            audio: two-step media download → OGG buffer → Whisper → transcript [NEW download step]
            image: two-step media download → JPEG buffer → analyze-photos API → photo_analysis [NEW download step]
          → generate-estimate API called programmatically (reuse existing route)
            → Draft project + estimate created in DB
              → Session record created: state="awaiting_confirm", draft_estimate_id, expires_at=+30min
                → Confirmation summary sent to owner via WhatsApp
                  (uses buildItemsBreakdown() + resolveTemplate() from lib/utils/estimate-template.ts)
                  (optional: interactive buttons: Send / Cancel)

[Per-message confirmation handling]
Owner replies "send" (or taps Send button)
  → Session loaded (not expired)
    → Outbound delivery to client:
        text:  resolveTemplate() → POST to Meta messages API (client number)
        link:  share link URL appended to text message
        PDF:   generate PDF buffer → upload to Meta media API → send document message
              [NOTE: if client has never messaged bot, template required for client delivery]
    → Session deleted
    → Estimate status updated to "sent"

Owner replies "cancel" (or taps Cancel button)
  → Session deleted
  → Draft estimate/project status set to cancelled or deleted

Session expires (30 minutes, no reply)
  → pg_cron cleanup job (existing cron pattern) deletes expired sessions
  → Bot may optionally send "Your draft expired" message if owner later messages

[Existing pipeline — unchanged, just called differently]
generate-estimate API route → Claude estimate generation (unchanged)
analyze-photos API route → Claude Vision (unchanged)
Whisper transcription server-side (unchanged)
buildItemsBreakdown() utility (unchanged)
resolveTemplate() utility (unchanged)
/api/estimates/[id]/pdf → PDF buffer (unchanged)
/estimate/[token] → share link (unchanged)
```

---

## MVP Recommendation

Build in this phase order. Each phase is independently testable.

**Phase 1 — Webhook Infrastructure**
Priority: blocking all other work.
- `company_whatsapp` table: `(company_id, phone_number E.164, status, verified_at, meta_phone_number_id, meta_waba_id, access_token_encrypted)`
- `whatsapp_sessions` table: `(company_id, phone_number, state, draft_project_id, draft_estimate_id, expires_at)`
- `whatsapp_processed_messages` table: `(message_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ)` — deduplication store
- `POST /api/webhooks/whatsapp` — HMAC-SHA256 verify → 200 immediately → async dispatch
- `GET /api/webhooks/whatsapp` — hub.challenge verification handshake
- Phone number → company routing function
- Meta Cloud API credentials stored via existing `platform_integrations` encrypted key pattern (same AES-256-GCM as other API keys)

**Phase 2 — Inbound Processing**
Priority: core value delivery.
- Text message → programmatic project creation → `generate-estimate` API call → session created
- Audio message → two-step media download → Whisper transcription → same pipeline
- Image message → two-step media download → `analyze-photos` → same pipeline
- `buildItemsBreakdown()` + `resolveTemplate()` for confirmation summary formatting
- Send confirmation text back to owner (plain text first; interactive buttons as improvement)

**Phase 3 — Confirmation Flow + Delivery**
Priority: completing the loop.
- "send" command handler → outbound to client (plain text + share link as default)
- "cancel" command handler → session and draft cleanup
- Session expiry enforcement (hook into existing pg_cron cron pattern)
- Interactive reply buttons for Send / Cancel (upgrade from text commands)

**Phase 4 — Settings + Admin**
Priority: operator self-service.
- `/settings/integrations` WhatsApp card: status, Connect button, disconnect
- Phone number registration + OTP verification flow
- Delivery format preference setting (text / link / text+link)
- Admin panel: per-company WhatsApp status and usage visibility

**Defer to post-MVP:**
- PDF attachment outbound (upload-to-Meta complexity + template requirement for client delivery)
- "edit [item]" command (complex command parser + `refineEstimate` pipeline integration)
- Multi-input session accumulation (audio + photo before generating)
- "client [name]" command for mid-flow client assignment
- Proactive owner messages (digest, expiry notice) — template approval overhead

---

## Meta-Specific Behavior: Platform-Level Blockers

These are not feature choices — they are platform constraints that gate the milestone.

**Meta Business Verification (Xtimator platform account)**
- Required before Embedded Signup is available to Xtimator's customers.
- Timeline: 1-7 business days typical, up to 14 in edge cases.
- Requirements: legal business name, business website, Meta Business Manager account.
- This must be initiated before any development work on customer-facing phone registration.
- Confidence: MEDIUM (multiple sources agree; exact current timeline varies).

**Embedded Signup (recommended) vs Manual Registration**
- Manual registration: developer adds numbers in Meta Business Manager. Works for internal testing but requires Xtimator to own all tenants' numbers under one WABA — wrong architecture for SaaS.
- Embedded Signup: Meta's official OAuth-style onboarding for SaaS platforms. The owner goes through a Meta popup that grants Xtimator access to their WABA. Platform receives `phone_number_id`, `waba_id`, and a scoped access token. This is the correct multi-tenant architecture.
- Recommendation: build the settings UI around Embedded Signup from the start.

**Phone Number Constraint**
- A number already registered on WhatsApp personal or WhatsApp Business App must be de-registered before being added to the Cloud API — unless WhatsApp Coexistence is used.
- WhatsApp Coexistence (2025): allows a number to exist in both WhatsApp Business App and Cloud API simultaneously. Must be enrolled via Embedded Signup. Confidence: MEDIUM (community-confirmed; not fetched directly from official Meta docs).
- This is a UX friction point for owners using their existing business number. Document it prominently in the setup flow.

**Client Outbound Template Requirement**
- Sending an estimate to a client's WhatsApp number is a business-initiated message. If the client has not messaged the bot's number first, a pre-approved template is required.
- For v2.0 scope: use share link as the primary client delivery mechanism (no template needed — it is a URL in a text, and the bot sends it within the owner's 24-hour window to the owner who then decides). Alternatively, deliver to client number using a UTILITY template.
- The plain text "here is your estimate" to the client requires a UTILITY template to be approved before launch if sending directly to client numbers.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Webhook payload structure and field paths | HIGH | Exact JSON confirmed from Meta official Node.js SDK docs + community implementation article |
| Two-step media download flow | HIGH | Confirmed from multiple sources including Meta docs reference and community tutorials |
| 24-hour service window rules | HIGH | Consistently documented across multiple authoritative sources |
| Interactive buttons (no template needed in window) | HIGH | Official Meta docs confirm this |
| Idempotency / at-least-once delivery | HIGH | Well-documented, widely confirmed |
| OGG audio from WhatsApp + Whisper compatibility | MEDIUM | Whisper OGG support documented; practical confirmation needed in implementation testing |
| Embedded Signup multi-tenant flow | MEDIUM | Described in Meta developer docs; full current UI flow not verified directly |
| WhatsApp Coexistence (existing number + API) | MEDIUM | Community-confirmed 2025 feature; official Meta docs not directly fetched |
| Meta Business Verification timeline | MEDIUM | Range 1-14 days from multiple sources; exact current timeline varies |
| Client outbound template requirement | HIGH | Confirmed: business-initiated to numbers that have not messaged first requires a template |
| PDF document message (outbound) | MEDIUM | Document message type is confirmed; upload-then-send pattern confirmed conceptually; not tested end-to-end |

---

## Sources

- Meta WhatsApp Cloud API webhook payload — confirmed via [WhatsApp Node.js SDK media reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/audio/) and community implementation
- Media download two-step flow — [Medium: Downloading media using WhatsApp Cloud API webhooks (NodeJS)](https://medium.com/@shreyas.sreedhar/downloading-media-using-whatsapps-cloud-api-webhooks-and-uploading-it-to-aws-s3-bucket-via-nodejs-07c5cbae896f)
- Interactive reply buttons — [Meta for Developers: Interactive reply buttons](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages/)
- Webhook idempotency and scalable architecture — [Chat Architect: Building a Scalable Webhook Architecture](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions), [Hookdeck: Guide to WhatsApp Webhooks](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- 24-hour service window and messaging limits — [Meta for Developers: Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits/), [WhatsApp Business Platform 24 Hour Rule — Enchant](https://www.enchant.com/whatsapp-business-platform-24-hour-rule)
- Embedded Signup overview — [Meta for Developers: Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- Phone number registration — [Meta for Developers: Register a Business Phone Number](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration/)
- Meta Business Verification timeline — [Interakt: WhatsApp Business API Account Approval Time](https://www.interakt.shop/whatsapp-business-api/account-approval/)
- WhatsApp Coexistence — [WANotifier: WhatsApp Coexistence Guide](https://wanotifier.com/whatsapp-coexistence-guide/)
- Session state management patterns — [DEV Community: State Management Patterns for AI Agents](https://dev.to/inboryn_99399f96579fcd705/state-management-patterns-for-long-running-ai-agents-redis-vs-statefulsets-vs-external-databases-39c5)
- PDF document messages — [Meta for Developers: Document messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages/)
- SEED-008 product spec — `.planning/seeds/SEED-008-whatsapp-estimate-channel.md` (HIGH confidence, primary spec)
- Existing codebase — `lib/utils/estimate-template.ts`, `lib/ai/provider.interface.ts`, `app/api/` route inventory (HIGH confidence, direct code read)
