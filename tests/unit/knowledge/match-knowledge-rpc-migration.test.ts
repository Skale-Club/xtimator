import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * KMOD-02 (static SQL contract): the match_knowledge_entries RPC migration is the
 * pgvector KNN read path retrieve() (Plan 02) calls. Static-source-read pattern
 * (mirrors knowledge-entries-migration.test.ts) — pure file read, runs in CI with
 * NO DB and NO secrets. Authored-only: the migration is NEVER applied here.
 *
 * Asserts the load-bearing contract:
 *   - idempotent (create or replace function public.match_knowledge_entries);
 *   - signature (query_embedding vector(1536), match_industries text[],
 *     match_company uuid, match_count int);
 *   - ranked by cosine distance (order by embedding <=> query_embedding asc);
 *   - the industry+overlay WHERE merge;
 *   - embedding is not null guard + limit match_count;
 *   - language sql stable;
 *   - (negative) no secret-looking token.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260625000002_phase118_match_knowledge_entries.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

// Strip line comments so the documenting header never false-positives on the
// negative (no-secret) assertion.
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '')

describe('KMOD-02: match_knowledge_entries RPC migration static contract', () => {
  it('the migration file exists and sorts after 20260625000001', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
    expect('20260625000002' > '20260625000001').toBe(true)
  })

  it('declares the function idempotently (create or replace)', () => {
    expect(readMigration()).toMatch(
      /create or replace function public\.match_knowledge_entries/i
    )
  })

  it('has the expected signature params', () => {
    const sql = readMigration()
    expect(sql).toMatch(/query_embedding\s+(extensions\.)?vector\(1536\)/i)
    expect(sql).toMatch(/match_industries\s+text\[\]/i)
    expect(sql).toMatch(/match_company\s+uuid/i)
    expect(sql).toMatch(/match_count\s+int/i)
  })

  it('ranks by cosine distance ascending', () => {
    expect(readMigration()).toMatch(
      /order by[\s\S]*embedding\s*<=>\s*query_embedding[\s\S]*asc/i
    )
  })

  it('merges the industry + company-overlay scopes in the WHERE', () => {
    const sql = readMigration()
    expect(sql).toMatch(/scope = 'industry'[\s\S]*industry_id = any\(match_industries\)/i)
    expect(sql).toMatch(/scope = 'company'[\s\S]*company_id = match_company/i)
  })

  it('guards NULL embeddings and limits to match_count', () => {
    const sql = readMigration()
    expect(sql).toMatch(/embedding is not null/i)
    expect(sql).toMatch(/limit match_count/i)
  })

  it('is a stable sql function', () => {
    expect(readMigration()).toMatch(/language sql stable/i)
  })

  it('is authored-only (no remote-apply directive) and secret-free', () => {
    const code = stripComments(readMigration())
    expect(code).not.toMatch(/apply_migration/i)
    expect(code).not.toMatch(/db push/i)
    expect(code).not.toMatch(/sk-ant-|sk-proj-|whsec_/)
  })
})
