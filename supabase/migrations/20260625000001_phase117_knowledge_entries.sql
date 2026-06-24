-- ============================================================================
-- knowledge_entries (Phase 117 — KB-01, KB-02, KB-03)
--
-- The foundation of the v4.8 Industry Knowledge Base. ONE table holds BOTH
-- industry entries (neutral/shared platform asset) and company-overlay entries
-- (tenant-private), distinguished by `scope`. Two RLS postures coexist on the
-- one table via PostgreSQL's permissive-policy OR semantics:
--
--   INDUSTRY rows (KB-02) — neutral/shared. Readable by ANY authenticated user;
--     writable ONLY by the service role (which bypasses RLS) — so NO client
--     write policy targets scope='industry'. Mirrors price_research_cache
--     (RLS enabled, zero client write policies). Curation (Phase 119) writes
--     these server-side via requireServiceClient().
--   COMPANY overlay rows (KB-03) — tenant-private. Readable AND writable only by
--     members of the owning company via the company_members subquery (mirrors
--     credit_ledger/phase82). The Phase-82 invariant holds: policies reference
--     company_members, NEVER the legacy companies owner column.
--
-- The table ships DORMANT: nothing writes the `embedding` vector until Phase 118
-- (the lib/knowledge/ module). `embedding` is therefore NULLABLE.
--
-- embedding vector(1536): pinned for OpenAI text-embedding-3-small (v1). HNSW
--   requires a fixed dimension; a future provider/dimension swap is a cheap
--   ALTER ... TYPE vector(N) + reindex on this (empty) table.
--
-- Idempotent: CREATE EXTENSION/TABLE/INDEX IF NOT EXISTS; DROP POLICY IF EXISTS
--   before each CREATE POLICY (PG 15 has no CREATE POLICY IF NOT EXISTS).
-- Authored-only: NOT applied to remote here — deploy is owned by CI->GHCR->Coolify;
--   never build/migrate on the VPS. NO secrets.
-- ============================================================================

-- 1. Enable pgvector (Supabase-recommended `extensions` schema; idempotent).
--    In-repo precedent: 20260505000001_phase18_cleanup_cron.sql (pg_cron).
create extension if not exists vector with schema extensions;

-- 2. The scope-discriminated table.
create table if not exists public.knowledge_entries (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('industry', 'company')),
  industry_id text,                          -- set when scope='industry' (a lib/industries.ts id); NULL for company rows. NOT a FK (industries are a code-side taxonomy).
  company_id  uuid references public.companies(id) on delete cascade,  -- set when scope='company'; NULL for industry rows
  title       text not null,
  body        text not null,
  source      text,                          -- provenance/audit (nullable)
  embedding   vector(1536),                  -- OpenAI text-embedding-3-small; DORMANT this phase (nullable; nothing writes it until Phase 118)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Scope discriminant invariant: industry => industry_id set & company_id NULL;
  --   company => company_id set. Makes the RLS predicates sound.
  constraint knowledge_entries_scope_keys check (
    (scope = 'industry' and industry_id is not null and company_id is null)
    or
    (scope = 'company'  and company_id  is not null)
  )
);

-- 3. HNSW cosine similarity index. HNSW (not IVFFlat) builds correctly on an
--    EMPTY curated table — no training step. vector_cosine_ops = cosine distance
--    (OpenAI embeddings are normalized). Used by Phase 118's <=> query.
create index if not exists knowledge_entries_embedding_hnsw_idx
  on public.knowledge_entries
  using hnsw (embedding vector_cosine_ops);

-- 4. RLS: two postures on one table (permissive policies OR-combine).
alter table public.knowledge_entries enable row level security;

-- 4a. READ — one SELECT policy OR-ing the two postures:
--     industry rows visible to ALL authenticated (neutral; the industries[]
--       relevance filter belongs in Phase 118's retrieve() WHERE, not RLS),
--     company rows visible only to members of the owning company.
drop policy if exists "knowledge_entries_select" on public.knowledge_entries;
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

-- 4b. WRITE (company overlay ONLY) — tenant members write THEIR OWN company rows.
--     Industry-row writes are SERVICE-ROLE ONLY: expressed by the ABSENCE of any
--     policy allowing scope='industry' writes. The service role bypasses RLS;
--     a tenant literally cannot insert/update/delete a scope='industry' row.
drop policy if exists "knowledge_entries_company_insert" on public.knowledge_entries;
create policy "knowledge_entries_company_insert" on public.knowledge_entries
  for insert to authenticated
  with check (
    scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    )
  );

drop policy if exists "knowledge_entries_company_update" on public.knowledge_entries;
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

drop policy if exists "knowledge_entries_company_delete" on public.knowledge_entries;
create policy "knowledge_entries_company_delete" on public.knowledge_entries
  for delete to authenticated
  using (
    scope = 'company' and company_id in (
      select company_members.company_id from company_members
      where company_members.user_id = (select auth.uid())
    )
  );

comment on table public.knowledge_entries is
  'v4.8 Industry Knowledge Base (Phase 117). One scope-discriminated table: industry rows neutral/service-role-write + readable to all authenticated; company-overlay rows tenant-private via company_members. Dormant (embedding nullable) until Phase 118. embedding vector(1536) = text-embedding-3-small.';
