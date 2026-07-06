import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Pre-launch audit fix (DB hardening) — companies_delete restricted to
 * role='owner'. Phase 85 (20260526000002) granted DELETE to ANY
 * company_members row for the company — owner, admin, or member alike, even
 * after Team Seats (Phase 135) introduced the 3-role matrix specifically to
 * differentiate privilege. Static contract test (mirrors the Phase 85 test's
 * own style — no live DB in the CI gate) proving the new migration narrows
 * companies_delete to owner-only.
 */

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260706000005_companies_delete_owner_only.sql',
)

describe('companies_delete owner-only restriction — static contract', () => {
  it('migration file exists at the expected path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  const sql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

  it('recreates companies_delete scoped to role = \'owner\'', () => {
    const deleteBlock = sql.match(/CREATE POLICY\s+"companies_delete"[\s\S]*?;/i)?.[0] ?? ''
    expect(deleteBlock).toMatch(/company_members/i)
    expect(deleteBlock).toMatch(/role\s*=\s*'owner'/i)
  })

  it('does not grant DELETE unconditionally to any company_members row (the role filter appears AFTER the OR id IN membership branch)', () => {
    const deleteBlock = sql.match(/CREATE POLICY\s+"companies_delete"[\s\S]*?;/i)?.[0] ?? ''
    const orIndex = deleteBlock.search(/OR\s+id\s+IN/i)
    const roleIndex = deleteBlock.search(/role\s*=\s*'owner'/i)
    expect(orIndex).toBeGreaterThan(-1)
    expect(roleIndex).toBeGreaterThan(orIndex)
  })

  it('wraps the rewrite in a transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m)
    expect(sql).toMatch(/COMMIT;\s*$/m)
  })
})
