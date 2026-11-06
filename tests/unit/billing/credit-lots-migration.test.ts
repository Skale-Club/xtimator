import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-055 Phase B (static SQL contract): the credit-lots migration.
 *
 * Pure file read - runs in CI with no DB and no secrets (same pattern as
 * credit-ledger-migration.test.ts). CRLF-normalised so a Windows checkout
 * cannot flip a multi-line assertion.
 */
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20261106000001_credit_lots.sql'
)

const sql = readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n')
// Code only: strip line comments so header prose cannot satisfy or trip a check.
const code = sql.replace(/--[^\n]*/g, '')

/** Body of one CREATE OR REPLACE FUNCTION (up to its closing `$$;`). */
function fnBody(name: string): string {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const end = code.indexOf('$$;', code.indexOf('AS $$', start) + 5)
  return code.slice(start, end)
}

describe('credit_lots table', () => {
  it('is created idempotently with the required columns and CHECKs', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.credit_lots/)
    expect(code).toMatch(/company_id\s+UUID NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/)
    expect(code).toMatch(/source\s+TEXT NOT NULL CHECK \(source IN \('signup','monthly','topup','adjust'\)\)/)
    expect(code).toMatch(/granted\s+INTEGER NOT NULL CHECK \(granted >= 0\)/)
    expect(code).toMatch(/remaining\s+INTEGER NOT NULL CHECK \(remaining >= 0\)/)
    expect(code).toMatch(/expires_at\s+TIMESTAMPTZ,/)
    expect(code).toMatch(/period_key\s+TEXT,/)
    expect(code).toMatch(/ref_id\s+TEXT,/)
    expect(code).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/)
  })

  it('indexes (company_id, expires_at)', () => {
    expect(code).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_credit_lots_company_expires\s+ON public\.credit_lots\(company_id, expires_at\)/
    )
  })

  it('enables RLS with ONLY a company_members SELECT policy (never the legacy owner column)', () => {
    expect(code).toMatch(/ALTER TABLE public\.credit_lots ENABLE ROW LEVEL SECURITY/)
    expect(code).toMatch(/CREATE POLICY "credit_lots_select" ON public\.credit_lots FOR SELECT TO authenticated/)
    expect(code).toMatch(/company_members\.company_id/)
    expect(code).not.toMatch(/companies\.user_id/)
    expect(code).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i)
    expect(code).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.credit_lots FROM anon, authenticated/)
  })
})

describe('companies.credit_debt', () => {
  it('is NOT NULL DEFAULT 0 CHECK >= 0', () => {
    expect(code).toMatch(
      /ADD COLUMN IF NOT EXISTS credit_debt INTEGER NOT NULL DEFAULT 0 CHECK \(credit_debt >= 0\)/
    )
  })
})

describe('credit_ledger widening', () => {
  it("adds 'expire' to reason and 'chat' to operation_type via named, guarded CHECKs", () => {
    expect(code).toMatch(
      /ADD CONSTRAINT credit_ledger_reason_check\s+CHECK \(reason IN \('grant','debit','topup','adjust','expire'\)\)/
    )
    expect(code).toMatch(
      /ADD CONSTRAINT credit_ledger_operation_type_check\s+CHECK \(operation_type IS NULL OR operation_type IN \('estimate','photo_batch','audio_minutes','price_research','chat'\)\)/
    )
    // Real constraint names are looked up, not assumed.
    expect(code).toMatch(/FROM pg_constraint/)
    expect(code).toMatch(/DROP CONSTRAINT %I/)
  })

  it('adds nullable lot_id (FK, ON DELETE SET NULL) and lot_split JSONB', () => {
    expect(code).toMatch(
      /ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES public\.credit_lots\(id\) ON DELETE SET NULL/
    )
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS lot_split JSONB/)
  })
})

