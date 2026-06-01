/**
 * Wave 0 — ADMINLOG-01: pipeline_attempts view DDL static contract.
 * Tests: security_invoker=on present, GROUP BY attempt_id, derived columns.
 * RED until Plan 93-01 creates the migration SQL file.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'

function findViewMigration(): string | null {
  const dir = resolve(process.cwd(), 'supabase', 'migrations')
  try {
    const files = readdirSync(dir)
    const f = files.find(n => n.includes('phase93') && n.endsWith('.sql'))
    return f ? resolve(dir, f) : null
  } catch {
    return null
  }
}

describe('ADMINLOG-01: pipeline_attempts view DDL', () => {
  it('migration .sql file exists for Phase 93', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    expect(path).toBeTruthy()
  })

  it('view SQL contains security_invoker = on', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    const sql = readFileSync(path!, 'utf8')
    expect(sql).toMatch(/security_invoker\s*=\s*on/i)
  })

  it('view SQL uses CREATE OR REPLACE VIEW public.pipeline_attempts', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    const sql = readFileSync(path!, 'utf8')
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.pipeline_attempts/i)
  })

  it('view SQL contains GROUP BY.*attempt_id', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    const sql = readFileSync(path!, 'utf8')
    expect(sql).toMatch(/GROUP\s+BY\s+.*attempt_id/i)
  })

  it('view SQL derives terminal_status with CASE WHEN BOOL_OR or equivalent precedence logic', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    const sql = readFileSync(path!, 'utf8')
    expect(sql).toMatch(/terminal_status/i)
    expect(sql).toMatch(/CASE|case/i)
  })

  it('view SQL exposes total_duration_ms derived column', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    const sql = readFileSync(path!, 'utf8')
    expect(sql).toMatch(/total_duration_ms/i)
  })

  it('view SQL exposes step_reached derived column', () => {
    const path = findViewMigration()
    if (!path) {
      expect.fail('Wave 0: supabase/migrations/*phase93*.sql not yet written')
    }
    const sql = readFileSync(path!, 'utf8')
    expect(sql).toMatch(/step_reached/i)
  })
})
