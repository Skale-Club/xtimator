# Phase 123: Chat Persistence Schema + History - Research

**Researched:** 2026-06-24
**Domain:** Supabase Postgres schema + RLS + tenant-scoped query helpers (mirroring `whatsapp_inbox`), AI SDK message persistence shape
**Confidence:** HIGH (every decision is anchored to an in-repo precedent read directly; the one external fact — the AI SDK `parts` model — verified against official docs)

## Summary

Phase 123 ships the persistence layer for the v4.9 web chat: two tables (`chat_conversations`, `chat_messages`), tenant-scoped RLS, a `lib/queries/chat.ts` helper set, and a static migration-contract test. It is pure infrastructure — the Phase-124 AI SDK backend writes to these tables and the Phase-125 UI reads them; nothing in this phase calls an LLM, streams, or renders.

The codebase already contains the exact precedent to mirror twice over. `whatsapp_inbox` (`20260527000001`) is the **table-shape + query-helper** model: a parent conversation row + an append-only message log, denormalized `company_id` on both, and read helpers that go through the **service client** scoped to `getActiveCompanyId()`. `credit_ledger` (`20260624000004`, Phase 112/82) is the **RLS posture** model: `ENABLE ROW LEVEL SECURITY` + a `company_members` subquery SELECT policy using `(select auth.uid())`, never `companies.user_id`. The decision to resolve below: the whatsapp tables are **RLS deny-all (service-role only, no policies)**, whereas the seed and the phase brief call for **tenant-scoped RLS via `company_members`** (the credit_ledger posture). These are two different precedents; this phase must pick the credit_ledger RLS posture (tenant-readable) while keeping the whatsapp table *shape* and *helper* pattern.

For `chat_messages` content, the Vercel AI SDK (added in Phase 124) uses a `UIMessage` model whose payload is a `parts` array, and its official guidance is to persist the **whole UIMessage** (including `parts`) as JSON. So a `parts jsonb` column on `chat_messages` is the correct, verified choice. The migration is idempotent + authored-only; filename `20260626000001_phase123_chat_persistence.sql` (sorts strictly after the newest existing `20260625000002`). Deploy is owned by CI→GHCR→Coolify — this phase authors the file and the contract test only; it does NOT apply to remote.

