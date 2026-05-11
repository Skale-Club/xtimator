---
id: SEED-011
status: dormant
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
trigger_when: When polishing WhatsApp UX, addressing perceived latency complaints, or planning a WhatsApp UX iteration milestone
scope: Small
---

# SEED-011: WhatsApp Conversational Polish (Typing & Read Receipts)

## Why This Matters

Generating an estimate via WhatsApp takes **20-40 seconds**:
- Audio download from Meta (~2s)
- Whisper transcription (~5-10s)
- Photo download and Vision analysis (~5-15s)
- Estimate generation by Claude (~8-15s)

During that time, from the user's perspective, **nothing happens**. No "message delivered" check, no "typing…", just silence. In WhatsApp conversations that silence signals that the other side hasn't seen the message or isn't responding — the user starts sending more messages, thinking the first one was lost.

Two simple Meta API calls solve this completely:

## The Implementation

### 1. Mark as Read

Right at the start of `handleInboundMessage()`, before any processing:

```typescript
await markMessageAsRead(message.id, phoneNumberId)
```

Result: WhatsApp's blue checkmark appears on the user's phone in <1s — confirms Xtimator received it.

Meta endpoint:
```
POST /{phone-number-id}/messages
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.XXX"
}
```

### 2. Typing Indicator

After the read receipt, send the typing indicator before starting heavy processing:

```typescript
await sendTypingIndicator(message.id, phoneNumberId)
```

Result: "typing…" appears under the name in the chat — signals that Xtimator is "thinking".

Meta endpoint (same call as read, with extra field):
```
POST /{phone-number-id}/messages
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.XXX",
  "typing_indicator": { "type": "text" }
}
```

The indicator lasts ~25s or until the first message is sent. If processing takes longer than that, send it again before timeout.

## Edge Cases

- **Processing error**: still send error response (cancels typing automatically).
- **Duplicate message (already processed)**: skip everything (we already responded; sending read would be weird).
- **Status webhook**: already ignored in `route.ts:48` — no change.
- **Multiple read receipts in debounce buffer (SEED-010)**: mark all buffered messages as read in batch when processing.

## Scope Estimate

**Small** — a few hours, 1 phase or even part of another:

1. Add 2 functions in `lib/whatsapp/client.ts`:
   - `markMessageAsRead(messageId, phoneNumberId)`
   - `sendTypingIndicator(messageId, phoneNumberId)`
2. Call `markMessageAsRead()` in `handler.ts` right after dedup check passes
3. Call `sendTypingIndicator()` before download/Whisper/Vision operations
4. Re-send typing indicator before timeout (25s) for long processing
5. Unit tests: mock Meta API, ensure read is called before processing, typing is called before heavy work

## Breadcrumbs

- `lib/whatsapp/client.ts` — add functions here; already has `sendWhatsAppMessage()` as auth/POST pattern reference
- `lib/whatsapp/handler.ts:80-86` — current start of `processInboundMessage()`; insertion point for mark-as-read after dedup
- `lib/whatsapp/handler.ts:87-110` — switch by message type; insert typing indicator before
- `app/api/webhooks/whatsapp/route.ts:91-98` — dedup check; only mark as read after confirming it's NOT a duplicate
- Meta API docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
- Meta API docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-reaction (typing)

## Notes

- This seed is **independent** of SEED-010 (debounce), but pairs very well with it — during the 5s+ buffer is exactly when the typing indicator makes the biggest difference.
- Mark-as-read **must come before** typing — natural WhatsApp order (message received → read → other side typing reply).
- Cost: zero. These calls don't count against Meta's message limit — they're metadata.
- Risk: none. If Meta API fails, the read/typing send is fire-and-forget — doesn't block processing.
- Enterprise-quality polish — subtle but perceptible difference between "functional bot" and "polished bot".
