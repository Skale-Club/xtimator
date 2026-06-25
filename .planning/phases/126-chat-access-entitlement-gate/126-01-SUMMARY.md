---
phase: 126-chat-access-entitlement-gate
plan: 01
subsystem: entitlements / chat-backend
tags: [entitlements, chat, security-boundary, 403-gate, CHATMETER-02]
requires:
  - lib/entitlements.ts (existing per-tier Entitlements shape)
  - app/api/chat/route.ts (Phase 124/125 chat backend — stream + persistence)
provides:
  - chatEnabled per-tier entitlement flag (free=false; trial/pro/business=true)
  - POST /api/chat 403 chat_not_on_plan security-boundary gate before model resolution
affects:
  - Plan 02 (page gate — additive UX, reads the same chatEnabled flag)
tech-stack:
  added: []
  patterns:
    - send-whatsapp 403 channel-gate precedent reused for chat
    - bare new Response(...) JSON 403 matching the route's 401/400 style
    - as const satisfies Record<TierName, Entitlements> forces tier completeness
key-files:
  created: []
  modified:
    - lib/entitlements.ts
    - tests/unit/entitlements.test.ts
    - app/api/chat/route.ts
    - tests/unit/chat/route.test.ts
decisions:
  - "chatEnabled gate placed at the route (security boundary) BEFORE resolveChatModel/buildChatTools/streamText — an unentitled tenant triggers zero model build"
  - "trial gets chat (true) to showcase the feature, mirroring the paid-access posture of every flag except customDomainEnabled"
metrics:
  duration: ~5 min
  completed: 2026-06-25
  tasks: 2
  files: 4
---

# Phase 126 Plan 01: Chat Entitlement (chatEnabled flag + /api/chat 403 gate) Summary

Added a `chatEnabled` per-tier entitlement flag (free=false; trial/pro/business=true) and enforced it at the security boundary — a `403 chat_not_on_plan` gate in `POST /api/chat` that runs before any model resolution or tool build, so free-tier traffic is blocked before Xtimator spends on an OpenRouter call. This is the REQUIRED enforcement layer; the Plan 02 page gate is additive UX only.

## What Was Built

### Task 1 — chatEnabled flag (commit 6c0cf457)
- Added `chatEnabled: boolean` to the `Entitlements` type with a CHATMETER-02 comment.
- Set it on all 4 tier literals: `free=false`, `trial=true`, `pro=true`, `business=true`. The existing `as const satisfies Record<TierName, Entitlements>` enforced completeness — TypeScript would have failed compilation if any tier was missed.
- Extended `tests/unit/entitlements.test.ts` with literal + resolver assertions (including `getEntitlements('garbage').chatEnabled === false` fallback).

### Task 2 — /api/chat 403 gate (commit 432eab17)
- Imported `getEntitlements`; added `tier` to the existing `companies` `.select('industries, default_estimate_language, tier')`.
- Inserted the gate immediately after the industries/language derivation, BEFORE `req.json()`/`resolveChatModel`/`buildChatTools`/`streamText`: when `!getEntitlements(tier).chatEnabled`, returns a bare `new Response` with `{ error: 'chat_not_on_plan', upgradeUrl: '/settings/billing' }`, status 403, JSON content-type (matching the file's 401/400 style and the send-whatsapp 403 precedent).
- Extended `tests/unit/chat/route.test.ts`: changed the `beforeEach` default companies row to `tier: 'pro'` (keeps existing 200/stream tests passing); added a 403-free case (asserts `buildChatTools` and `resolveChatModel` are NOT called) and an explicit 200-pro stream case.

## Verification

- `npx vitest run tests/unit/entitlements.test.ts tests/unit/chat` — 15 files / 112 tests green.
- Full chat suite (14 files / 86 tests) green, including the Phase-125 scope-fence test (`chat-ui-scope.test.ts`) — unaffected by the gate insertion.
- grep confirms: `chat_not_on_plan`, `getEntitlements(tier).chatEnabled`, `default_estimate_language, tier` all present; `chatEnabled` = 5 hits in entitlements.ts (1 type + 4 tiers), 3 true / 1 false.
- `npx tsc --noEmit` reports no errors in `lib/entitlements.ts` or `app/api/chat/route.ts`.

## Deviations from Plan

None - plan executed exactly as written.

Note on TDD commit granularity: Task 1's RED (failing test) and GREEN (flag) were committed together as a single `feat` rather than as a separate `test` commit, because the `as const satisfies` in `lib/entitlements.ts` means a test referencing `chatEnabled` cannot fail in isolation without the type change present — a standalone RED commit on this file would not represent a meaningful intermediate state. RED was verified locally (6 failing assertions) before the GREEN edit. Task 2 followed the same single-commit pattern with RED verified before GREEN.

## Known Stubs

None. No hardcoded empty values, placeholders, or unwired data sources introduced. The gate is fully wired (reads the real `tier` from the companies row through `getEntitlements`).

## Self-Check: PASSED

- FOUND: lib/entitlements.ts (chatEnabled on type + 4 tiers)
- FOUND: app/api/chat/route.ts (chat_not_on_plan gate)
- FOUND: tests/unit/entitlements.test.ts, tests/unit/chat/route.test.ts
- FOUND commit: 6c0cf457 (Task 1)
- FOUND commit: 432eab17 (Task 2)