**Primary recommendation:** Mirror `whatsapp_inbox`'s two-table shape, denormalize `company_id` onto `chat_messages` for a direct RLS gate, apply `credit_ledger`'s `company_members` SELECT-policy RLS posture scoped additionally by `user_id` (owner-only per-user threads), expose `lib/queries/chat.ts` helpers mirroring `lib/queries/whatsapp-inbox.ts` (service client + `getActiveCompanyId()`), and lock the whole shape with a static `readFileSync` migration-contract test mirroring `credit-ledger-migration.test.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHATDB-01 | `chat_conversations` + `chat_messages` tables exist with tenant-scoped RLS (mirroring `whatsapp_inbox`); idempotent migration, authored-only | Schema below (mirrors `20260527000001_whatsapp_inbox.sql` shape + `20260624000004` RLS posture); idempotent DDL pattern (`CREATE TABLE/INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`); authored-only deploy via CI→GHCR→Coolify (project memory: never build/migrate on the VPS); static migration-contract test mirroring `tests/unit/billing/credit-ledger-migration.test.ts` |
| CHATDB-02 | Conversations and their messages persist and reload (a returning owner sees their chat history) | `lib/queries/chat.ts` helpers (`listConversations`, `getConversationWithMessages`, `createConversation`, `appendMessage`) mirroring `lib/queries/whatsapp-inbox.ts` — service client scoped to `getActiveCompanyId()`; the read path the Phase-125 sidebar/history consumes |
</phase_requirements>

## Standard Stack

No new npm packages in this phase. It is SQL DDL + a TypeScript query module + a Vitest test. The AI SDK (`ai` + `@ai-sdk/*`) lands in Phase 124 — this phase only models the column shape that the SDK's persisted messages will occupy.

### Core (already in repo — reuse, do not add)
| Module | Purpose | Why Standard |
|--------|---------|--------------|
| `@/lib/queries/active-company` (`getActiveCompanyId`) | Resolves + validates the tenant for the request | The single multi-tenant entry point (D-09); every read helper scopes by its return value |
| `@/lib/supabase/service` (`createServiceClient` / `requireServiceClient`) | Service-role client that bypasses RLS for the scoped reads/writes | The whatsapp-inbox helpers use exactly this; the chat helpers mirror it |
| `@supabase/supabase-js` `SupabaseClient` type | Typed query builder | Already the project's data access type |
| `vitest` | The migration-contract test runner | Every prior schema phase (117, 112, 94…) ships a `*-migration.test.ts` |

### Supporting (AI SDK — context only, NOT installed this phase)
| Library | Version | Purpose | When |
|---------|---------|---------|------|
| `ai` (Vercel AI SDK) | v5.x (latest — verify in Phase 124) | `UIMessage`/`parts` model whose JSON shape `chat_messages.parts` stores | Phase 124 adds it; this phase only models the column |

**Installation:** none.

**Version verification:** N/A for this phase (no new deps). When Phase 124 adds `ai`, verify `npm view ai version` then — the `parts`-array UIMessage model is AI SDK v4+/v5 and is what this column shape targets.

## Architecture Patterns

### Recommended structure (files this phase touches/creates)
```
supabase/migrations/
└── 20260626000001_phase123_chat_persistence.sql   # NEW — the two tables + RLS + indexes
lib/queries/
└── chat.ts                                          # NEW — list/get/create/append helpers (mirror whatsapp-inbox.ts)
lib/chat/  (or co-located in chat.ts)
└── conversations.ts (optional)                      # row types + write helpers (mirror lib/whatsapp/conversations.ts) — only if the phase wants write helpers split from read helpers
tests/unit/chat/
└── chat-persistence-migration.test.ts               # NEW — static readFileSync contract (mirror credit-ledger-migration.test.ts)
```

### Pattern 1: Two-table conversation + append-only message log (mirror `whatsapp_inbox`)
**What:** One parent row per conversation; an append-only child message log; `company_id` denormalized onto BOTH tables (the message carries its own `company_id`, not only via the FK to the conversation).
**When to use:** This phase, verbatim — it is the established Xtimator chat-thread shape.
**Why denormalize `company_id` onto `chat_messages`:** It lets the message RLS policy gate **directly** on `company_id IN (company_members…)` without a subquery join back to the parent conversation. The whatsapp_messages table already does exactly this (`company_id UUID NOT NULL REFERENCES companies(id)`), and credit_ledger's policy is the direct-`company_id` form. Direct gate = simpler policy, no correlated subquery, HNSW-free fast index.

**Proposed DDL (planner refines; this is the locked shape):**
```sql
-- supabase/migrations/20260626000001_phase123_chat_persistence.sql
-- Phase 123 (CHATDB-01/02): web-chat persistence. Two tables mirroring
-- whatsapp_inbox's shape, but TENANT-READABLE via company_members (credit_ledger
-- / phase82 RLS posture) — NOT deny-all. Owner-only: scoped by company_id AND
-- user_id (a per-owner thread). Authored-only: NOT applied to remote here; deploy
-- is owned by CI->GHCR->Coolify. NO secrets.

-- 1. chat_conversations: one row per chat thread (per company, per owner)
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_company_user_updated
  ON public.chat_conversations (company_id, user_id, updated_at DESC);

-- 2. chat_messages: append-only message log. parts jsonb stores the AI SDK
--    UIMessage parts array; attachments jsonb stores multimodal refs.
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  parts           JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages (conversation_id, created_at);

-- 3. RLS — tenant-readable via company_members (mirror credit_ledger / phase82).
--    Owner-only: the SELECT additionally narrows to the caller's own user_id, so a
--    second member of the same company cannot read another owner's chat. Service
--    role bypasses RLS for all writes (helpers use the service client).
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select" ON public.chat_conversations FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id IN (SELECT company_members.company_id FROM company_members
                       WHERE company_members.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_members.company_id FROM company_members
                   WHERE company_members.user_id = (SELECT auth.uid()))
    AND conversation_id IN (SELECT chat_conversations.id FROM chat_conversations
                            WHERE chat_conversations.user_id = (SELECT auth.uid()))
  );
```
**Source:** shape from `supabase/migrations/20260527000001_whatsapp_inbox.sql`; RLS posture from `supabase/migrations/20260624000004_phase112_credit_ledger.sql` (read directly).

### Pattern 2: Query helpers via service client scoped to `getActiveCompanyId()` (mirror `lib/queries/whatsapp-inbox.ts`)
**What:** Read/write helpers take no tenant argument from the caller; they resolve `getActiveCompanyId()` internally and re-scope every query by `company_id` (+ `user_id` for owner-only). They use the service client (RLS is for the authed client; the helper path is service-role + explicit scoping — defense in depth).
**Why this works even with RLS present:** The whatsapp helpers use the service client because those tables are deny-all. Here the tables ARE tenant-readable, so an authed client would also work — but mirroring the whatsapp helper (service client + explicit `.eq('company_id', companyId)`) keeps one consistent helper pattern and lets the Phase-124 backend (which runs in a route handler with a resolved company) write without RLS friction. The RLS SELECT policy is the second wall for any future authed-client read path.

```typescript
// lib/queries/chat.ts  (mirror lib/queries/whatsapp-inbox.ts)
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { createServiceClient } from '@/lib/supabase/service'

/** All conversations for the active company + current owner, newest-updated first. */
export async function listConversations(userId: string): Promise<ChatConversationRow[]> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return []
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc
    .from('chat_conversations')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(200)
  return (data ?? []) as ChatConversationRow[]
}

