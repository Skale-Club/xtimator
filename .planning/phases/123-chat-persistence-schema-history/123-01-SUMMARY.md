---
phase: 123-chat-persistence-schema-history
plan: 01
subsystem: chat-persistence
tags: [migration, rls, schema, chat, ai-sdk]
requires: [company_members, companies]
provides:
  - chat_conversations
  - chat_messages
  - CHATDB-01
affects:
  - supabase/migrations
tech-stack:
  added: []
  patterns:
    - "Two-table append-log mirroring whatsapp_inbox SHAPE (parent conversation + denormalized company_id message log)"
    - "Tenant-readable RLS via company_members + owner-narrowing by user_id = (select auth.uid()) (credit_ledger/phase82 posture, NOT whatsapp deny-all)"
    - "Static readFileSync migration-contract test (mirrors credit-ledger-migration.test.ts)"
key-files:
  created:
    - supabase/migrations/20260626000001_phase123_chat_persistence.sql
    - tests/unit/chat/chat-persistence-migration.test.ts
  modified: []
decisions:
  - "parts is JSONB NOT NULL DEFAULT '[]'::jsonb — the AI SDK UIMessage parts store"
  - "company_id denormalized onto chat_messages for a direct RLS gate (no join through conversation)"
  - "Append-only: SELECT-only policies; service role bypasses RLS for all writes"
  - "Authored-only — migration NOT applied to remote (deploy owned by CI->GHCR->Coolify)"
metrics:
  duration: "~4m"
  completed: "2026-06-25"
  tasks: 2
  files: 2
  commits: 2
---

# Phase 123 Plan 01: Chat Persistence (migration + contract test) Summary

CHATDB-01 foundation: two tenant-scoped tables (`chat_conversations` + `chat_messages`) authored as an idempotent migration and locked by a 9-case static contract test — the schema the Phase-124 backend writes and the Phase-125 UI reads, mirroring `whatsapp_inbox`'s two-table shape but applying `credit_ledger`'s tenant-readable RLS posture narrowed owner-only by `user_id`.

## What Shipped

- **`supabase/migrations/20260626000001_phase123_chat_persistence.sql`** (authored-only, idempotent):
  - `chat_conversations` (id, company_id→companies, user_id→auth.users ON DELETE CASCADE, title, created_at, updated_at) + `(company_id, user_id, updated_at DESC)` index.
  - `chat_messages` (id, conversation_id→chat_conversations, denormalized company_id→companies, role CHECK in user/assistant/tool/system, `parts JSONB NOT NULL DEFAULT '[]'::jsonb`, attachments JSONB, created_at) + `idx_chat_messages_conversation_created`.
  - RLS enabled on both; idempotent `DROP POLICY IF EXISTS` + `CREATE POLICY ... FOR SELECT TO authenticated` gating via `company_members.company_id` AND narrowing by `user_id = (SELECT auth.uid())`. No INSERT/UPDATE/DELETE policy (append-only, service-role writes bypass RLS). No `companies.user_id` anywhere.
- **`tests/unit/chat/chat-persistence-migration.test.ts`** — 9 static `readFileSync` assertions (both tables idempotent, conversations columns, messages shape + denormalized company_id + parts/attachments jsonb, role CHECK enum, RLS x2, company_members gate + negative `companies.user_id` on comment-stripped SQL, owner narrowing, history index, DROP POLICY idempotency).

## TDD Flow

- **RED** (`9be0969a`): test committed first; failed 9/9 with ENOENT (migration absent) — correct Wave-0 state.
- **GREEN** (`d998f22c`): migration authored to the plan's exact prescribed content; contract test → 9/9 green.
- **REFACTOR**: none needed (content was prescribed verbatim; no cleanup).

## Verification

- `npx vitest run tests/unit/chat/chat-persistence-migration.test.ts` → 9/9 green.
- Full suite: `npx vitest run` → 320 passed | 3 skipped (2244 tests), 0 failures (no parallel flake this run).
- `grep -c 'ENABLE ROW LEVEL SECURITY'` → 2; `company_members.company_id` → 2; `companies.user_id` → 0; both indexes present.
- Migration filename `20260626000001_…` sorts strictly after `20260625000002_phase118_match_knowledge_entries.sql`.
- Migration NOT applied to remote (authored-only; CI→GHCR→Coolify owns deploy).
- gitleaks pre-commit clean on both commits; no secrets.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `9be0969a` — test(123-01): add failing chat-persistence migration contract (RED)
- `d998f22c` — feat(123-01): author chat_persistence migration (GREEN)

## Self-Check: PASSED
