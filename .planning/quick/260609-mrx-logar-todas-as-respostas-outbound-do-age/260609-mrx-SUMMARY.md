---
phase: quick-260609-mrx
plan: 01
subsystem: whatsapp
tags: [whatsapp, observability, conversation-thread, logging]
requires:
  - lib/whatsapp/conversations.ts logOutboundMessage
  - lib/supabase/service requireServiceClient
provides:
  - All 5 unlogged outbound bot replies now persist to whatsapp_messages
affects:
  - admin WhatsApp conversation thread (now a complete outbound record)
tech-stack:
  added: []
  patterns:
    - "best-effort outbound logging: logOutboundMessage(svc, {...}).catch(() => undefined)"
    - "service-role client required (whatsapp_* tables RLS deny-all)"
key-files:
  created: []
  modified:
    - lib/whatsapp/send-welcome.ts
    - lib/whatsapp/handler.ts
    - app/api/cron/cleanup-whatsapp-sessions/route.ts
    - lib/errors/whatsapp.ts
    - lib/inngest/functions/whatsapp-process.ts
decisions:
  - "handleWhatsAppError logging param is optional (opts?: { svc?; companyId? }) — backward-compatible, logs only when both present"
  - "cron session select extended to include company_id (previously absent) so the expiry reminder can attach to a conversation"
  - "unknown-sender 'no account' reply (webhooks/whatsapp/route.ts:191) left UNLOGGED by design — company_id unresolved, no conversation to attach to"
metrics:
  duration: ~10m
  completed: 2026-06-09
---

# Phase quick-260609-mrx Plan 01: Log all outbound agent WhatsApp replies Summary

Added best-effort `logOutboundMessage(...)` calls at the 5 outbound bot/agent WhatsApp send sites that previously sent via `sendWhatsAppMessage(...)` without persisting to `whatsapp_messages`, so every agent reply now appears in the admin conversation thread. No DB migration — the existing helper + tables suffice.

## What Changed

The 5 outbound send sites, all mirroring the existing `lib/whatsapp/intent-router.ts` pattern (`msgType: 'text'`, `status: 'sent'`, best-effort `.catch(() => undefined)`):

1. **lib/whatsapp/send-welcome.ts** (`welcomeOnFirstContact`) — logs `WELCOME_TEXT` after `sendWhatsAppWelcome(toPhone)`. Service client + companyId already in scope. Bare `sendWhatsAppWelcome` helper left unlogged (no companyId there).
2. **lib/whatsapp/handler.ts** (free-tier rejection, `processInboundMessages`) — captured the rejection body in a const, sends + logs it. Added the `@/lib/whatsapp/conversations` import (handler.ts did not previously import it). Uses the in-scope service `supabase`, `companyId`, `ownerPhone`.
3. **app/api/cron/cleanup-whatsapp-sessions/route.ts** (expiry reminder) — captured reminder body in a const, logs after the send inside the existing non-fatal `try`. **The session `.select(...)` was extended to add `company_id`** (it previously selected only `id, phone_number, draft_project_id`). Uses the in-scope `requireServiceClient()`.
4. **lib/errors/whatsapp.ts** (`handleWhatsAppError`) — gained a backward-compatible optional `opts?: { svc?: SupabaseClient; companyId?: string }` param; logs the error body only when **both** `svc` and `companyId` are provided.
5. **lib/inngest/functions/whatsapp-process.ts** (`sendFallbackReply`, called from `onFailure`) — accepts an optional `companyId`, logs `FALLBACK_ERROR_REPLY` via `requireServiceClient()` after the send; `onFailure` now passes `payload.companyId` (already present on `WhatsAppProcessPayload`).

The helper used at every site is `logOutboundMessage` from `lib/whatsapp/conversations.ts`, always with a service-role client (the `whatsapp_*` tables are RLS deny-all).

## Cron Select Extension

`app/api/cron/cleanup-whatsapp-sessions/route.ts` previously selected `id, phone_number, draft_project_id`. To log the expiry reminder the select now also includes `company_id` — `session.company_id` is the companyId, `session.phone_number` is the recipient.

## handleWhatsAppError Backward-Compatibility & No Callers

`handleWhatsAppError` now accepts an optional third argument `opts?: { svc?; companyId? }`. Existing 2-arg callers compile unchanged and the unit tests (`tests/unit/errors/whatsapp-adapter.test.ts`, 6 tests) still pass untouched.

A grep across the codebase confirmed there are currently **ZERO production callers** of `handleWhatsAppError` — the only references are its own definition (`lib/errors/whatsapp.ts`), the unit test, and `.planning/` docs (PLAN, ROADMAP, SEED-014, 46-SUMMARY, v3.0/v2.1 milestone docs). So no call-site threading was needed; the optional param is in place for future callers that have `svc` + `companyId` in scope.

## Intentional Exclusion

`app/api/webhooks/whatsapp/route.ts:191` — the unknown-sender "couldn't find an Xtimator account" reply — is **intentionally left unlogged**. At that point the sender's `company_id` is unresolved (unknown sender), so there is no conversation to attach the message to. This is by design, not an oversight.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` (with `NODE_OPTIONS=--max-old-space-size=8192`): no new errors. Only the documented pre-existing errors in `tests/unit/notifications/account-emails.test.ts` remain (not touched).
- `npx vitest run tests/unit/errors/whatsapp-adapter.test.ts`: 6/6 passed — the 2-arg `handleWhatsAppError` calls still pass with the new optional param.
- Reasoning check: each of the 5 sites now calls `logOutboundMessage` best-effort after a successful send, so every outbound reply lands in `whatsapp_messages` (direction outbound) and appears in the admin thread. No existing send is blocked, reordered destructively, or made to throw.

## Commits

- `7d8cb77` feat(quick-260609-mrx): log welcome, free-tier rejection, cron expiry outbound
- `d985537` feat(quick-260609-mrx): log handleWhatsAppError + Inngest fallback outbound

## Self-Check: PASSED
- lib/whatsapp/send-welcome.ts — FOUND (logOutboundMessage present)
- lib/whatsapp/handler.ts — FOUND (logOutboundMessage present)
- app/api/cron/cleanup-whatsapp-sessions/route.ts — FOUND (logOutboundMessage + company_id select)
- lib/errors/whatsapp.ts — FOUND (opts param + logOutboundMessage)
- lib/inngest/functions/whatsapp-process.ts — FOUND (sendFallbackReply companyId + logOutboundMessage)
- Commit 7d8cb77 — FOUND
- Commit d985537 — FOUND