/** One conversation + its messages (oldest first), tenant + owner scoped. */
export async function getConversationWithMessages(
  conversationId: string, userId: string,
): Promise<ChatThread | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  const svc = createServiceClient()
  if (!svc) return null
  const { data: conversation } = await svc
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!conversation) return null
  const { data: messages } = await svc
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)
  return { conversation, messages: messages ?? [] } as ChatThread
}
```
**Source:** `lib/queries/whatsapp-inbox.ts` (`listConversations`, `getConversationThread`) read directly — same scoping shape.

### Pattern 3: `parts jsonb` stores the AI SDK UIMessage payload
**What:** The Vercel AI SDK message is a `UIMessage` with `{ id, role, parts: [...] }`; official guidance is to persist the whole UIMessage (parts included) as JSON. `chat_messages.parts JSONB` is that store; `attachments JSONB` holds multimodal refs (image/audio URLs) the Phase-125 multimodal input writes.
**When to use:** This phase models the column; Phase 124 writes the actual `parts`.
**Source:** https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence — "We recommend storing the messages in the `useChat` message format"; `saveChat({ messages: UIMessage[] })` serializes via `JSON.stringify(messages)`.

### Anti-Patterns to Avoid
- **Deny-all RLS (the whatsapp posture) when the brief says tenant-scoped:** whatsapp tables have *no policies* (deny-all). The seed + CHATDB-01 explicitly say "tenant-scoped RLS (mirroring whatsapp_inbox)" — mirror the *shape* of whatsapp_inbox but the *RLS posture* of credit_ledger (a `company_members` SELECT policy). Do not ship a policy-less table.
- **`companies.user_id` in any policy:** the Phase-82 invariant (and `credit-ledger-migration.test.ts`) fails the build if a tenant policy references `companies.user_id`. Use the `company_members` subquery.
- **Gating `chat_messages` RLS only via a join to the conversation, omitting denormalized `company_id`:** mirror whatsapp_messages — carry `company_id` on the message for a direct gate (the conversation `user_id` subquery is the owner-only narrowing on top).
- **Applying the migration to remote in this phase:** authored-only. No `supabase db push`, no `apply_migration` MCP. Deploy is CI→GHCR→Coolify (project memory: on-VPS build OOM-froze prod once).
- **A `parts text` column or many typed columns:** the AI SDK persists a `parts` ARRAY as JSON — model it `jsonb`, not text and not exploded into columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant resolution | A new company-from-cookie reader | `getActiveCompanyId()` | The single validated multi-tenant entry point (D-08/D-09); re-implementing it risks an unvalidated cross-tenant read |
| Service client | A fresh `createClient(SERVICE_ROLE_KEY)` | `createServiceClient()` / `requireServiceClient()` | Already the project's service-role factory; the whatsapp helpers use it |
| Message-content schema | A bespoke text/columns model for chat content | A `parts jsonb` column matching AI SDK `UIMessage.parts` | The SDK's persisted shape IS a parts array; matching it means zero serialization glue in Phase 124 |
| Migration-contract testing | A live-DB integration test | A static `readFileSync` + regex test | Every prior schema phase ships this; runs in CI with no DB and no secrets |
| Conversation upsert race handling | A custom lock | The whatsapp `getOrCreateConversation` re-select-on-conflict pattern | Already solved in `lib/whatsapp/conversations.ts` (handles the unique-index race) — adapt if a get-or-create helper is needed |

**Key insight:** This phase has near-zero novel surface. Two precedents (`whatsapp_inbox` for shape/helpers, `credit_ledger` for RLS) cover essentially every line. The only genuinely new decision is the owner-only `user_id` narrowing and the `parts jsonb` column — both small and both anchored to a verified source.

## Common Pitfalls

### Pitfall 1: Mirroring the WRONG attribute of whatsapp_inbox
**What goes wrong:** Copying whatsapp_inbox's RLS (deny-all, no policies) because the brief says "mirror whatsapp_inbox."
**Why it happens:** "Mirror whatsapp_inbox" is ambiguous — whatsapp_inbox is the shape/helper precedent, NOT the RLS precedent. Its tables are service-role-only.
**How to avoid:** Mirror whatsapp_inbox's *table shape + query helpers*; mirror credit_ledger's *RLS posture* (a `company_members` SELECT policy). CHATDB-01 says "tenant-scoped RLS" explicitly — that's credit_ledger, not deny-all.
**Warning sign:** A migration with `ENABLE ROW LEVEL SECURITY` and zero `CREATE POLICY` statements.

### Pitfall 2: Filename collision / out-of-order timestamp
**What goes wrong:** Picking a timestamp ≤ the newest existing migration, breaking lexical apply order.
**Why it happens:** The repo has overlapping date prefixes (e.g. multiple `20260619…`, `20260620…`). The strict newest is `20260625000002_phase118_match_knowledge_entries.sql`.
**How to avoid:** Use `20260626000001_phase123_chat_persistence.sql` (next calendar day, sorts strictly after `20260625000002`). Verified: `20260625000002` is the lexical max across `supabase/migrations/` as of this research.
**Warning sign:** A filename starting `2026062500000…` or earlier.

### Pitfall 3: `auth.users` FK vs no FK on `user_id`
**What goes wrong:** Adding `user_id UUID REFERENCES auth.users(id)` can be fine, but some Supabase setups discourage app-table FKs into `auth.users`. Cross-check the repo's own precedent.
**Why it happens:** whatsapp_conversations has NO `user_id` (it keys by `contact_phone`/`owner_phone TEXT`). `company_members` is the table that maps `user_id`.
**How to avoid:** Confirm during planning whether existing app tables FK to `auth.users(id)` (e.g. check `company_members` / `notifications`). If the repo convention is a bare `user_id UUID` without the FK (relying on RLS + app logic), match that. Either works; consistency with the repo's existing `user_id` columns is what matters. This is the one open question below.
**Warning sign:** A migration that diverges from how every other table stores `user_id`.

### Pitfall 4: `parts NOT NULL DEFAULT '[]'` vs nullable
**What goes wrong:** Making `parts` nullable invites empty-message ambiguity; the AI SDK always emits a parts array.
**How to avoid:** `parts JSONB NOT NULL DEFAULT '[]'::jsonb`. `attachments` stays nullable (most messages have none).

### Pitfall 5: Forgetting the `updated_at` bump on append
**What goes wrong:** The sidebar (Phase 125) orders conversations by `updated_at DESC`; if `appendMessage` doesn't bump the parent `updated_at`, new activity doesn't re-sort to the top.
**Why it happens:** whatsapp solves this with `bumpConversation` (updates `last_message_at`/`updated_at`). The chat equivalent must update `chat_conversations.updated_at` when a message is appended.
**How to avoid:** The `appendMessage` helper updates the parent's `updated_at` (and optionally a `title` on first user message). Mirror `bumpConversation`.

## Code Examples

### Static migration-contract test (mirror credit-ledger-migration.test.ts)
```typescript
// tests/unit/chat/chat-persistence-migration.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260626000001_phase123_chat_persistence.sql',
)
const read = () => readFileSync(MIGRATION_PATH, 'utf8')
const ROLES = ['user', 'assistant', 'tool', 'system'] as const

