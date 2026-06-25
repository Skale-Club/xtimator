---
phase: 123-chat-persistence-schema-history
verified: 2026-06-24T22:32:00Z
status: passed
score: 10/10 must-haves verified
---

# Phase 123: Chat Persistence Schema + History Verification Report

**Phase Goal:** chat_conversations + chat_messages tables with tenant-scoped RLS (company_members, mirroring the credit_ledger posture, NOT whatsapp's deny-all) + owner narrowing by user_id; parts jsonb for the AI SDK UIMessage model; denormalized company_id on messages; query helpers (list/get/create/append) so the tables are ready-to-consume. Idempotent, authored-only.
**Verified:** 2026-06-24T22:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Both chat_conversations and chat_messages tables created idempotently | ✓ VERIFIED | Migration lines 13, 28: `CREATE TABLE IF NOT EXISTS public.chat_conversations` / `...chat_messages` |
| 2 | chat_messages.parts is NOT NULL jsonb (AI SDK UIMessage store) | ✓ VERIFIED | Migration line 33: `parts JSONB NOT NULL DEFAULT '[]'::jsonb` |
| 3 | chat_messages denormalizes company_id (direct RLS gate, mirrors whatsapp_messages) | ✓ VERIFIED | Migration line 31: `company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE` on the message table |
| 4 | RLS tenant-readable via company_members AND owner-narrowed by user_id=auth.uid(), NEVER companies.user_id, NOT deny-all | ✓ VERIFIED | Lines 43-61: ENABLE RLS x2 + SELECT policies gating `company_members.company_id` AND `user_id = (SELECT auth.uid())`. grep `companies.user_id` → 0 matches anywhere |
| 5 | Migration is authored-only (never applied to remote this phase) | ✓ VERIFIED | File committed (d998f22c); no `apply_migration`/`db push` in phase artifacts; deploy owned by CI→GHCR→Coolify per project memory |
| 6 | listConversations returns active company + owner's threads, newest-updated first | ✓ VERIFIED | chat.ts L48-63: `.eq('company_id', companyId).eq('user_id', userId).order('updated_at', {ascending:false})` |
| 7 | getConversationWithMessages returns tenant+owner-scoped thread oldest-first, or null | ✓ VERIFIED | chat.ts L66-96: conversation scoped by id+company+user via `.maybeSingle()`, null guard before messages fetch ordered created_at ascending |
| 8 | createConversation inserts a thread scoped to active company + owner, returns row | ✓ VERIFIED | chat.ts L99-115: `.insert({ company_id: companyId, user_id: userId, title })` |
| 9 | appendMessage inserts denormalized company_id AND bumps parent updated_at | ✓ VERIFIED | chat.ts L122-153: insert into chat_messages with company_id, then `.update({ updated_at })` on chat_conversations scoped by id+company |
| 10 | Every helper resolves getActiveCompanyId() internally — no trusted tenant arg | ✓ VERIFIED | grep `getActiveCompanyId()` → 5 (4 helpers + 1 doc); each helper resolves internally with early null/[] guards |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260626000001_phase123_chat_persistence.sql` | Two tables, indexes, tenant RLS | ✓ VERIFIED | 67 lines; both tables, both indexes, ENABLE RLS x2, 2 SELECT policies, COMMENTs. Filename sorts strictly after `20260625000002_phase118_match_knowledge_entries.sql` (confirmed last in dir before this) |
| `tests/unit/chat/chat-persistence-migration.test.ts` | Static readFileSync contract (9 cases) | ✓ VERIFIED | 9 `it()` cases incl. negative `not.toMatch(/companies\.user_id/)` on comment-stripped SQL; all green |
| `lib/queries/chat.ts` | 4 helpers + row types, min 80 lines | ✓ VERIFIED | 153 lines; exports listConversations, getConversationWithMessages, createConversation, appendMessage + ChatRole/ChatConversationRow/ChatMessageRow/ChatThread |
| `tests/unit/chat/chat-queries.test.ts` | Mocked-service-client behavior contract (7 cases) | ✓ VERIFIED | 7 tests; mocks both active-company + service; `'company-SECRET'` cross-tenant tripwire asserted; updated_at bump asserted; all green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| chat-persistence-migration.test.ts | migration .sql | readFileSync of exact path + regex | ✓ WIRED | MIGRATION_PATH resolves `20260626000001_phase123_chat_persistence.sql`; 9 assertions pass |
| lib/queries/chat.ts | getActiveCompanyId / createServiceClient | internal tenant resolution + service client | ✓ WIRED | Both imported (L18-19) and called in all 4 helpers; mirrors whatsapp-inbox.ts |
| appendMessage | chat_conversations.updated_at | update bump after insert | ✓ WIRED | L146-150: `.from('chat_conversations').update({ updated_at: ... }).eq('id', ...).eq('company_id', ...)` |

### Data-Flow Trace (Level 4)

Not applicable — phase ships a schema migration + server query helpers (no dynamic-rendering UI artifacts). Helpers correctly return live `data` from the service client; mock tests confirm `data` flows through (no hardcoded empty returns — empty arrays/null only on no-company / no-client guard paths, which is correct).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chat unit suite green | `npx vitest run tests/unit/chat` | Test Files 2 passed, Tests 16 passed | ✓ PASS |
| RLS enabled on both tables | `grep -c "ENABLE ROW LEVEL SECURITY"` | 2 | ✓ PASS |
| Tenant resolution in every helper | `grep -c "getActiveCompanyId()"` | 5 (4 helpers + doc) | ✓ PASS |
| No companies.user_id (Phase 82 invariant) | `grep companies\.user_id` migration | 0 matches | ✓ PASS |
| Migration filename ordering | `ls supabase/migrations \| tail` | sorts after 20260625000002 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHATDB-01 | 123-01 | chat_conversations + chat_messages exist with tenant-scoped RLS (mirroring whatsapp_inbox); idempotent migration, authored-only | ✓ SATISFIED | Migration authored idempotently; tables + RLS + parts jsonb + denormalized company_id + role CHECK all present; 9/9 contract tests green |
| CHATDB-02 | 123-02 | Conversations and their messages persist and reload (returning owner sees history) | ✓ SATISFIED | lib/queries/chat.ts ships list/get/create/append, tenant+owner scoped; appendMessage bumps updated_at for recency re-sort; 7/7 behavior tests green |

No orphaned requirements — REQUIREMENTS.md maps only CHATDB-01/02 to Phase 123, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/queries/chat.ts | 51,62,72,83,etc. | `return []` / `return null` | ℹ️ Info | Correct guard paths (no active company / no service client) mirroring whatsapp-inbox.ts — NOT stubs; live `data` returned on the happy path |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder. No secrets (gitleaks-clean commits). Empty-collection returns are guard branches, not hollow rendering.

### Human Verification Required

None for this phase. The tables are schema + helpers only; runtime behavior (a returning owner seeing history) is exercised at the integration level by Phases 124/125 which consume these helpers. The migration is authored-only by design — applying to remote is deferred to the CI→GHCR→Coolify deploy path.

### Gaps Summary

No gaps. All 10 must-have truths verified, all 4 artifacts pass levels 1-3 (exist, substantive, wired), all 3 key links wired, both requirements satisfied, and the full chat suite is green (16/16). The migration is correctly authored-only, idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS), filename-ordered after the prior migration, gates RLS via company_members with owner narrowing, never references companies.user_id, and ships parts jsonb + denormalized company_id. The query helpers mirror whatsapp-inbox.ts with internal tenant resolution and the updated_at bump. No secrets, no remote apply.

Minor non-issue: `grep -c "it("` on chat-queries.test.ts returns 8 (a false substring match), but vitest authoritatively reports 7 tests in that file (16 total − 9 migration = 7). Cosmetic only; not a gap.

---

_Verified: 2026-06-24T22:32:00Z_
_Verifier: Claude (gsd-verifier)_