describe('RPCs', () => {
  it('grant_credit_lot has the specified signature and return shape', () => {
    const body = fnBody('grant_credit_lot')
    for (const arg of [
      'p_company_id UUID',
      'p_source TEXT',
      'p_credits INTEGER',
      'p_expires_at TIMESTAMPTZ',
      'p_period_key TEXT',
      'p_ref_id TEXT',
      'p_idempotency_key TEXT',
      'p_reason TEXT',
    ]) {
      expect(body, arg).toContain(arg)
    }
    expect(body).toMatch(/RETURNS TABLE\(balance_after INTEGER, applied BOOLEAN, lot_id UUID\)/)
  })

  it('grant_credit_lot is idempotent (fast path + unique_violation backstop), pays down debt first', () => {
    const body = fnBody('grant_credit_lot')
    expect(body).toMatch(/idempotency_key = p_idempotency_key/)
    expect(body).toMatch(/EXCEPTION WHEN unique_violation THEN/)
    expect(body).toMatch(/LEAST\(p_credits, v_debt\)/)
    expect(body).toMatch(/p_credits - v_paydown/)
    expect(body).toMatch(/credit_balance = v_new_balance/)
    // Row lock via UPDATE ... RETURNING, like apply_credit_ledger_entry.
    expect(body).toMatch(/UPDATE public\.companies AS c[\s\S]*RETURNING c\.credit_debt INTO v_debt/)
  })

  it('consume_credits has the specified signature and return shape', () => {
    const body = fnBody('consume_credits')
    for (const arg of [
      'p_company_id UUID',
      'p_credits INTEGER',
      'p_operation_type TEXT',
      'p_ref_id TEXT',
      'p_real_cost_usd NUMERIC',
      'p_markup NUMERIC',
      'p_idempotency_key TEXT',
    ]) {
      expect(body, arg).toContain(arg)
    }
    expect(body).toMatch(/RETURNS TABLE\(balance_after INTEGER, applied BOOLEAN\)/)
  })

  it('consume_credits drains monthly -> signup -> rest by soonest expiry, oldest first', () => {
    const body = fnBody('consume_credits')
    expect(body).toMatch(
      /ORDER BY\s+CASE l\.source WHEN 'monthly' THEN 0 WHEN 'signup' THEN 1 ELSE 2 END,\s+l\.expires_at ASC NULLS LAST,\s+l\.created_at ASC/
    )
    // Only live lots are drained.
    expect(body).toMatch(/l\.remaining > 0/)
    expect(body).toMatch(/l\.expires_at IS NULL OR l\.expires_at > now\(\)/)
  })

  it('consume_credits books overdraft as debt, writes ONE ledger row with the lot split', () => {
    const body = fnBody('consume_credits')
    expect(body).toMatch(/v_new_debt := v_debt \+ v_needed/)
    expect(body).toMatch(/jsonb_build_object\('debt', v_needed\)/)
    expect(body).toMatch(/jsonb_build_object\('lot_id', v_lot\.id, 'credits', v_take\)/)
    expect(body.match(/INSERT INTO public\.credit_ledger/g)?.length).toBe(1)
    expect(body).toMatch(/-p_credits, p_reason/)
    expect(body).toMatch(/EXCEPTION WHEN unique_violation THEN/)
  })

  it('expire_credit_lots returns an integer and writes expire rows keyed expire:{lot_id}', () => {
    const body = fnBody('expire_credit_lots')
    expect(body).toMatch(/RETURNS INTEGER/)
    expect(body).toMatch(/l\.expires_at <= now\(\)/)
    expect(body).toMatch(/l\.remaining > 0/)
    expect(body).toMatch(/'expire'/)
    expect(body).toMatch(/-v_lot\.remaining/)
    expect(body).toMatch(/'expire:' \|\| v_lot\.id::text/)
    expect(body).toMatch(/SET remaining = 0/)
    // Per-company lock.
    expect(body).toMatch(/UPDATE public\.companies AS c[\s\S]*RETURNING c\.credit_debt INTO v_debt/)
  })

  it('all three are SECURITY DEFINER, pinned search_path, service-role only, commented', () => {
    for (const name of ['grant_credit_lot', 'consume_credits', 'expire_credit_lots']) {
      const body = fnBody(name)
      expect(body, `${name} SECURITY DEFINER`).toMatch(/SECURITY DEFINER/)
      expect(body, `${name} search_path`).toMatch(/SET search_path = public/)
      expect(code, `${name} REVOKE`).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${name} FROM PUBLIC, anon, authenticated`)
      )
      expect(code, `${name} COMMENT`).toMatch(new RegExp(`COMMENT ON FUNCTION public\\.${name} IS`))
    }
  })

  it('KEEPS apply_credit_ledger_entry (the deployed code still calls it during the rollout window)', () => {
    expect(code).not.toMatch(/DROP FUNCTION[^;]*apply_credit_ledger_entry/i)
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION public\.apply_credit_ledger_entry/)
  })
})

describe('backfill', () => {
  it("turns a positive balance into one non-expiring 'adjust' lot, only for companies without lots", () => {
    expect(code).toMatch(/INSERT INTO public\.credit_lots \(company_id, source, granted, remaining, expires_at, ref_id\)/)
    expect(code).toMatch(/'adjust', c\.credit_balance, c\.credit_balance, NULL, 'backfill-seed055'/)
    expect(code).toMatch(/WHERE c\.credit_balance > 0\s+AND NOT EXISTS \(SELECT 1 FROM public\.credit_lots l WHERE l\.company_id = c\.id\)/)
  })

  it('turns a negative balance into credit_debt and writes no ledger rows or balance changes', () => {
    expect(code).toMatch(/SET credit_debt = -c\.credit_balance\s+WHERE c\.credit_balance < 0/)
    // The backfill section never inserts into credit_ledger or rewrites the cache.
    const backfill = code.slice(code.lastIndexOf('INSERT INTO public.credit_lots (company_id'))
    expect(backfill).not.toMatch(/credit_ledger/)
    expect(backfill).not.toMatch(/SET credit_balance/)
  })
})
