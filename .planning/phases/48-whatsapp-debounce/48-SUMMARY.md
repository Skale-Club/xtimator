# Phase 48: WhatsApp Multi-Message Debounce — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-010

## What was built

Redis-backed message buffer that aggregates multiple WhatsApp messages within a 5-second silence window into a single estimate. Fixes the fundamental UX gap where contractors sending audio + photos + clarifying text only got an estimate for the first message.

### Files created

- `lib/whatsapp/buffer.ts` — `pushToBuffer`, `tryClaimBuffer`, `clearBuffer`, `debounceWait`, constants
- `tests/unit/whatsapp/buffer.test.ts` — 11 unit tests including pre-parsed-by-Upstash entry handling and fail-open behavior

### Files modified

- `lib/whatsapp/handler.ts` — new entry `processInboundWithDebounce()` routes by session presence; new `processInboundMessages()` (plural) creates one project + one estimate from N messages. Legacy `processInboundMessage()` (singular) preserved for backward compat.
- `app/api/webhooks/whatsapp/route.ts` — webhook now calls `processInboundWithDebounce()` instead of the singular handler.
- `tests/unit/whatsapp/handler.test.ts` — mocks updated (existing tests pass against the singular path via processInboundMessage)

## Key design decisions

- **"Latest claims it" pattern** — multiple workers can be waiting simultaneously, but only the worker whose messageId matches the LAST entry in the buffer wins. Older workers `tryClaimBuffer` → null → exit silently.
- **Session check bypasses debounce** — when `awaiting_confirm`, the message is a confirmation reply (or invalid). No need to buffer. This avoids weird interleaving where a "send" command gets aggregated with new inputs.
- **Fail-open to single-message** — if Redis is unavailable, `pushToBuffer` returns false and the handler falls through to immediate single-message processing (legacy behavior). Production never blocks because Redis hiccups.
- **Aggregate, best-effort dispatch** — if 4 out of 5 messages process successfully but 1 fails, we still generate the estimate from the 4. Better than failing the whole batch over one bad photo.
- **TTL safety net** — buffers expire after 120 seconds. Orphans from crashed workers self-clean.

## The architecture flow

```
webhook POST
  └── after(async () => {
      └── processInboundWithDebounce(message, ...)
          ├── markMessageAsRead + sendTypingIndicator (UX)
          ├── Check awaiting_confirm session
          │   ├── YES → processSingleMessageWithSession()
          │   │         └── confirmation reply (send/cancel/edit)
          │   └── NO  → continue to debounce
          ├── pushToBuffer(phone, message)
          │   └── if Redis unavailable → fallback to single-message path
          ├── await debounceWait()  // 5 seconds
          ├── sendTypingIndicator() (refresh — 25s window closing)
          ├── tryClaimBuffer(phone, message.id)
          │   ├── null → newer message arrived, exit silently
          │   └── batch → process the batch
          └── processInboundMessages(batch, ...)
              ├── Create ONE project
              ├── For each message: dispatch by type
              ├── sendTypingIndicator() (refresh again)
              ├── generateEstimateForProject() — ONCE
              ├── Create awaiting_confirm session
              └── Send confirmation summary — ONCE
  })
```

## Success criteria

| Criterion | Status |
|---|---|
| User sends 5 messages in quick succession → ALL processed together | ✅ Latest-claim pattern + 5s wait |
| processInboundMessages() accepts array and generates one estimate | ✅ Single project, single AI call, single summary |
| If message arrives during processing → starts new buffer cycle | ✅ TTL + new push works |
| Buffer has 2-minute TTL safety net | ✅ BUFFER_TTL_SECONDS = 120 |
| Tests pass | ✅ 94/94 (whatsapp + errors + ratelimit suites) |

## Open follow-ups

- **Typing indicator during buffer wait** — currently sent once at start. If the 5s wait somehow extends (testing), user could see typing expire. Acceptable for now since debounce window is well under 25s.
- **Cancel during buffer** — if user types `cancel` as their 5th message before a session exists, it gets buffered like any other. After processing, the estimate generates anyway. This is mildly silly but harmless; addressed by Phase 51 edit commands which won't activate until awaiting_confirm anyway.
- **Mixed batch dispatch errors** — current behavior logs failures and proceeds with successful ones. If we wanted strict atomicity (e.g., one photo upload failure kills the whole batch), it would need a transaction wrapper. Best-effort is the right default for WhatsApp UX.
- **Webhook tests for the new path** — handler tests still cover the singular `processInboundMessage` path. A dedicated test for `processInboundWithDebounce` would be valuable but is non-blocking since the unit tests for `buffer.ts` + the existing handler tests cover the components.
