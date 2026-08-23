import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Deep-audit hotfix (SEC-C2 / SEC-H1) — shape test for the BEFORE UPDATE
 * guards that stop a tenant JWT from writing billing/ownership columns on
 * `companies` and Stripe-attested payment columns on `estimates` through
 * PostgREST. Mirrors rls-hardening-migration.test.ts (CRLF-normalized).
 */
const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260822000001_protect_billing_columns.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

const COMPANY_PROTECTED = [
  'user_id',
  'tier',
  'credit_balance',
  'byok_enabled',
  'byok_openrouter_key',
  'stripe_customer_id',
  'stripe_subscription_id',
  'stripe_account_id',
  'stripe_connect_status',
  'auto_topup_enabled',
  'auto_topup_pack_price_cents',
  'auto_topup_pack_credits',
]

const ESTIMATE_PROTECTED = [
  'payment_status',
  'paid_at',
  'payment_amount_cents',
  'stripe_payment_intent_id',
  'stripe_checkout_session_id',
]

describe('20260822000001_protect_billing_columns — shape', () => {
  it('guards only client roles, never the service role', () => {
    expect(sql).toContain("IF current_user IN ('anon', 'authenticated') THEN")
    expect(sql).not.toMatch(/current_user IN \([^)]*service_role/)
  })

  it('installs a BEFORE UPDATE trigger on companies and on estimates', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER companies_protect_billing_columns\s+BEFORE UPDATE ON public\.companies/,
    )
    expect(sql).toMatch(
      /CREATE TRIGGER estimates_protect_payment_columns\s+BEFORE UPDATE ON public\.estimates/,
    )
  })

  it.each(COMPANY_PROTECTED)('protects companies.%s', (col) => {
    expect(sql).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
  })

  it.each(ESTIMATE_PROTECTED)('protects estimates.%s', (col) => {
    expect(sql).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
  })

  it('leaves estimate deposit terms tenant-editable', () => {
    expect(sql).not.toMatch(/NEW\.deposit_type/)
    expect(sql).not.toMatch(/NEW\.deposit_value/)
  })

  it('raises insufficient_privilege so PostgREST maps it to 403', () => {
    expect(sql.match(/ERRCODE = 'insufficient_privilege'/g)?.length).toBe(2)
  })

  it('is idempotent (DROP TRIGGER IF EXISTS + CREATE OR REPLACE FUNCTION)', () => {
    expect(sql.match(/DROP TRIGGER IF EXISTS \w+ ON public\./g)?.length).toBe(2)
    expect(sql.match(/CREATE OR REPLACE FUNCTION public\./g)?.length).toBe(2)
  })
})

/**
 * Follow-up guard: 20260823000001 added the Connect-health columns, which are
 * Stripe-attested (paymentsEnabled reads them) and must be covered by the same
 * BEFORE UPDATE guard. 20260823000004 replaces the function body to include
 * them — assert the newer file protects both.
 */
const followUpSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260823000004_protect_connect_health_columns.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('20260823000004_protect_connect_health_columns — shape', () => {
  it.each(['stripe_charges_enabled', 'stripe_connect_disabled_reason'])(
    'protects companies.%s',
    (col) => {
      expect(followUpSql).toContain(`NEW.${col}`)
      expect(followUpSql).toContain(`IS DISTINCT FROM OLD.${col}`)
    },
  )

  it('replaces the same function the trigger already points at', () => {
    expect(followUpSql).toContain('CREATE OR REPLACE FUNCTION public.protect_company_billing_columns()')
    expect(followUpSql).not.toContain('CREATE TRIGGER')
  })

  it('still guards only client roles', () => {
    expect(followUpSql).toContain("IF current_user IN ('anon', 'authenticated') THEN")
  })
})
