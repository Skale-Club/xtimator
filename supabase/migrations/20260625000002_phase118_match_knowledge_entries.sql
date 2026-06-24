-- ============================================================================
-- match_knowledge_entries (Phase 118 — KMOD-02): pgvector KNN read RPC.
--
-- Returns the MERGED candidate set ranked by cosine similarity: industry rows
-- whose industry_id is in the company's industries[] UNION the company's own
-- overlay rows. Scoping lives in the WHERE (the module is trusted server-side
-- and passes the company's OWN industries[]/companyId — NEVER from LLM output).
--
-- similarity = 1 - cosine_distance, so a higher number is a closer match; the
-- ORDER BY uses the raw `<=>` distance ascending (the HNSW cosine index from
-- 20260625000001 serves it). NULL embeddings (dormant rows) are excluded.
--
-- Idempotent (create or replace). Authored-only: NOT applied to remote here —
-- deploy is owned by CI->GHCR->Coolify; never build/migrate on the VPS. NO secrets.
-- ============================================================================
create or replace function public.match_knowledge_entries (
  query_embedding extensions.vector(1536),
  match_industries text[],
  match_company uuid,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  body text,
  source text,
  scope text,
  similarity float
)
language sql stable
as $$
  select
    ke.id, ke.title, ke.body, ke.source, ke.scope,
    1 - (ke.embedding <=> query_embedding) as similarity
  from public.knowledge_entries ke
  where ke.embedding is not null
    and (
      (ke.scope = 'industry' and ke.industry_id = any(match_industries))
      or
      (ke.scope = 'company'  and ke.company_id = match_company)
    )
  order by ke.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_knowledge_entries(extensions.vector, text[], uuid, int) is
  'v4.8 Phase 118 (KMOD-02): pgvector KNN over knowledge_entries. Merges industry KB (industry_id in caller industries[]) + company overlay (company_id = caller company) ranked by cosine similarity. Caller-supplied scoping (multi-tenant invariant); excludes NULL embeddings.';
