# Phase 117: Knowledge Schema + pgvector + Dual RLS - Research

**Researched:** 2026-06-24
**Domain:** Supabase PostgreSQL schema migration — pgvector extension, vector similarity index, dual RLS posture on one table
**Confidence:** HIGH

> No CONTEXT.md exists for this phase (discuss step not run). User constraints below are
> reconstructed verbatim from REQUIREMENTS.md + SEED-033 locked decisions + STATE.md guardrails,
> which carry the same authority as locked decisions for this phase.

<user_constraints>
## User Constraints (from REQUIREMENTS.md + SEED-033 + STATE.md)

### Locked Decisions
- **ONE table, scope discriminator.** The seed locks a single `knowledge_entries` table with a `scope` column (`'industry'|'company'`), NOT two tables. Both RLS postures live on this one table.
- **Two RLS postures on the same table:**
  - **INDUSTRY rows** (KB-02) — neutral/shared platform asset. **Mirror `price_research_cache`**: service-role-only write; read scoped by industry. No tenant can ever write them.
  - **COMPANY overlay rows** (KB-03) — tenant-scoped, gated by `company_members` membership for read AND write (mirror the most-recent multi-tenant table, `credit_ledger`/phase94 invoices).
- **Schema + RLS ONLY this phase.** No `embed`/`retrieve`/`answer` module (that is Phase 118). The `embedding` column exists but nothing writes vectors yet. The table ships DORMANT — like `price_research_cache` shipped dormant in Phase 106.
- **Retrieval = pgvector + embeddings only in v1.** No Cohere reranker on day 1 (deferred, data-driven phase-2). The reranker is a layer between `retrieve` and `answer` — it does NOT change this schema. Nothing reranker-related belongs in this phase.
- **Idempotent migration** (`CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- **Authored-only.** Write the migration file; do NOT apply it to remote — no `db push`, no Supabase MCP `apply_migration`. Deploy is owned by CI→GHCR→Coolify. **Never build/migrate on the VPS** (on-VPS build OOM-froze prod 2026-05-31).
- **No secrets** in the migration or any planning doc (placeholders only).
- A **static migration-contract test** (pure file-read regex assertions, no DB) locks the table shape — mirror `tests/unit/estimate/price-research-cache-migration.test.ts` and `tests/unit/billing/credit-ledger-migration.test.ts`.

### Claude's Discretion (recommendation given below; planner may confirm)
- **Embedding dimension pin:** `vector(1536)` for OpenAI `text-embedding-3-small` (the seed's recommended provider). RECOMMENDED to pin now (see Open Questions Q1).
- **Index type:** HNSW + `vector_cosine_ops` (RECOMMENDED over IVFFlat for an initially-empty curated corpus — see Pattern 2).
- **Extension schema:** `extensions` (Supabase recommendation) — see Pattern 1.
- Exact column nullability/CHECK wording, index names, COMMENT text.

### Deferred Ideas (OUT OF SCOPE for Phase 117)
- `embed()` / `retrieve()` / `answer()` / fixture adapter → Phase 118 (KMOD-01..04, KSEC-01).
- Super-admin curation UI + bulk import → Phase 119 (KCUR-01/02/03).
- Company overlay settings UI → Phase 120 (KOVL-01/02).
- WhatsApp KNOWLEDGE intent → Phase 121 (WAKB-01/02).
- Cohere/any reranker; chunk-by-paragraph (v1 = whole-entry); multilingual KB content.
- Owner-facing KB browser (never — KB is a conversational retrieval surface only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **KB-01** | pgvector enabled + `knowledge_entries` table (scope, nullable industry_id/company_id, title, body, source, embedding vector, created_at, updated_at) + vector similarity index. Idempotent, authored-only. | Pattern 1 (enable extension), Pattern 3 (table DDL), Pattern 2 (HNSW index), Standard Stack (versions/dimension). Precedent: `price_research_cache` migration shape + the existing `CREATE EXTENSION IF NOT EXISTS pg_cron` in `20260505000001_phase18_cleanup_cron.sql`. |
| **KB-02** | Industry entries neutral/shared — RLS service-role-write, read scoped by industry; no tenant writes them. | Pattern 4 (dual RLS), mirrors `price_research_cache` (service-role-only writes) + an industry-scoped/all-authenticated SELECT policy. |
| **KB-03** | Company overlay entries tenant-scoped — RLS gates read/write to the owning company via `company_members`. | Pattern 4 (dual RLS) — `company_members` subquery pattern from `credit_ledger`/phase82, applied as INSERT/UPDATE/DELETE + a company-rows SELECT arm. |
</phase_requirements>

## Summary

Phase 117 is a **single idempotent SQL migration plus a static contract test** — no application code. It enables the pgvector extension, creates `public.knowledge_entries` with a fixed-dimension `embedding vector(1536)` column, builds an HNSW cosine index, and applies **two coexisting RLS postures on the one table** via PostgreSQL's permissive-policy OR semantics. The table ships dormant (nothing writes embeddings until Phase 118), exactly as `price_research_cache` shipped dormant in Phase 106.

All the hard facts are verified HIGH confidence: Supabase recommends `create extension ... with schema extensions`; the codebase already has a `CREATE EXTENSION IF NOT EXISTS pg_cron` precedent (Phase 18); `vector(1536)` (OpenAI `text-embedding-3-small`) is well within pgvector's 2000-dimension HNSW index limit; HNSW builds correctly on an empty table (no training step, unlike IVFFlat); and multiple permissive SELECT policies on one table are combined with OR — which is precisely what makes the dual-posture (industry-readable-to-all OR company-readable-by-members) expressible cleanly on a single table.

The dual RLS is the only subtle part, and it resolves cleanly: **service-role writes bypass RLS entirely** (so industry rows need no INSERT/UPDATE/DELETE policy — that's the `price_research_cache` posture), while **company-overlay writes get the standard `company_members` tenant gate** (the `credit_ledger`/phase82 pattern), and a `CHECK` constraint enforces the scope discriminant so a row can never be malformed (industry → `company_id` NULL + `industry_id` set; company → `company_id` set).

**Primary recommendation:** Ship one idempotent migration named `20260625000001_phase117_knowledge_entries.sql` that (1) `create extension if not exists vector with schema extensions;`, (2) creates `public.knowledge_entries` with `embedding vector(1536)`, a scope CHECK, and nullable scope keys, (3) builds an HNSW `vector_cosine_ops` index, (4) enables RLS with: NO industry-write policy (service-role only) + a tenant INSERT/UPDATE/DELETE policy on company rows via `company_members` + a single SELECT policy OR-ing "industry rows visible to all authenticated" with "company rows visible to members"; plus a static migration-contract test mirroring `price-research-cache-migration.test.ts`.

## Standard Stack

### Core
| Library / Component | Version | Purpose | Why Standard |
|---------------------|---------|---------|--------------|
| pgvector (`vector` extension) | **0.8.x** (current pgvector release line as of 2026; Supabase ships ≥0.7 with HNSW + halfvec support) | Vector storage + HNSW/IVFFlat similarity indexes in Postgres | The Supabase-blessed extension for embeddings; already the only pgvector option on the platform. HNSW support has shipped since pgvector 0.5.0. |
| OpenAI `text-embedding-3-small` | dimension **1536** | The embedding model whose output dimension the column must match | Seed's recommended provider (decision-still-to-lock #1 in SEED-033). 1536-dim is the model default and is comfortably under pgvector's 2000-dim index ceiling. |
| Supabase Postgres | PG 15 (project's current) | Host database | Project standard. |

> **Note on versions:** `npm view` does not apply — pgvector is a Postgres extension, not an npm package, and its version is set by the Supabase platform image, not by this migration. The migration uses `create extension if not exists vector` which installs whatever pgvector version the platform provides. No version pin is authored in SQL. The 1536 dimension is the only number this migration pins, and it is a property of the chosen embedding model, not of pgvector.

### Supporting (no install — all DDL)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| HNSW index (`USING hnsw (embedding vector_cosine_ops)`) | Approximate nearest-neighbor similarity index | The retrieval index for this table — built now, used in Phase 118. |
| `CHECK` constraint on `scope` | Enforce the scope discriminant invariant at the DB level | Guarantees industry rows have NULL company_id and company rows have NULL industry_id+set company_id. |
| `company_members` subquery | Tenant membership gate for RLS | The COMPANY overlay read/write policies. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HNSW index | IVFFlat | IVFFlat needs representative data present at build time to train its lists; on an initially-empty curated table it builds a poor index. HNSW has no training step and builds fine on empty. For a small curated corpus, HNSW is strictly better here. **Use HNSW.** |
| `vector(1536)` fixed | `vector` (unsized) | An unsized `vector` column cannot be HNSW-indexed (index requires a fixed dimension). KB-01 mandates a similarity index, so the dimension MUST be pinned. **Pin 1536.** |
| One table + scope discriminator | Two tables (industry_kb / company_kb) | The seed LOCKED one table. Two tables would split the dual RLS cleanly but contradicts the locked design and complicates the Phase-118 merge-retrieve query. **Use one table** (it is cleanly expressible — see Pattern 4). |
| `extensions` schema | `public` schema | Both work. Supabase's official docs recommend `with schema extensions` (keeps `public` clean; `extensions` is on the default search_path). The existing `pg_cron` migration used a bare `CREATE EXTENSION IF NOT EXISTS pg_cron` (default schema). **Recommend `extensions`** per Supabase docs; either is acceptable and idempotent. |

**Installation:** None. This is a SQL migration file only — no `npm install`.

## Architecture Patterns

### Recommended File / Migration Layout
```
supabase/migrations/
└── 20260625000001_phase117_knowledge_entries.sql   # the one migration (date AFTER 20260624000004)

tests/unit/knowledge/
└── knowledge-entries-migration.test.ts             # static contract test (new dir, mirrors estimate/billing migration tests)
```

> **Migration naming convention (verified from the migrations dir):** `YYYYMMDDNNNNNN_phaseNN_slug.sql`. The newest existing is `20260624000004_phase112_credit_ledger.sql`. Phase 117 must sort AFTER it. Use a **2026-06-25** date prefix: `20260625000001_phase117_knowledge_entries.sql`. (Do NOT reuse `20260624` — `...000005` would also sort after `...000004`, but a fresh day prefix is cleaner and avoids the Memory'd phase-number/prefix-collision class of bug.)

### Pattern 1: Enable pgvector idempotently (Supabase-recommended)
**What:** Install the `vector` extension into the `extensions` schema, idempotently.
**When to use:** First statement of the migration.
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/database/extensions/pgvector
-- Supabase recommends the `extensions` schema. Precedent for in-migration
-- extension enable in THIS repo: 20260505000001_phase18_cleanup_cron.sql
--   (CREATE EXTENSION IF NOT EXISTS pg_cron;)
create extension if not exists vector with schema extensions;
```
**Notes:** `if not exists` makes it idempotent (safe re-run). On Supabase the `vector` type and its operators resolve via the search path even when installed into `extensions`. If the planner prefers the in-repo precedent style exactly, `create extension if not exists vector;` (default schema) is also valid and idempotent — but the docs-recommended `with schema extensions` is preferred.

### Pattern 2: HNSW cosine index on a (possibly empty) table
**What:** An approximate-NN index for cosine similarity search.
**When to use:** After the table is created. Builds fine even with zero rows.
**Example:**
```sql
-- Source: https://github.com/pgvector/pgvector  +  https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
-- HNSW has no training step, so it builds correctly on an EMPTY curated table
-- (IVFFlat would not). vector_cosine_ops = cosine distance (embeddings are normalized).
create index if not exists knowledge_entries_embedding_hnsw_idx
  on public.knowledge_entries
  using hnsw (embedding vector_cosine_ops);
```
**Notes:** Default HNSW params (`m = 16`, `ef_construction = 64`) are fine for a small curated corpus — no need to author non-defaults. `vector(1536)` is under the 2000-dim HNSW ceiling, so it indexes directly (no `halfvec` workaround needed). Cosine ops because OpenAI embeddings are normalized; Phase 118's query will use the `<=>` cosine-distance operator that this opclass backs.

### Pattern 3: The `knowledge_entries` table (scope-discriminated, nullable keys)
**What:** One table holding both industry and company entries, distinguished by `scope`.
**Example:**
```sql
create table if not exists public.knowledge_entries (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('industry', 'company')),
  industry_id text,                         -- set when scope='industry' (one of lib/industries.ts ids); NULL for company rows
  company_id  uuid references public.companies(id) on delete cascade,  -- set when scope='company'; NULL for industry rows
  title       text not null,
  body        text not null,
  source      text,                          -- provenance/audit (nullable)
  embedding   extensions.vector(1536),       -- OpenAI text-embedding-3-small; DORMANT this phase (nothing writes it yet)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Scope discriminant invariant (Pattern 5):
  constraint knowledge_entries_scope_keys check (
    (scope = 'industry' and industry_id is not null and company_id is null)
    or
    (scope = 'company'  and company_id  is not null)
  )
);
```
**Notes:**
- `embedding` is **nullable** (no `not null`) — rows can exist before Phase 118 backfills vectors; curation (Phase 119/120) inserts the row, then generates the embedding. This matches the dormant-table reality.
- `industry_id` is `text` (matches `lib/industries.ts` ids like `'house_cleaning'`, `'painting'` — same type as `companies.industries text[]` elements). It is intentionally NOT a FK (industries are a code-side taxonomy in `lib/industries.ts`, not a table).
- `company_id` is a real FK to `companies(id)` with `ON DELETE CASCADE` (mirrors `price_research_cache` / `credit_ledger`) — a deleted company drops its overlay.
- Confirm the embedding column type reference: if the extension is in `extensions` schema, the type is `extensions.vector(1536)` (or just `vector(1536)` when `extensions` is on the search_path, which it is on Supabase). The planner should pick one consistently; `vector(1536)` (unqualified) is the common form and works on Supabase.

### Pattern 4: Dual RLS on one table (the tricky part — VERIFIED expressible)
**What:** Two postures coexisting. Industry rows = neutral/shared (service-role write, broad read); company rows = tenant-gated read+write. Permissive policies are OR-combined, so a single SELECT policy set expresses both.

**Verified fact:** PostgreSQL combines multiple *permissive* policies for the same command with **OR**; *restrictive* policies AND in. Service-role connections **bypass RLS entirely**, so "service-role-only write" = simply *defining no client write policy* (exactly the `price_research_cache` posture).

**Example:**
```sql
alter table public.knowledge_entries enable row level security;

-- READ: one SELECT policy whose USING OR's the two postures.
--   Industry rows: neutral/non-secret → visible to ANY authenticated user.
--     (Optionally tighten to "industries[] overlaps industry_id" — see Open Q2;
--      neutral-readable-to-all is the simpler, seed-aligned default.)
--   Company rows: visible only to members of the owning company.
create policy "knowledge_entries_select" on public.knowledge_entries
  for select to authenticated
  using (
    scope = 'industry'
    or
    (scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    ))
  );

-- WRITE (company overlay only): tenant members may write THEIR OWN company rows.
--   Industry-row writes are SERVICE-ROLE ONLY → expressed by the absence of any
--   policy that allows scope='industry' writes (service role bypasses RLS).
create policy "knowledge_entries_company_insert" on public.knowledge_entries
  for insert to authenticated
  with check (
    scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    )
  );

create policy "knowledge_entries_company_update" on public.knowledge_entries
  for update to authenticated
  using (
    scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    )
  )
  with check (
    scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    )
  );

create policy "knowledge_entries_company_delete" on public.knowledge_entries
  for delete to authenticated
  using (
    scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    )
  );
```
**Why this is clean, not awkward:**
- The OR in the SELECT `USING` is exactly the OR-combination semantics — one policy is enough; it reads naturally.
- Industry writes need NO policy: service role bypasses RLS (the `price_research_cache` posture), and the `scope = 'company'` predicate in every client write policy means a tenant literally cannot insert/update an `scope='industry'` row even if they tried.
- The `company_members` subquery is the **exact** in-repo tenant pattern from `credit_ledger`/phase82 — copy it verbatim, including the `(select auth.uid())` wrapping (Supabase performance idiom + the Phase-82 invariant that policies NEVER reference `companies.user_id`).
- **Phase-82 invariant:** the static test should assert no `companies.user_id` reference appears in any policy (the `credit_ledger` test does this).

**Anti-pattern avoided:** Idempotent re-run. `CREATE POLICY` is NOT idempotent (no `IF NOT EXISTS` for policies in PG 15). Precede each `CREATE POLICY` with `DROP POLICY IF EXISTS "<name>" ON public.knowledge_entries;` (the phase82 pattern) so the migration is safely re-runnable. `ENABLE ROW LEVEL SECURITY` and `CREATE TABLE/INDEX IF NOT EXISTS` are already idempotent.

### Pattern 5: The scope-discriminant CHECK
Already embedded in Pattern 3. Restated for the contract test:
- `scope='industry'` ⟹ `industry_id IS NOT NULL AND company_id IS NULL`
- `scope='company'`  ⟹ `company_id IS NOT NULL`

This is the DB-level guarantee that makes the RLS predicates sound (a `scope='company'` row always has a `company_id` to gate on; a `scope='industry'` row can never carry a `company_id` that would leak it into a tenant's read).

### Anti-Patterns to Avoid
- **IVFFlat on an empty table** — builds a degenerate index (no data to train lists). Use HNSW.
- **Unsized `vector` column** — cannot be HNSW-indexed; KB-01 requires the index. Pin `vector(1536)`.
- **`CREATE POLICY` without a preceding `DROP POLICY IF EXISTS`** — breaks idempotent re-run. Always drop-then-create.
- **Referencing `companies.user_id` in any policy** — fails the Phase-82 invariant (legacy column). Use the `company_members` subquery.
- **Applying the migration to remote** (`db push` / MCP `apply_migration`) — forbidden; deploy is CI→GHCR→Coolify. Author the file only.
- **`NOT NULL` on `embedding`** — the table is dormant; vectors arrive later. Keep it nullable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | A custom distance function / in-app cosine loop | pgvector `vector_cosine_ops` + `<=>` operator + HNSW index | pgvector is the platform standard; in-DB ANN is orders of magnitude faster and is what Phase 118 will query. |
| Multi-tenant read/write gating | A bespoke "is this user in this company" check in app code for the overlay | The `company_members` RLS subquery (phase82 pattern) | RLS enforces at the DB boundary; the in-repo pattern is battle-tested and the Phase-82 build invariant guards it. |
| "Service-role-only writes" | A trigger or app-layer guard rejecting non-service writes | Define no client write policy + service role bypasses RLS | Exactly the `price_research_cache` posture — zero custom code; RLS does it. |
| Scope-key integrity | App-layer validation that industry rows have no company_id | A `CHECK` constraint | The DB rejects malformed rows unconditionally; RLS soundness depends on it. |
| Idempotent extension enable | A guard query "does the extension exist?" | `create extension if not exists vector` | Native idempotency. |

**Key insight:** This entire phase is "lean on Postgres/pgvector/RLS primitives and the two in-repo precedents (`price_research_cache` for the neutral posture, `credit_ledger`/phase82 for the tenant posture)." There is essentially nothing to hand-roll — the value is in *composing the two existing postures onto one table correctly*, which the OR-combination of permissive policies makes a clean composition rather than a hack.

## Common Pitfalls

### Pitfall 1: Forgetting service-role bypass ⟹ over-building industry-write RLS
**What goes wrong:** Adding an INSERT policy for industry rows ("only super-admins") and fighting to express super-admin-ness in RLS.
**Why it happens:** Assuming every write needs a policy.
**How to avoid:** Industry curation (Phase 119) runs server-side via `requireServiceClient()`, which bypasses RLS. Define NO industry-write policy. This is the `price_research_cache` lesson — RLS enabled, zero write policies, service role writes.
**Warning sign:** A policy mentioning `scope = 'industry'` in a `WITH CHECK`.

### Pitfall 2: `CREATE POLICY` is not idempotent
**What goes wrong:** Re-running the migration errors with "policy already exists."
**Why it happens:** PG 15 has no `CREATE POLICY IF NOT EXISTS`.
**How to avoid:** `DROP POLICY IF EXISTS "<name>" ON public.knowledge_entries;` before each `CREATE POLICY` (the phase82 pattern). The contract test should assert the DROP-before-CREATE shape if it asserts on policies.
**Warning sign:** No `DROP POLICY IF EXISTS` lines in the migration.

### Pitfall 3: Unsized or mis-sized `embedding` column blocks the index
**What goes wrong:** `vector` (no size) → HNSW index creation fails; or a dimension mismatch later when Phase 118 inserts 1536-d vectors.
**Why it happens:** Treating the dimension as deferrable.
**How to avoid:** Pin `vector(1536)` now to match `text-embedding-3-small`. The dimension is a hard contract between this schema and Phase 118's `embed()`.
**Warning sign:** `embedding vector` with no parenthesized dimension.

### Pitfall 4: industry SELECT scoping too tight (or too loose)
**What goes wrong:** Either scoping industry reads by `companies.industries[] && industry_id` and accidentally hiding rows from valid users, OR (the inverse) leaking company rows because the SELECT OR-arm is wrong.
**Why it happens:** Industry KB is *neutral* — the seed treats it as non-secret platform content. Over-engineering the read gate adds risk for no security benefit.
**How to avoid:** Default to `scope = 'industry'` → readable by all authenticated (neutral). Keep the company arm strictly `scope = 'company' AND <membership>`. See Open Q2 if the planner wants the tighter industries-overlap read.
**Warning sign:** A SELECT policy that references `companies.industries` in a way that gates *all* rows rather than only the industry arm.

### Pitfall 5: Migration filename sorts before an existing one
**What goes wrong:** A timestamp ≤ `20260624000004` would apply out of order.
**How to avoid:** Use `20260625000001_phase117_knowledge_entries.sql` (strictly after the current newest).
**Warning sign:** Any `20260624...` or earlier prefix.

## Code Examples

The full composed migration (assembling Patterns 1–5) is the deliverable; the planner can lift the blocks above verbatim. The static contract test mirrors the two in-repo precedents:

### Static migration-contract test (mirror)
```typescript
// Source (in-repo): tests/unit/estimate/price-research-cache-migration.test.ts
//                   tests/unit/billing/credit-ledger-migration.test.ts
// Pattern: pure readFileSync + regex assertions over the migration SQL. No DB, no secrets.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260625000001_phase117_knowledge_entries.sql'
)
const read = () => readFileSync(MIGRATION_PATH, 'utf8')

// Assert (non-exhaustive — planner expands):
//  - create extension if not exists vector
//  - CREATE TABLE IF NOT EXISTS public.knowledge_entries
//  - scope ... check (scope in ('industry','company'))
//  - embedding vector(1536)            // dimension pinned
//  - using hnsw (embedding vector_cosine_ops)
//  - ENABLE ROW LEVEL SECURITY
//  - the scope-keys CHECK (industry => company_id null; company => company_id not null)
//  - a company-scoped INSERT/UPDATE/DELETE policy via company_members
//  - a SELECT policy OR-ing scope='industry' with the company-members arm
//  - NO policy referencing companies.user_id   (Phase-82 invariant)
//  - NO scope='industry' WITH CHECK            (service-role-only writes)
//  - DROP POLICY IF EXISTS before each CREATE POLICY (idempotent re-run)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| IVFFlat as the default pgvector index | HNSW as the default for most workloads (esp. small/curated, write-light) | pgvector 0.5.0 (HNSW added) | Use HNSW; builds on empty, better recall/latency for this corpus. |
| `vector` only | `halfvec` / `bit` / sparse vectors + 2000-dim index ceiling | pgvector 0.7.0 | Not needed here — 1536 < 2000, plain `vector(1536)` indexes directly. |
| Extension in `public` | Supabase recommends `extensions` schema | Supabase platform guidance | Keeps `public` clean; both still work and are idempotent. |

**Deprecated/outdated:** Nothing blocking. The in-repo `pg_cron` precedent uses bare `CREATE EXTENSION IF NOT EXISTS pg_cron;` (default schema) — still valid; the docs-recommended `with schema extensions` is the modern preference.

## Open Questions

1. **Pin `vector(1536)` now, or stay provider-agnostic?**
   - What we know: SEED-033 names `text-embedding-3-small` (1536) as the recommended provider but lists "embedding provider" as a still-to-lock decision (#1). The HNSW index REQUIRES a fixed dimension.
   - What's unclear: whether a future provider swap to a different dimension is anticipated.
   - **Recommendation:** Pin `vector(1536)` for v1 and document it in the migration header as the `text-embedding-3-small` contract. If the provider ever changes dimension, that is a new migration (`ALTER ... TYPE vector(N)` + reindex) — cheap and explicit, and the dormant table has no data to migrate yet. Pinning now is correct; do not over-abstract.

2. **Industry SELECT: readable-to-all-authenticated, or scoped to `companies.industries[] && industry_id`?**
   - What we know: industry KB is neutral/non-secret (seed). The simplest gate is `scope='industry'` → all authenticated. A tighter gate would OR-check that the user's company `industries[]` overlaps the row's `industry_id`.
   - What's unclear: whether "neutral" means "any authed user may read any industry's KB" or "a user only sees KBs for industries their company serves."
   - **Recommendation:** Default to **readable by all authenticated** (neutral, simplest, zero leak risk since content is non-secret). Retrieval scoping by `industries[]` happens in Phase 118's `retrieve()` query (a WHERE filter), NOT in RLS — RLS is the security boundary, the industries-overlap is a relevance filter. This keeps RLS simple and correct and matches "neutral/shared." Flag for planner confirmation; if they want defense-in-depth RLS scoping, the tighter arm is a one-line addition (an EXISTS over `companies` joined to `company_members` checking `industries && array[industry_id]`).

3. **`updated_at` auto-touch trigger?**
   - What we know: the table has `updated_at`. Curation (Phase 119/120) re-saves entries.
   - **Recommendation:** Out of scope for 117 unless trivial. App code sets `updated_at = now()` on update (the existing pattern in this repo's actions), OR a Phase-119 `moddatetime` trigger. Do NOT block 117 on it — ship the column with a `default now()`; the trigger (if any) is a curation-phase concern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pgvector (`vector` extension) | KB-01 embedding column + index | ✓ (Supabase platform; enabled by this migration via `create extension`) | platform-provided (≥0.7) | — |
| `companies` table + `id` PK | company_id FK | ✓ (exists) | — | — |
| `company_members` table | KB-03 tenant RLS | ✓ (Phase 79, `20260525000001`) | — | — |
| Supabase Postgres | host | ✓ | PG 15 | — |

**Missing dependencies with no fallback:** None — all prerequisites exist in the repo; pgvector is enabled by this very migration.
**Note:** This phase is migration-authoring only. It is NOT applied to remote here (authored-only; CI→GHCR→Coolify owns deploy). "Available" above means the platform CAN provide it once the migration ships through the pipeline — no remote apply happens in this phase.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` → section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (in-repo; `npx vitest run`) |
| Config file | vitest config (repo root; existing — `tests/unit/**` already runs) |
| Quick run command | `npx vitest run tests/unit/knowledge/knowledge-entries-migration.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KB-01 | extension enabled; table + columns + `vector(1536)`; HNSW cosine index; idempotent DDL | unit (static SQL contract) | `npx vitest run tests/unit/knowledge/knowledge-entries-migration.test.ts` | ❌ Wave 0 |
| KB-02 | industry posture: RLS enabled, NO `scope='industry'` write policy, industry SELECT arm present, no `companies.user_id` | unit (static SQL contract) | same file | ❌ Wave 0 |
| KB-03 | company posture: company-scoped INSERT/UPDATE/DELETE via `company_members`; company SELECT arm; scope CHECK | unit (static SQL contract) | same file | ❌ Wave 0 |

> All three requirements are verifiable by **static regex assertions over the migration file** — no live DB needed, matching the `price-research-cache-migration.test.ts` and `credit-ledger-migration.test.ts` precedents (this is how every prior schema phase validated, and it runs in CI with no secrets/no DB).

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/knowledge/knowledge-entries-migration.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/knowledge tests/unit/estimate/price-research-cache-migration.test.ts tests/unit/billing/credit-ledger-migration.test.ts` (the migration-contract neighbors)
- **Phase gate:** Full suite green (`npx vitest run`) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/knowledge/knowledge-entries-migration.test.ts` — covers KB-01/02/03 (new file; mirror `tests/unit/estimate/price-research-cache-migration.test.ts`).
- [ ] New dir `tests/unit/knowledge/` (does not yet exist).
- [ ] Framework install: none — Vitest already configured and running across the suite.

## Sources

### Primary (HIGH confidence)
- **In-repo precedents (read directly):**
  - `supabase/migrations/20260624000001_phase106_price_research_cache.sql` — the NEUTRAL/service-role-only RLS posture (RLS enabled, zero client policies) to mirror for INDUSTRY rows.
  - `supabase/migrations/20260624000004_phase112_credit_ledger.sql` — the most-recent multi-tenant `company_members` SELECT posture + idempotent DDL + authored-only header.
  - `supabase/migrations/20260526000001_phase82_rls_company_members.sql` — the canonical `company_members` subquery, `(select auth.uid())` idiom, DROP-before-CREATE-POLICY idempotency, and the no-`companies.user_id` invariant assertion.
  - `supabase/migrations/20260525000001_phase79_company_members.sql` — the `company_members` table.
  - `supabase/migrations/20260505000001_phase18_cleanup_cron.sql` — in-repo `CREATE EXTENSION IF NOT EXISTS` precedent (pg_cron).
  - `supabase/migrations/20260620000001_companies_industries_array.sql` — `companies.industries text[]` (the retrieval scoping array; industry_id type alignment).
  - `lib/industries.ts` — the 12-industry taxonomy (industry_id values; `text` ids, not a table).
  - `lib/estimate/price-research/cache.ts` — the service-client read/write pattern the dormant table will later use.
  - `tests/unit/estimate/price-research-cache-migration.test.ts` + `tests/unit/billing/credit-ledger-migration.test.ts` — the static migration-contract test pattern to mirror.
- **Supabase docs** — https://supabase.com/docs/guides/database/extensions/pgvector (`create extension vector with schema extensions`); https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes; https://supabase.com/docs/guides/ai/vector-columns.
- **pgvector** — https://github.com/pgvector/pgvector (HNSW syntax, operator classes, empty-table build, dimension limits).
- **PostgreSQL docs** — https://www.postgresql.org/docs/current/ddl-rowsecurity.html (permissive policies combine with OR; restrictive AND; service-role bypass).

### Secondary (MEDIUM confidence — cross-verified with primary)
- pgvector 2000-dim HNSW ceiling + `halfvec` workaround: https://github.com/pgvector/pgvector/issues/461 and https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/ — corroborates `vector(1536)` indexes directly.
- HNSW vs IVFFlat (empty-table / no-training advantage): https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector ; https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector .

### Tertiary (LOW confidence) — none relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack (pgvector enable, `vector(1536)`, HNSW cosine): **HIGH** — verified against Supabase docs, pgvector repo, and the in-repo `pg_cron` precedent.
- Architecture / dual RLS expressibility: **HIGH** — PostgreSQL OR-combination of permissive policies is documented; both postures already exist verbatim in-repo (`price_research_cache` + `credit_ledger`/phase82).
- Pitfalls: **HIGH** — drawn from PG/pgvector docs + the repo's own idempotency/Phase-82 conventions.
- Embedding dimension future-proofing: **MEDIUM** — provider not yet formally locked (SEED-033 decision #1); 1536 is the recommended default and pinning is the correct v1 call.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (30 days — stable platform primitives; pgvector/Supabase move slowly at this layer).
