# Phase 51: WhatsApp Pre-Send Edit Commands — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-015 Gap 1 (MVP subset — see Open Follow-ups for deferred section/item commands)

## What was built

Structured command parser + dispatcher for editing an estimate via WhatsApp while in `awaiting_confirm`. Owner no longer has to cancel and re-record everything when they spot a mistake.

### Files created

- `lib/whatsapp/edit-commands.ts` — typed parser (`parseEditCommand`) + help text
- `tests/unit/whatsapp/edit-commands.test.ts` — 33 unit tests covering all parser branches

### Files modified

- `lib/whatsapp/confirm.ts` — `processConfirmationReply` now dispatches on the full set of commands; new handlers for `handleEditField` (total/timeline/payment/summary), `handleSetClient`, `handleRegenerate`; legacy `handleSend` / `handleCancel` unchanged
- `tests/unit/whatsapp/confirm.test.ts` — help-message regex updated for the new multi-line text

## Commands supported

| Command | Effect |
|---|---|
| `send` | Deliver to client (unchanged) |
| `cancel` | Discard draft (unchanged) |
| `edit total 450` | Set `estimate.total` (accepts `$`, commas, decimals) |
| `edit timeline "Job in 2 days"` | Set `estimate.timeline` (quoted or rest-of-line) |
| `edit payment "50% upfront"` | Set `estimate.payment_terms` |
| `edit summary "..."` | Set `estimate.summary` |
| `client "Maria Silva" +15552223333` | Upsert client + link to project |
| `regenerate` (alias: `regen`) | Delete current estimate, run `generateEstimateForProject` again |
| anything else | Help message listing all commands |

After every successful edit, the **updated summary is re-sent** to the owner with a prefix like `✏️ *Updated* — $450` so they see the new state. Session stays in `awaiting_confirm`.

## Key design decisions

- **Single parser function returns a typed union** — `ParsedCommand` discriminates on `kind`; the dispatcher is a clean `switch` with exhaustive type checking.
- **Smart quotes accepted** — `"`, `“”`, `''` all work. iPhone autocorrect won't break commands.
- **Phone normalization is generous** — `(555) 222-3333` and `+5552223333` both parse to E.164. Owner can paste from anywhere.
- **Unquoted rest-of-line for free-text fields** — `edit timeline two days` works without quotes. Reduces friction for fast WhatsApp typing.
- **Unknown commands → help message** — never silently ignore. User always knows what's available.
- **`regenerate` deletes the old estimate** — the new one becomes the session's `draft_estimate_id`. Old sections/items cascade-delete automatically.

## What's NOT included (deferred to follow-up)

The original SEED-015 Gap 1 also proposed:
- `edit item 2.3 price 85` — needs the confirmation message to include item numbering (e.g., "*Section 1.* Living Room\n  1.1 Vacuuming — $50\n  1.2 Stain treatment — $75")
- `edit section 1 "New Title"` — same numbering dependency
- `add item ...` / `remove item ...` — same
- Optional LLM agent for fuzzy commands ("increase bedroom prices by 10%") — Claude Haiku integration

These were intentionally deferred because:
1. The numbering UX change ripples into `lib/whatsapp/handler.ts` confirmation builder + `lib/whatsapp/formatter.ts` outbound delivery formatter
2. The fuzzy/LLM agent has its own quality/cost dimensions worth a dedicated phase
3. The MVP commands shipped here cover **the 80% case**: change a price, fix the timeline, fix payment terms, add the client info you forgot, or just regenerate from scratch

These are tracked as follow-up in the **Open Follow-ups** section of `SEED-015` (which remains dormant for the deferred items).

## Success criteria

| Criterion | Status |
|---|---|
| `edit total/timeline/payment/summary` mutate the estimate, re-send summary | ✅ |
| `client "Name" phone` upserts + links | ✅ |
| `regenerate` rebuilds via the existing pipeline | ✅ |
| Invalid commands return contextual help | ✅ |
| Session stays in `awaiting_confirm` across edits | ✅ |
| Case-insensitive + smart-quote support | ✅ |
| Test coverage | ✅ 98/98 WhatsApp tests passing |

## Open follow-ups

- Section / item-level commands (`edit item X.Y`, `add item ...`, `remove item ...`) — see "What's NOT included" above
- LLM-powered fuzzy command interpretation (`"increase bedrooms 10%"`) — Claude Haiku
- i18n of the help message — covered by SEED-001's translation pipeline
- Confirmation message could show command hint on first send (e.g., "Need to fix something? Try *edit total 500* or *edit timeline*")
