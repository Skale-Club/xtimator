import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static SQL contract for the per-company feature switches migration
 * (XTM-D-20261121-feature-switches). Pure file read, CRLF-safe.
 */
const read = (name: string) =>
  readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8').replace(/\r\n/g, '\n')

const sql = read('20261121140000_company_feature_switches.sql')
const previous = read('20260823000005_subscription_interval.sql')

const guardedColumns = (text: string): Set<string> =>
  new Set([...text.matchAll(/NEW\.(\w+)\s+IS DISTINCT FROM OLD\.\1/g)].map((m) => m[1]))

describe('20261121140000_company_feature_switches', () => {
  it('adds the three columns idempotently with the agreed defaults', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS online_payments_allowed BOOLEAN NOT NULL DEFAULT false/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS online_payments_enabled BOOLEAN NOT NULL DEFAULT false/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS digital_signature_allowed BOOLEAN NOT NULL DEFAULT true/)
  })

  it('documents each column and points to the resolver', () => {
    for (const col of ['online_payments_allowed', 'online_payments_enabled', 'digital_signature_allowed']) {
      expect(sql).toContain(`COMMENT ON COLUMN public.companies.${col} IS`)
    }
    expect(sql).toContain('lib/features/company-features.ts')
  })

  it('backfills linked Stripe companies only on the FIRST application', () => {
    // A re-run must not turn payments back on for an owner who switched them
    // off, so the UPDATE sits behind a first_run flag computed BEFORE the
    // columns are added.
    const firstRunCheck = sql.indexOf("column_name  = 'online_payments_allowed'")
    const addColumn = sql.indexOf('ADD COLUMN IF NOT EXISTS online_payments_allowed')
    const guard = sql.indexOf('IF first_run THEN')
    const update = sql.indexOf('UPDATE public.companies')
    expect(firstRunCheck).toBeGreaterThan(-1)
    expect(firstRunCheck).toBeLessThan(addColumn)
    expect(addColumn).toBeLessThan(guard)
    expect(guard).toBeLessThan(update)
    expect(sql).toMatch(
      /IF first_run THEN[\s\S]*?UPDATE public\.companies\s+SET online_payments_allowed = true,\s+online_payments_enabled = true\s+WHERE stripe_account_id IS NOT NULL\s+AND stripe_connect_status IS DISTINCT FROM 'disconnected';\s+END IF;/,
    )
    // Exactly one UPDATE of companies in the whole migration.
    expect(sql.match(/UPDATE public\.companies/g)).toHaveLength(1)
  })

  it('replaces the guard function and guards both platform switches', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_company_billing_columns()')
    expect(sql).not.toMatch(/CREATE TRIGGER[^;]*BEFORE UPDATE/)
    expect(sql).toContain("IF current_user IN ('anon', 'authenticated') THEN")
    const cols = guardedColumns(sql)
    expect(cols.has('online_payments_allowed')).toBe(true)
    expect(cols.has('digital_signature_allowed')).toBe(true)
  })

  it('leaves the tenant switches writable by the tenant', () => {
    const cols = guardedColumns(sql)
    expect(cols.has('online_payments_enabled')).toBe(false)
    expect(cols.has('digital_signature_enabled')).toBe(false)
  })

  it('still guards every column the previous definition guarded', () => {
    const before = guardedColumns(previous)
    const after = guardedColumns(sql)
    expect(before.size).toBeGreaterThan(20)
    for (const col of before) expect(after.has(col), `dropped guard on ${col}`).toBe(true)
  })

  it('forces the platform switches to their defaults on a client-role INSERT', () => {
    // companies_insert lets an authenticated user create a company row, and the
    // BEFORE UPDATE guard does not run on INSERT.
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.companies_platform_switch_insert_defaults()')
    expect(sql).toMatch(/NEW\.online_payments_allowed\s+:= false;/)
    expect(sql).toMatch(/NEW\.digital_signature_allowed\s+:= true;/)
    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS companies_platform_switch_insert_defaults ON public\.companies;\s+CREATE TRIGGER companies_platform_switch_insert_defaults\s+BEFORE INSERT ON public\.companies/,
    )
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';")
  })
})
