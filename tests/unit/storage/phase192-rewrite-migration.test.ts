import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 192 Plan 01 — URL-02 (static SQL contract): the storage_url_rewrites
 * migration must ship a REVERSIBLE RECORD table — full old_value AND new_value
 * as jsonb, a value_kind enum covering scalar/jsonb/user_metadata targets, the
 * batch index, the partial open-batch index, the per-batch-row unique index,
 * RLS enabled with NO policies, and the by-hand-apply warning (this repo's
 * deploy pipeline never runs migrations).
 *
 * Static-source-read pattern (mirrors tests/unit/billing/credit-ledger-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets.
 *
 * CRLF guard: this repo has a standing class of tests that pass in CI and fail
 * on Windows because the checked-out file has \r\n. Every assertion here runs
 * against a \n-normalized, lowercased copy so this test never joins that set.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql'
)

/** Normalized (CRLF-stripped, lowercased) migration source. */
function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
}

/** Migration source with SQL line comments stripped — DDL body only. */
function readMigrationCode(): string {
  return readMigration().replace(/--[^\n]*/g, '')
}

const VALUE_KINDS = ['text', 'jsonb', 'user_metadata'] as const

describe('URL-02: storage_url_rewrites migration static contract', () => {
  it('creates the table public.storage_url_rewrites idempotently', () => {
    expect(readMigrationCode()).toMatch(
      /create table if not exists public\.storage_url_rewrites/
    )
  })

  it('declares the batch/target/row_pk identity columns', () => {
    const code = readMigrationCode()
    expect(code).toMatch(/id\s+bigint generated always as identity primary key/)
    expect(code).toMatch(/batch_id\s+uuid\s+not null/)
    expect(code).toMatch(/target\s+text\s+not null/)
    expect(code).toMatch(/row_pk\s+text\s+not null/)
  })

  it('records old_value AND new_value as JSONB NOT NULL (reversible record, drift check)', () => {
    const code = readMigrationCode()
    // jsonb (not text) is what lets a scalar column, a whole jsonb document and
    // a whole user_metadata object record identically.
    expect(code).toMatch(/old_value\s+jsonb\s+not null/)
    // new_value exists so a revert can refuse to clobber a drifted row.
    expect(code).toMatch(/new_value\s+jsonb\s+not null/)
    expect(code).not.toMatch(/old_value\s+text/)
    expect(code).not.toMatch(/new_value\s+text/)
  })

  it('carries the rewritten_at default and a nullable reverted_at', () => {
    const code = readMigrationCode()
    expect(code).toMatch(/rewritten_at\s+timestamptz\s+not null default now\(\)/)
    expect(code).toMatch(/reverted_at\s+timestamptz/)
    // reverted_at must stay nullable — null IS the "still open" state.
    expect(code).not.toMatch(/reverted_at\s+timestamptz\s+not null/)
  })

  it('constrains value_kind via a 3-value CHECK enum (text/jsonb/user_metadata)', () => {
    const code = readMigrationCode()
    expect(code).toMatch(/value_kind\s+text\s+not null check/)
    for (const kind of VALUE_KINDS) {
      expect(code, `missing value_kind value: ${kind}`).toContain(`'${kind}'`)
    }
  })

  it('creates the batch lookup index', () => {
    expect(readMigrationCode()).toMatch(
      /create index if not exists storage_url_rewrites_batch_idx[\s\S]*?\(batch_id\)/
    )
  })

  it('creates the PARTIAL open-batch index (where reverted_at is null)', () => {
    const code = readMigrationCode()
    expect(code).toMatch(
      /create index if not exists storage_url_rewrites_open_idx[\s\S]*?where reverted_at is null/
    )
  })

  it('creates the per-batch-per-row UNIQUE index (crash-resume cannot double-record)', () => {
    expect(readMigrationCode()).toMatch(
      /create unique index if not exists storage_url_rewrites_batch_row_uniq[\s\S]*?\(batch_id,\s*target,\s*row_pk\)/
    )
  })

  it('enables row level security with NO policies (deny-all; service role bypasses)', () => {
    const code = readMigrationCode()
    expect(code).toMatch(
      /alter table public\.storage_url_rewrites enable row level security/
    )
    expect(code).not.toMatch(/create policy/)
    expect(code).not.toMatch(/for select/)
    expect(code).not.toMatch(/for insert/)
  })

  it('comments the table as the URL-02 reversible record that must not be truncated', () => {
    const sql = readMigration()
    expect(sql).toMatch(/comment on table public\.storage_url_rewrites is/)
    expect(sql).toContain('url-02')
    expect(sql).toMatch(/must not be truncated/)
  })

  it('documents its own rollback (drop table)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/drop table if exists public\.storage_url_rewrites;/)
  })

  it('warns that this repo applies migrations to production BY HAND', () => {
    const sql = readMigration()
    expect(sql).toMatch(/by hand/)
    expect(sql).toMatch(/deploy pipeline[\s\S]*?never runs? migrations/)
    expect(sql).toContain('docs/storage-migration.md')
  })

  it('says deep-equal, not byte-exact, about the jsonb restore', () => {
    const sql = readMigration()
    // jsonb does not preserve key order or whitespace — a restore compares
    // equal by VALUE. Claiming "byte-exact" would be a false promise.
    expect(sql).toMatch(/deep-equal/)
    expect(sql).not.toMatch(/byte-exact/)
  })
})