describe('CHATDB-01: chat persistence migration static contract', () => {
  it('creates both tables idempotently', () => {
    const sql = read()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.chat_conversations/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.chat_messages/)
  })
  it('chat_conversations carries company_id + user_id + title + timestamps', () => {
    const sql = read()
    expect(sql).toMatch(/company_id\s+UUID NOT NULL REFERENCES public\.companies/)
    expect(sql).toMatch(/user_id\s+UUID NOT NULL/)
    expect(sql).toMatch(/title\s+TEXT/)
  })
  it('chat_messages denormalizes company_id and stores parts jsonb', () => {
    const sql = read()
    expect(sql).toMatch(/conversation_id\s+UUID NOT NULL REFERENCES public\.chat_conversations/)
    expect(sql).toMatch(/company_id\s+UUID NOT NULL REFERENCES public\.companies/)
    expect(sql).toMatch(/parts\s+JSONB NOT NULL/)
  })
  it('constrains role via a CHECK enum', () => {
    const sql = read()
    for (const r of ROLES) expect(sql, `missing role ${r}`).toContain(`'${r}'`)
    expect(sql).toMatch(/role\s+TEXT NOT NULL CHECK/)
  })
  it('enables RLS on both tables', () => {
    const sql = read()
    expect((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
  it('gates SELECT via company_members (NOT companies.user_id)', () => {
    const sql = read()
    expect(sql).toMatch(/company_members\.company_id/)
    expect(sql).not.toMatch(/companies\.user_id/)   // Phase-82 invariant
  })
  it('narrows to the owner via user_id = auth.uid()', () => {
    const sql = read()
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
  })
  it('creates the conversation history index', () => {
    const sql = read()
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created/)
  })
})
```
**Source:** mirrors `tests/unit/billing/credit-ledger-migration.test.ts` (read directly).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ephemeral chat (whatsapp's pre-inbox 30-min session) | Persistent conversation + message log | whatsapp_inbox (`20260527`) | The established pattern this phase re-applies |
| Single `content text` per message | `parts jsonb` array (AI SDK UIMessage) | AI SDK v4/v5 message model | Multimodal + tool-call parts persist losslessly; matches what Phase 124 writes |

**Deprecated/outdated:** none relevant. Do NOT introduce Drizzle/Neon shapes from the Vercel template — the locked decision substitutes Supabase Postgres + RLS.

## Open Questions

1. **Does `user_id` FK to `auth.users(id)`, or is it a bare `UUID`?**
   - What we know: `whatsapp_conversations` has no `user_id` (keys by phone). `company_members.user_id` is the user mapping; `credit_ledger` has no `user_id`.
   - What's unclear: the repo's convention for an app table that stores `user_id` directly — FK to `auth.users` or bare UUID.
   - Recommendation: planner greps `supabase/migrations/` for `user_id UUID` to match the dominant convention (e.g. how `company_members` / `notifications` / `tour_events` declare it), then mirror it. Default to bare `user_id UUID NOT NULL` if FKs to `auth.users` aren't used elsewhere. Low risk either way.

2. **Read helpers: service client (whatsapp pattern) or authed RLS client?**
   - What we know: whatsapp helpers use the service client because those tables are deny-all. Here RLS is tenant-readable, so an authed client would also be correctly scoped.
   - Recommendation: use the **service client + explicit `.eq()` scoping** (mirror whatsapp-inbox) so the Phase-124 route handler can write uniformly, and keep the RLS SELECT policy as defense-in-depth for any authed read path. Document the choice; either is defensible.

3. **Is a `getOrCreateConversation` / `appendMessage` write helper in scope for CHATDB-02, or only reads?**
   - What we know: CHATDB-02 says "persist and reload." Reload = read helpers (certain). Persist = the write path — but Phase 124 is the backend that writes.
   - Recommendation: ship BOTH the read helpers (list/get) AND the create/append write helpers in `lib/queries/chat.ts` so the tables are genuinely "ready-to-consume" (the phase brief's scope fence: "tables ship ready-to-consume"). The Phase-124 backend then calls `createConversation`/`appendMessage` rather than re-implementing inserts. Mirror `lib/whatsapp/conversations.ts` `getOrCreateConversation` + `logInboundMessage`/`logOutboundMessage` (which also bump `updated_at`).

## Project Constraints (from CLAUDE.md + project memory)

- **Idempotent, authored-only migration.** `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`. Do NOT apply to remote — deploy is owned by CI→GHCR→Coolify; never build/migrate on the VPS (on-VPS build OOM-froze prod 2026-05-31).
- **No secrets** in the migration, the test, comments, or `.planning/` — use placeholders only. gitleaks pre-commit hook blocks `whsec_`/`sk_`/`sb_secret_`/`sk-ant-` etc.
- **Tenant-scoped RLS via `company_members`** — never reference `companies.user_id` (Phase-82 invariant; the contract test asserts its absence). Use the `(select auth.uid())` idiom.
- **Owner-only, tenant-scoped, NEVER customer-facing** (SEED-034 locked decision) — narrow the chat tables by `user_id` in addition to `company_id`.
- **Service role key never exposed to browser** — helpers run server-side (`server-only` where applicable), via `createServiceClient()`.
- **TypeScript strict, Next.js App Router** — `lib/queries/chat.ts` is a server module.
- **GSD workflow** — this is planned phase work; no direct edits outside the workflow.

## Scope Fence (from phase brief)

**IN:** the two tables + tenant-scoped RLS + the `lib/queries/chat.ts` helpers (read + create/append) + the static migration-contract test. The tables ship ready-to-consume.
**OUT:** the AI SDK backend that writes them (Phase 124, CHATBE-*), the `useChat` UI that reads them (Phase 125, CHATUI-*), the entitlement/owner-only route gate (Phase 126, CHATMETER-02). No LLM call, no streaming, no `ai` package, no route handler in this phase.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure SQL + TypeScript + Vitest; no new tools, services, or runtimes introduced). Supabase Postgres and the migration pipeline already exist; this phase authors a file consumed by the existing CI→GHCR→Coolify flow.

## Runtime State Inventory

This is a greenfield additive schema phase (new tables only — no rename, no refactor of existing data). The full Runtime State Inventory does not apply. The one adjacent runtime note:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new empty tables; no existing data migrates | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new secret introduced | None |
| Build artifacts | None | None |
| **Deploy pipeline (carried operational deferral)** | The migration is authored-only; like every prior schema phase it must later be applied to remote via CI→GHCR→Coolify | Operational deferral — apply to remote through the pipeline (NOT in this phase) |

## Validation Architecture

`workflow.nyquist_validation: true` (config.json) — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (in repo; every schema phase ships a `*-migration.test.ts`) |
| Config file | repo root `vitest` config (existing — prior phases run `npx vitest run`) |
| Quick run command | `npx vitest run tests/unit/chat/chat-persistence-migration.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHATDB-01 | Migration ships both tables, idempotent DDL, role CHECK, RLS via company_members (no companies.user_id), owner `user_id` narrowing, parts jsonb, indexes | unit (static SQL contract) | `npx vitest run tests/unit/chat/chat-persistence-migration.test.ts` | ❌ Wave 0 |
| CHATDB-02 | `listConversations` / `getConversationWithMessages` scope by active company + owner; `createConversation` / `appendMessage` persist and bump `updated_at` | unit (mocked supabase service client, mirror whatsapp-inbox tests if present) | `npx vitest run tests/unit/chat/chat-queries.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/chat/`
- **Per wave merge:** `npx vitest run` (full suite — guard no cross-module regression; note the known parallel-only `mcp-route-contract.test.ts` flake, green in isolation)
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/chat/chat-persistence-migration.test.ts` — static SQL contract for CHATDB-01 (mirror `credit-ledger-migration.test.ts`)
- [ ] `tests/unit/chat/chat-queries.test.ts` — helper behavior for CHATDB-02 (mock `@/lib/supabase/service` + `@/lib/queries/active-company`; assert every query `.eq('company_id', …)` and `.eq('user_id', …)`, mirror the whatsapp-inbox scoping assertions) — only if the phase ships helper unit tests; the migration contract test is mandatory.
- [ ] Framework install: none — Vitest already present.

*(Check during planning whether a `tests/unit/whatsapp/whatsapp-inbox*.test.ts` exists to mirror for the helper test; the migration-contract test is the load-bearing required artifact.)*

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260527000001_whatsapp_inbox.sql` — table shape / append-only log / denormalized company_id / index pattern (read directly)
- `supabase/migrations/20260624000004_phase112_credit_ledger.sql` — tenant-readable RLS posture (`company_members` SELECT policy, `(select auth.uid())`, no `companies.user_id`, idempotent DDL) (read directly)
- `lib/queries/whatsapp-inbox.ts` — `listConversations` / `getConversationThread` helper scoping via service client + `getActiveCompanyId()` (read directly)
- `lib/queries/active-company.ts` — `getActiveCompanyId()` tenant resolution (read directly)
- `lib/whatsapp/conversations.ts` — row types + `getOrCreateConversation` / `bumpConversation` / log helpers (read directly)
- `tests/unit/billing/credit-ledger-migration.test.ts` — static `readFileSync` migration-contract test pattern (read directly)
- `supabase/migrations/20260625000002_phase118_match_knowledge_entries.sql` — confirmed newest existing migration timestamp (filename ordering)
- `.planning/REQUIREMENTS.md` (v4.9, CHATDB-01/02 + locked decisions), `.planning/seeds/SEED-034`, `.planning/STATE.md` (Phase-123 plan line), `CLAUDE.md`, `.planning/config.json` (read directly)

### Secondary (MEDIUM confidence)
- AI SDK message persistence guidance — https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence (official docs; confirms `UIMessage` `parts` model + "store messages in useChat format" → `parts jsonb` column). MEDIUM because the exact AI SDK version lands in Phase 124, not here.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all reused modules read directly in-repo.
- Architecture (schema + RLS + helpers): HIGH — two in-repo precedents cover every line; both read directly.
- `parts jsonb` column choice: HIGH — confirmed against official AI SDK persistence docs.
- Pitfalls: HIGH — each anchored to a concrete in-repo invariant (Phase-82 RLS, filename ordering, whatsapp bump pattern).
- Open question (`user_id` FK convention): MEDIUM — resolvable by a one-line grep during planning; low risk either way.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable — in-repo precedents change slowly; re-verify the newest migration timestamp at plan time and the AI SDK version when Phase 124 adds `ai`).
