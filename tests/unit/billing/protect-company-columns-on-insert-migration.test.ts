import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Shape test for 20261121170000: the BEFORE INSERT counterpart of the
 * companies billing guard. The BEFORE UPDATE guard (20260822000001, last
 * extended without the feature switches in 20260823000005) never covered
 * INSERT, and `companies_insert` lets a tenant create a company they own, so a
 * tenant could insert tier = 'business', credit_balance = 1000000, ... and keep
 * them. Static source read; the behavior is proven on a real PostgreSQL by
 * supabase/audits/check-feature-switches.mjs.
 */
const read = (file: string) =>
  readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8').replace(/\r\n/g, '\n')

const insertSql = read('20261121210000_protect_company_billing_columns_on_insert.sql')
const updateGuardSql = read('20260823000005_subscription_interval.sql')

// Code only: drop `--` comments so prose cannot satisfy or break a rule.
const stripComments = (sql: string) =>
  sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const insertCode = stripComments(insertSql)

/** Columns of the BEFORE UPDATE guard: every `NEW.<col> IS DISTINCT FROM OLD.<col>`. */
const updateGuardColumns = [
  ...updateGuardSql.matchAll(/NEW\.(\w+)\s+IS DISTINCT FROM OLD\.(\w+)/g),
].map((m) => {
  expect(m[1]).toBe(m[2])
  return m[1]
})

/** Assignments of the insert guard: `NEW.<col> := <literal>;`. */
const assignments = new Map(
  [...insertCode.matchAll(/NEW\.(\w+)\s*:=\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()] as const),
)

// Real column defaults on the replayed database. A protected column without a
// default must be reset to NULL. If a default changes, the function and this
// table change together.
const NON_NULL_DEFAULTS: Record<string, string> = {
  tier: "'free'",
  credit_balance: '0',
  byok_enabled: 'false',
  auto_topup_enabled: 'false',
}

describe('20261121210000_protect_company_billing_columns_on_insert — shape', () => {
  it('installs a BEFORE INSERT ... FOR EACH ROW trigger on public.companies', () => {
    expect(insertCode).toMatch(
      /CREATE TRIGGER companies_protect_billing_columns_on_insert\s+BEFORE INSERT ON public\.companies\s+FOR EACH ROW EXECUTE FUNCTION public\.protect_company_billing_columns_on_insert\(\)/,
    )
    expect(insertCode).not.toMatch(/BEFORE UPDATE/)
  })

  it('acts only for the client roles, never for the service role or the owner', () => {
    expect(insertCode).toContain("IF current_user IN ('anon', 'authenticated') THEN")
    expect(insertCode).not.toMatch(/current_user IN \([^)]*service_role/)
  })

  it('forces the values silently (no RAISE), so older deployed code keeps working', () => {
    expect(insertCode).not.toMatch(/RAISE/)
    expect(insertCode).toContain('RETURN NEW;')
  })

  it('covers exactly the columns the UPDATE guard covers, except user_id', () => {
    // Guard the parser itself: the UPDATE guard of 20260823000005 has 30 columns.
    expect(updateGuardColumns).toHaveLength(30)
    expect(updateGuardColumns).toContain('user_id')
    const expected = updateGuardColumns.filter((c) => c !== 'user_id').sort()
    expect([...assignments.keys()].sort()).toEqual(expected)
    // user_id must stay client-set (RLS checks it equals auth.uid()).
    expect(assignments.has('user_id')).toBe(false)
  })

  it.each(updateGuardColumns.filter((c) => c !== 'user_id'))(
    'resets %s to its default (or NULL when it has none)',
    (col) => {
      expect(assignments.get(col)).toBe(NON_NULL_DEFAULTS[col] ?? 'NULL')
    },
  )

  it('is independent of the feature-switch migration', () => {
    for (const col of [
      'online_payments_allowed',
      'online_payments_enabled',
      'digital_signature_allowed',
    ]) {
      expect(insertSql).not.toContain(col)
    }
  })

  it('is idempotent (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS) and documented', () => {
    expect(insertCode).toContain(
      'CREATE OR REPLACE FUNCTION public.protect_company_billing_columns_on_insert()',
    )
    expect(insertCode).toMatch(
      /DROP TRIGGER IF EXISTS companies_protect_billing_columns_on_insert ON public\.companies;/,
    )
    expect(insertCode).toContain(
      'COMMENT ON FUNCTION public.protect_company_billing_columns_on_insert()',
    )
    expect(insertSql).toContain('APPLY BY HAND to BOTH databases')
  })
})
