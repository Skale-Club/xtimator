// tests/unit/phase135-team-seats-migration.test.ts
// Phase 135 Plan 01 (SEAT-01): team-seats schema migration shape (static contract)
//
// Why static: the repo does not ship a live-DB integration harness for migrations
// (Phases 19/24/38/79/129 used the same read-file + regex pattern). This test locks
// the widened role CHECK, the company_invites table shape, the RLS posture, the
// retrocompat guarantee (no companies billing column touched), and the no-secrets
// rule so the authored-only migration cannot drift.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/20260628000001_phase135_team_seats_schema.sql'
)
const SQL = readFileSync(MIGRATION_PATH, 'utf8')

describe('phase 135 — team seats schema migration shape', () => {
  it('SEAT-01: idempotently drops the named role CHECK before re-adding', () => {
    expect(SQL).toMatch(/DROP CONSTRAINT IF EXISTS company_members_role_check/i)
  })

  it('SEAT-01: widens role to the 3-role matrix via a named ADD CONSTRAINT', () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT company_members_role_check\s+CHECK\s*\(role IN \('owner',\s*'admin',\s*'member'\)\)/i
    )
  })

  it('migrates legacy staff memberships before narrowing the role check', () => {
    const migrateAt = SQL.indexOf(
      "UPDATE public.company_members SET role = 'member' WHERE role = 'staff'",
    )
    const constraintAt = SQL.indexOf('ADD CONSTRAINT company_members_role_check')
    expect(migrateAt).toBeGreaterThan(-1)
    expect(migrateAt).toBeLessThan(constraintAt)
  })

  it('idempotent: CREATE TABLE IF NOT EXISTS public.company_invites', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.company_invites/i)
  })

  it('declares an id primary key', () => {
    expect(SQL).toMatch(/id\s+uuid\s+PRIMARY KEY/i)
  })

  it('has all 9 company_invites columns', () => {
    for (const col of [
      'company_id',
      'email',
      'role',
      'token',
      'status',
      'invited_by',
      'expires_at',
      'created_at',
    ]) {
      expect(SQL).toContain(col)
    }
  })

  it('invite role can never be owner (admin|member only)', () => {
    expect(SQL).toMatch(/role\s+text NOT NULL CHECK \(role IN \('admin',\s*'member'\)\)/i)
  })

  it('status enum is pending|accepted|revoked|expired', () => {
    expect(SQL).toMatch(/status IN \('pending',\s*'accepted',\s*'revoked',\s*'expired'\)/i)
  })

  it('token is unique', () => {
    expect(SQL).toMatch(/token\s+text NOT NULL UNIQUE/i)
  })

  it('company_id FK cascades to companies', () => {
    expect(SQL).toMatch(/REFERENCES companies\(id\) ON DELETE CASCADE/i)
  })

  it('RLS is enabled on company_invites', () => {
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/i)
  })

  it('manage-policies scope to owner/admin members of the company', () => {
    expect(SQL).toMatch(/role IN \('owner',\s*'admin'\)/i)
    expect(SQL).toContain('company_invites_select')
  })

  it('no broad anon/public accept policy (token-accept is service-role only)', () => {
    expect(SQL).not.toMatch(/TO anon/i)
    expect(SQL).not.toMatch(/USING \(true\)/i)
  })

  it('idempotent index on token', () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS company_invites_token/i)
  })

  it('retrocompat: touches no companies billing column', () => {
    expect(SQL).not.toMatch(/ALTER TABLE companies[^;]*(stripe|tier|subscription)/i)
  })

  it('Secret handling (CLAUDE.md): no API keys, signing secrets, or sb_secret_/sk-ant-/whsec_ patterns', () => {
    expect(SQL).not.toMatch(/whsec_/)
    expect(SQL).not.toMatch(/sk-ant-/)
    expect(SQL).not.toMatch(/sb_secret_/)
    expect(SQL).not.toMatch(/sk_(test|live)_/)
  })
})
