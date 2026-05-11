---
id: SEED-010
status: harvested
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
harvested: 2026-05-11
harvested_in: v2.1 Phase 48 (WhatsApp Multi-Message Debounce)
harvest_completeness: Full — Redis buffer + 5s debounce + processInboundMessages (plural) + fail-open to single-message when Redis unavailable
trigger_when: When iterating on WhatsApp UX, planning a v2.x WhatsApp milestone, or addressing user complaints about "second message blocked"
scope: Medium
---

# SEED-010: WhatsApp Multi-Message Debounce Buffer

## Why This Matters

The current Xtimator WhatsApp flow **assumes the user sends a single message per estimate**. In reality, a contractor walking through a job site naturally sends a sequence:

```
[18:32:01] 🎙️ audio describing the kitchen
[18:32:18] 📸 photo of the sink
[18:32:34] 📸 photo of the counter
[18:33:02] 🎙️ audio describing the living room
[18:33:24] ✍️ "forgot — there's a broken tile in the bathroom"
```

**What the system does today** (`lib/whatsapp/handler.ts:126`):
1. First message (audio) arrives → creates project → transcribes → generates estimate immediately
2. Session enters `awaiting_confirm`
3. All subsequent messages are **blocked** with "Reply *send* or *cancel*"

The contractor receives an estimate based **only on the kitchen**, and the other 4 messages are wasted. To get the complete estimate, they have to cancel and start over — repeating all the input. UX is broken for the real use case.

## The Solution: Redis Debounce

Inspired by the legacy n8n + Chatwoot + Upstash project, the webhook doesn't process each message immediately. Instead:

```
Message arrives
  ↓
PUSH to Redis buffer (key = phone_number)
  ↓
Wait 500ms (let Redis stabilize)
  ↓
GET buffer
  ↓
Is this the latest message? (id == last(buffer).id)
  ├─ No → discard (a newer one will process)
  └─ Yes → Is last msg >5s old? (user stopped typing?)
      ├─ No → wait + loop
      └─ Yes → DELETE buffer + process ALL messages together
```

Aggregated processing:
- Concatenate all transcribed audios
- Include all analyzed photos
- Include all texts
- Generate **one complete estimate** from everything

## Configuration

```typescript
const DEBOUNCE_WAIT_MS = 5_000   // silence time before processing
const BUFFER_TTL_SECONDS = 120   // expire buffer if something goes wrong
const STABILIZE_WAIT_MS = 500    // initial wait before first check
```

5 seconds is the sweet spot from the original n8n setup — long enough for the user to finish recording/taking photos, short enough to not feel stuck.

## Edge Cases

- **Cancellation during buffer**: if "cancel" arrives while buffering, process the cancel immediately.
- **Orphaned buffer**: 2-minute TTL on Redis ensures stuck buffers get cleaned automatically.
- **Multiple workers**: use `Redis WATCH/MULTI` or a distributed lock to prevent two workers processing the same buffer.
- **Confirmation during active buffer**: if session is already `awaiting_confirm` and a new non-send/cancel message arrives — currently blocked. With debounce, consider treating it as input for refinement (integrates with SEED-006).

## Stack

- **Upstash Redis** — managed, serverless, integrates directly with Vercel
- Client already has a usage pattern from the legacy project
- Environment variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## Scope Estimate

**Medium** — 1 phase, ~2-3 days:

1. Setup Upstash Redis + client in `lib/redis.ts`
2. Refactor `app/api/webhooks/whatsapp/route.ts` to PUSH instead of processing directly
3. Create `lib/whatsapp/buffer.ts` with debounce logic
4. Refactor `processInboundMessage()` to accept an **array** of messages
5. Refactor `generate-estimate` to accept aggregated input (text + audios + photos together)
6. Tests: simulate sequence of messages, ensure 1 final estimate
7. Observability: log how many messages each buffer aggregated (usage metric)

## Breadcrumbs

- `lib/whatsapp/handler.ts:30-55` — current session check logic; point where the "reply send/cancel" early return needs to become aggregation
- `lib/whatsapp/handler.ts:87-110` — switch by message type (text/audio/image); becomes a loop over the array
- `lib/whatsapp/handler.ts:126` — `generateEstimateForProject()` called once per message; becomes once per buffer
- `lib/services/generate-estimate.ts` — accepts a project with multiple recordings + photos; already compatible with aggregated input, just needs to actually use EVERYTHING
- `app/api/webhooks/whatsapp/route.ts:53` — `after()` fire-and-forget; keep it, but call `processBuffer()` instead of `handleInboundMessage()`
- `lib/whatsapp/confirm.ts` — `awaiting_confirm` session stays the same; debounce only affects input before confirmation

## Notes

- This seed **fixes** broken behavior — it's not a new feature. Could ship as a hotfix in v2.1.
- Consider combining with SEED-011 (typing indicator) — during the buffer (5s+), sending `typing_indicator` keeps the user reassured that something is happening.
- The estimate generated from aggregated input will be **much better** than the current one — Claude has more context. That's an upside beyond just fixing the UX.
- Integration with SEED-006 (iterative refinement): after confirmation, additional messages enter refine mode. Before confirmation, they enter the buffer.
