# Phase 49: WhatsApp Typing + Read Receipts — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-011

## What was built

Two fire-and-forget Meta API calls that show the user immediate feedback during the 20-40s of AI processing:

1. **Mark as read** — blue checkmarks appear on user's phone (<1s after webhook received)
2. **Typing indicator** — "typing..." appears under Xtimator's name in the chat

### Files modified

- `lib/whatsapp/client.ts` — added `markMessageAsRead()` and `sendTypingIndicator()`. Both swallow Meta API errors (fire-and-forget).
- `lib/whatsapp/handler.ts` — calls both right at start of `processInboundMessage()`, re-sends typing before AI generation (since indicator lasts ~25s).
- `tests/unit/whatsapp/client.test.ts` — added 5 new tests for the two functions (success + error swallowing)
- `tests/unit/whatsapp/handler.test.ts` — added mock entries for the new functions (existing tests unchanged)

## Key design decisions

- **Fire-and-forget everywhere** — never let a typing/read failure block estimate generation. The `markMessageAsRead` and `sendTypingIndicator` functions catch all errors internally; callers don't need try/catch.
- **One re-send before AI generation** — typing indicator lasts ~25s on Meta's side. Re-sending once before `generateEstimateForProject()` covers the heaviest 30s window. For ultra-long generations we could spawn a refresh timer, but 1 re-send is a reasonable trade-off.
- **No re-send during download/transcription** — those operations are typically <10s, well within the 25s indicator lifetime. Adding more re-sends increases code complexity for negligible UX gain.
- **Tests use `vi.spyOn(console, 'warn')`** — silences expected warning output from error-swallowing paths without compromising error visibility in production logs.

## Success criteria

| Criterion | Status |
|---|---|
| Blue checks appear on user's phone immediately after dedup passes | ✅ `markMessageAsRead()` is called right after the existing-session check |
| Typing indicator appears before heavy processing | ✅ Called immediately after read receipt + re-sent before generate |
| Typing indicator re-sent before 25s timeout | ✅ Re-send happens between input processing and AI generation |
| Meta API failures don't block processing | ✅ All errors swallowed inside helper functions |
| Test coverage | ✅ 49/49 WhatsApp tests passing |

## Notes

- These calls are metadata — **no cost** against Meta's message quota.
- If `META_WHATSAPP_ACCESS_TOKEN` is missing, the fetch will likely 401 — swallowed silently. Production must have the token configured.
- Combines very well with Phase 48 (debounce) — during the 5s debounce buffer wait, the typing indicator keeps user reassured. Phase 48 will call these for the FIRST message of a buffer.
