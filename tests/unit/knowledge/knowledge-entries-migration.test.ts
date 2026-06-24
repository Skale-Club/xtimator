import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * KB-01 + KB-02 + KB-03 (static SQL contract): the knowledge_entries migration
 * must ship the foundation of the v4.8 Industry Knowledge Base — ONE table with
 * BOTH coexisting RLS postures:
 *   - INDUSTRY rows (KB-02): pgvector enabled, table + columns + scope CHECK +
 *     vector(1536) embedding + HNSW cosine index; RLS enabled; readable by ALL
 *     authenticated; writable ONLY by the service role (NO client write policy
 *     targets scope='industry') — mirrors price_research_cache.
 *   - COMPANY overlay rows (KB-03): readable AND writable only by members of the
 *     owning company via the company_members subquery — mirrors credit_ledger /
 *     phase82 (NEVER the legacy companies.user_id column).
 *
 * Static-source-read pattern (mirrors tests/unit/billing/credit-ledger-migration.test.ts).
 * Pure file read — runs in CI with NO DB and NO secrets. RED until the migration
 * file is authored (Task 2); the migration is authored-only (never applied here).
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260625000001_phase117_knowledge_entries.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

// Strip line comments so the documenting header note never false-positives on
// the "forbidden value" / "no WITH CHECK on industry" negative assertions.
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '')

describe('KB-01/KB-02/KB-03: knowledge_entries migration static contract', () => {
  // ---- KB-01: extension + table + columns + index ----

  it('enables the pgvector (vector) extension idempotently', () => {
    expect(readMigration()).toMatch(/create extension if not exists vector/i)
  })

  it('creates the table public.knowledge_entries idempotently', () => {
    expect(readMigration()).toMatch(
      /create table if not exists public\.knowledge_entries/i
    )
  })

  it('constrains scope via a CHECK enum (industry/company)', () => {
    const sql = readMigration()
    expect(sql).toContain("'industry'")
    expect(sql).toContain("'company'")
    expect(sql).toMatch(/scope\s+text not null check/i)
    expect(sql).toMatch(/scope in \(/i)
  })

  it('pins the embedding dimension to vector(1536) and leaves it NULLABLE (dormant)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/embedding\s+(extensions\.)?vector\(1536\)/i)
    // Dormant table: nothing writes the vector until Phase 118, so the embedding
    // column declaration must NOT carry `not null`.
    const embeddingLine =
      sql.split('\n').find((l) => /embedding/i.test(l) && /vector\(1536\)/i.test(l)) ?? ''
    expect(embeddingLine).not.toMatch(/not null/i)
  })

  it('creates the HNSW cosine similarity index on embedding', () => {
    const sql = readMigration()
    expect(sql).toMatch(/using hnsw \(embedding vector_cosine_ops\)/i)
    expect(sql).toMatch(
      /create index if not exists knowledge_entries_embedding_hnsw_idx/i
    )
  })

  it('declares the scope-discriminant CHECK (industry => industry_id set & company_id null; company => company_id set)', () => {
    const code = stripComments(readMigration())
    expect(code).toMatch(
      /scope = 'industry'[\s\S]*industry_id is not null[\s\S]*company_id is null/i
    )
    expect(code).toMatch(/scope = 'company'[\s\S]*company_id\s+is not null/i)
  })

  it('declares company_id as a FK to companies with ON DELETE CASCADE', () => {
    expect(readMigration()).toMatch(
      /company_id\s+uuid references public\.companies\(id\) on delete cascade/i
    )
  })

  it('declares created_at and updated_at as timestamptz not null default now()', () => {
    const sql = readMigration()
    expect(sql).toMatch(/created_at\s+timestamptz not null default now\(\)/i)
    expect(sql).toMatch(/updated_at\s+timestamptz not null default now\(\)/i)
  })

  // ---- RLS ----

  it('enables row level security', () => {
    expect(readMigration()).toMatch(/enable row level security/i)
  })

  it('OR-combines both postures in one SELECT policy (KB-02 industry + KB-03 company arm)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/scope = 'industry'/i)
    expect(sql).toMatch(/scope = 'company' and company_id in \(/i)
    expect(sql).toMatch(/company_members\.company_id/)
  })

  // ---- KB-03: company write policies ----

  it('declares company-scoped INSERT/UPDATE/DELETE policies gated by company_members', () => {
    const sql = readMigration()
    expect(sql).toMatch(/for insert to authenticated/i)
    expect(sql).toMatch(/for update to authenticated/i)
    expect(sql).toMatch(/for delete to authenticated/i)
    expect(sql).toMatch(/company_members\.company_id/)
  })

  // ---- KB-02: service-role-only industry writes ----

  it('has NO WITH CHECK clause that writes scope=industry rows (service-role-only)', () => {
    const code = stripComments(readMigration())
    expect(code).not.toMatch(/with check[\s\S]*scope = 'industry'/i)
  })

  // ---- Phase-82 invariant ----

  it('never references the legacy companies.user_id column (Phase-82 invariant)', () => {
    const code = stripComments(readMigration())
    expect(code).not.toMatch(/companies\.user_id/)
  })

  // ---- Idempotency + Supabase idiom ----

  it('uses DROP POLICY IF EXISTS before each CREATE POLICY (idempotent re-run)', () => {
    expect(readMigration()).toMatch(/drop policy if exists/i)
  })

  it('uses the (select auth.uid()) Supabase idiom', () => {
    expect(readMigration()).toMatch(/\(\s*select auth\.uid\(\)\s*\)/i)
  })
})
