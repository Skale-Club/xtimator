import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static safety contract for supabase/audits/check-feature-switches.mjs. The
 * script runs behavior checks on a real database, so what matters here is that
 * it can never keep data, never run by accident and never leak the connection
 * string. Pure source read: no database, no secrets.
 */
const SCRIPT = resolve(process.cwd(), 'supabase/audits/check-feature-switches.mjs')
const src = readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n')
// Code only: drop full-line comments so prose cannot satisfy or break a rule.
const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('check-feature-switches.mjs safety', () => {
  it('always ends the transaction with ROLLBACK, inside a finally', () => {
    expect(code).toMatch(/finally\s*\{[^}]*['"`]ROLLBACK['"`]/)
  })

  it('never makes the transaction permanent (no COMMIT anywhere, comments included)', () => {
    expect(src).not.toMatch(/\bCOMMIT\b/i)
    expect(src).not.toMatch(/\bEND\s*['"`;]/)
  })

  it('opens one transaction and guards risky errors with savepoints', () => {
    expect(code).toMatch(/['"`]BEGIN['"`]/)
    expect(code.match(/['"`]BEGIN['"`]/g)).toHaveLength(1)
    expect(code).toContain('SAVEPOINT')
    expect(code).toContain('ROLLBACK TO SAVEPOINT')
  })

  it('sets lock_timeout and statement_timeout before running checks', () => {
    expect(code).toMatch(/SET LOCAL lock_timeout/)
    expect(code).toMatch(/SET LOCAL statement_timeout/)
    expect(code.indexOf('lock_timeout')).toBeLessThan(code.indexOf('await runChecks'))
  })

  it('requires --yes', () => {
    expect(code).toContain("has('--yes')")
    expect(code).toMatch(/!has\('--yes'\)[\s\S]{0,200}process\.exit\(2\)/)
  })

  it('requires --allow-production for production or unknown targets', () => {
    expect(code).toContain("has('--allow-production')")
    expect(code).toMatch(/kind\.production && !has\('--allow-production'\)[\s\S]{0,300}process\.exit\(2\)/)
    // conservative: only a Supabase host that is not the legacy shared project is dev
    expect(code).toContain('production: true')
    expect(code).toContain('prmqgcrnpuvpzruyzvuv')
  })

  it('resolves the connection string like apply-migrations.mjs', () => {
    const a = code.indexOf('MIGRATION_DATABASE_URL')
    const b = code.indexOf('POSTGRES_URL_NON_POOLING')
    const c = code.indexOf('DATABASE_URL', b)
    expect(a).toBeGreaterThan(-1)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('never prints the connection string, only host, port and database', () => {
    expect(code).not.toMatch(/console\.\w+\([^)]*connectionString/)
    expect(code).not.toMatch(/\$\{connectionString\}/)
    expect(code).not.toMatch(/process\.env\.(MIGRATION_DATABASE_URL|POSTGRES_URL_NON_POOLING|DATABASE_URL)\s*[\),]?\s*\)/)
    expect(code).toMatch(/target:\s+\$\{target\.host\}:\$\{target\.port\}\/\$\{target\.database\}/)
  })

  it('exits non-zero when a check failed', () => {
    expect(code).toMatch(/process\.exit\(results\.FAIL > 0 \? 1 : 0\)/)
  })
})
