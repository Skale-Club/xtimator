import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260708000001_phase160_public_url_contract.sql'
)
const SQL = readFileSync(MIGRATION_PATH, 'utf8')

describe('phase 160 — public URL contract migration shape', () => {
  it('PUBURL-01: adds companies.slug (nullable, idempotent)', () => {
    expect(SQL).toMatch(/ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT/)
  })

  it('PUBURL-01: adds estimates.public_slug_token (nullable, idempotent)', () => {
    expect(SQL).toMatch(/ALTER TABLE estimates ADD COLUMN IF NOT EXISTS public_slug_token TEXT/)
  })

  it('PUBURL-01: companies.slug has its OWN partial unique index', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug\s+ON public\.companies\(slug\) WHERE slug IS NOT NULL/)
  })

  it('PUBURL-01/03: estimates.public_slug_token has its OWN partial unique index, separate from share_token', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_public_slug_token\s+ON public\.estimates\(public_slug_token\) WHERE public_slug_token IS NOT NULL/)
    expect(SQL).not.toContain('idx_estimates_share_token') // that index already exists elsewhere — this migration must not touch it
  })

  it('PUBURL-03 (highest-severity, permanent regression guard): NO anon grant or policy of any kind', () => {
    expect(SQL).not.toMatch(/TO\s+anon/i)
    expect(SQL).not.toMatch(/FOR\s+SELECT[^;]*anon/i)
    expect(SQL).not.toMatch(/CREATE\s+POLICY/i)
    expect(SQL).not.toMatch(/GRANT\b/i)
  })

  it('is pure DDL -- no INSERT/UPDATE/DELETE data statements', () => {
    expect(SQL).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(SQL).not.toMatch(/\bUPDATE\s+public\./i)
  })

  it('Secret handling (CLAUDE.md): no API keys, signing secrets, or sb_secret_/sk-ant-/whsec_ patterns', () => {
    expect(SQL).not.toMatch(/whsec_/)
    expect(SQL).not.toMatch(/sk-ant-/)
    expect(SQL).not.toMatch(/sb_secret_/)
    expect(SQL).not.toMatch(/sk_(test|live)_/)
  })
})
