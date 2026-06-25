---
phase: 123-chat-persistence-schema-history
plan: 02
subsystem: chat-persistence
tags: [chat, queries, tenant-scoping, service-client, tdd]
requires:
  - chat_conversations
  - chat_messages
  - getActiveCompanyId
  - createServiceClient
provides:
  - lib/queries/chat.ts
  - listConversations
  - getConversationWithMessages
  - createConversation
  - appendMessage
  - CHATDB-02
affects:
  - lib/queries
tech-stack:
  added: []
  patterns:
    - "Service-client read+write helpers scoped to getActiveCompanyId() internally (no trusted tenant arg), mirroring lib/queries/whatsapp-inbox.ts"
    - "Owner-narrowed conversations (.eq company_id + .eq user_id); denormalized company_id on messages for a direct tenant gate"
    - "appendMessage bumps the parent conversation updated_at after insert (mirrors whatsapp bumpConversation) so history re-sorts by recency"
key-files:
  created:
    - lib/queries/chat.ts
    - tests/unit/chat/chat-queries.test.ts
  modified: []
decisions:
  - "Helper path is service-role + explicit .eq scoping; RLS (Phase 123-01) stays as defense-in-depth — one consistent pattern Phase 124 writes through without RLS friction"
  - "Write helpers (createConversation/appendMessage) shipped now so the tables are ready-to-consume by Phase 124, not deferred to the backend phase"
  - "No caller-supplied company id is trusted — every helper resolves getActiveCompanyId() internally (5 references; 4 helpers + 1 doc)"
metrics:
  duration: "~5m"
  completed: "2026-06-25"
  tasks: 2
  files: 2
  commits: 2
---

# Phase 123 Plan 02: Chat Query Helpers Summary

CHATDB-02: `lib/queries/chat.ts` — the four tenant + owner-scoped read/write helpers (`listConversations`, `getConversationWithMessages`, `createConversation`, `appendMessage`) that make the Phase-123 chat tables ready-to-consume. Mirrors `lib/queries/whatsapp-inbox.ts` exactly: service client scoped to `getActiveCompanyId()` resolved internally, every query re-scoped by `company_id` (+ `user_id` for owner-only threads), and `appendMessage` bumps the parent `chat_conversations.updated_at` so new activity re-sorts to the top of the sidebar Phase 125 will render.

## What Shipped

- **`lib/queries/chat.ts`** (153 lines) — row types (`ChatRole`, `ChatConversationRow`, `ChatMessageRow`, `ChatThread`) + 4 helpers, each guarding on no-company / no-service-client with early null/[] returns (whatsapp-inbox guard style):
  - `listConversations(userId)` — `.eq('company_id', companyId).eq('user_id', userId).order('updated_at', { ascending: false }).limit(200)`; returns `[]` without touching the service client when there is no active company.
  - `getConversationWithMessages(conversationId, userId)` — conversation fetch scoped by `id` + `company_id` + `user_id` via `.maybeSingle()`; returns `null` (and does NOT query `chat_messages`) when not found/owned; otherwise fetches messages `.eq('conversation_id', …).order('created_at', { ascending: true }).limit(500)`.
  - `createConversation(userId, title = null)` — `.insert({ company_id, user_id, title }).select('*').single()`.
  - `appendMessage({ conversationId, role, parts, attachments? })` — inserts into `chat_messages` with the denormalized `company_id` + `parts ?? []` / `attachments ?? null`, THEN bumps `chat_conversations.updated_at` (scoped `.eq('id', …).eq('company_id', …)`); no-ops returning `null` when there is no active company.
- **`tests/unit/chat/chat-queries.test.ts`** — 7 `it()` cases over a chainable service-client mock that records every `.eq(col, val)`, the `.from(table)`, and `.insert`/`.update` payloads per query. Mocks BOTH `@/lib/queries/active-company` and `@/lib/supabase/service`. The literal `'company-SECRET'` is the cross-tenant tripwire asserted on the listConversations + conversation-fetch queries; `appendMessage` asserts BOTH the message insert (with `company_id`) AND the `updated_at` bump on the parent.

## TDD Flow

- **RED** (`8c620d04`): test committed first; failed with `Failed to resolve import "@/lib/queries/chat"` (module absent) — correct Wave-0 state.
- **GREEN** (`6ceaa50`): `lib/queries/chat.ts` authored to the plan's prescribed content; behavior test → 7/7 green.
- **REFACTOR**: none needed (content was prescribed verbatim; clean, no cleanup).

## Verification

- `npx vitest run tests/unit/chat/chat-queries.test.ts` → 7/7 green.
- Full suite: `npx vitest run` → **321 files passed | 3 skipped, 2251 passed | 2 skipped | 33 todo** (baseline 123-01 was 320 files / 2244 passed; +1 file / +7 — exactly this new suite). No regressions; the known parallel-only `mcp-route-contract.test.ts` flake did not surface this run.
- `grep -c 'getActiveCompanyId()' lib/queries/chat.ts` → 5 (4 helpers each resolve the tenant internally + 1 doc-comment); no caller-supplied company id is trusted.
- `appendMessage` contains BOTH an `.insert` into `chat_messages` AND an `.update({ updated_at })` on `chat_conversations`.
- `npx tsc --noEmit` → no errors in `lib/queries/chat.ts`.
- Scope fence honored: no route handler / AI SDK / UI introduced (Phases 124/125 OUT).
- gitleaks pre-commit clean on both commits; no secrets, no migration, no new dependency.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `8c620d04` — test(123-02): add failing chat-queries helper behavior contract (RED)
- `6ceaa50` — feat(123-02): implement chat query helpers (GREEN)

## Self-Check: PASSED
