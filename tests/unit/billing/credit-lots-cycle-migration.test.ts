import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-055 Phase C (static SQL contract): the subscription-cycle migration.
 *
 * Pure file read - runs in CI with no DB and no secrets. CRLF-normalised so a
 * Windows checkout cannot flip a multi-line assertion.
 */
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261106000002_credit_lots_cycle.sql'),
  'utf8'
).replace(/\r\n/g, '\n')
// Code only: strip line comments so header prose cannot satisfy or trip a check.
const code = sql.replace(/--[^\n]*/g, '')

/** Body of one CREATE OR REPLACE FUNCTION (up to its closing `$$;`). */
function fnBody(name: string): string {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const end = code.indexOf('$$;', code.indexOf('AS $$', start) + 5)
  return code.slice(start, end)
}

const FUNCTIONS = [
  '_sweep_company_lots',
  'grant_credit_lot',
  'consume_credits',
  'expire_credit_lots',
  'grant_monthly_lot',
  'close_monthly_lots',
]

describe('every function is SECURITY DEFINER, pinned search_path, locked down, documented', () => {
  for (const name of FUNCTIONS) {
    it(name, () => {
      const body = fnBody(name)
      expect(body).toMatch(/SECURITY DEFINER/)
      expect(body).toMatch(/SET search_path = public/)
      expect(code).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${name} FROM PUBLIC, anon, authenticated`)
      )
      expect(code).toMatch(new RegExp(`COMMENT ON FUNCTION public\\.${name} IS`))
    })
  }

  it('is a pure function migration: does not touch the Phase B tables or data', () => {
    expect(code).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP /)
  })
})

describe('_sweep_company_lots (inline sweep helper)', () => {
  const body = () => fnBody('_sweep_company_lots')

  it('takes the company id and returns the number of lots expired', () => {
    expect(body()).toContain('p_company_id UUID')
    expect(body()).toMatch(/RETURNS INTEGER/)
  })

  it("expires only THIS company's lapsed lots with something left", () => {
    expect(body()).toMatch(/l\.company_id = p_company_id/)
    expect(body()).toMatch(/l\.expires_at <= now\(\)/)
    expect(body()).toMatch(/l\.remaining > 0/)
  })

  it('zeroes the lot and writes an expire ledger row keyed expire:{lot_id}', () => {
    expect(body()).toMatch(/SET remaining = 0/)
    expect(body()).toMatch(/'expire'/)
    expect(body()).toMatch(/-v_lot\.remaining/)
    expect(body()).toMatch(/'expire:' \|\| v_lot\.id::text/)
  })

  it('refreshes the cache from the lots invariant', () => {
    expect(body()).toMatch(/v_new_balance := v_live_sum - v_debt/)
    expect(body()).toMatch(/SET credit_balance = v_new_balance/)
  })
})

describe('grant_credit_lot / consume_credits keep their signatures and sweep inline after the lock', () => {
  it('grant_credit_lot: same signature, sweep comes right after the row lock and before any write', () => {
    const body = fnBody('grant_credit_lot')
    expect(body).toMatch(/RETURNS TABLE\(balance_after INTEGER, applied BOOLEAN, lot_id UUID\)/)
    for (const arg of ['p_company_id UUID', 'p_source TEXT', 'p_credits INTEGER', 'p_expires_at TIMESTAMPTZ', 'p_period_key TEXT', 'p_ref_id TEXT', 'p_idempotency_key TEXT', 'p_reason TEXT']) {
      expect(body, arg).toContain(arg)
    }
    const lock = body.indexOf('RETURNING c.credit_debt INTO v_debt')
    const sweep = body.indexOf('PERFORM public._sweep_company_lots(p_company_id)')
    const insert = body.indexOf('INSERT INTO public.credit_lots')
    expect(lock).toBeGreaterThan(-1)
    expect(sweep).toBeGreaterThan(lock)
    expect(insert).toBeGreaterThan(sweep)
    expect(body).toMatch(/EXCEPTION WHEN unique_violation THEN/)
  })

  it('consume_credits: same signature (p_reason default kept), sweep right after the row lock, before draining', () => {
    const body = fnBody('consume_credits')
    expect(body).toMatch(/RETURNS TABLE\(balance_after INTEGER, applied BOOLEAN\)/)
    expect(body).toContain("p_reason TEXT DEFAULT 'debit'")
    const lock = body.indexOf('RETURNING c.credit_debt INTO v_debt')
    const sweep = body.indexOf('PERFORM public._sweep_company_lots(p_company_id)')
    const drain = body.indexOf('FOR v_lot IN')
    expect(sweep).toBeGreaterThan(lock)
    expect(drain).toBeGreaterThan(sweep)
    expect(body).toMatch(/CASE l\.source WHEN 'monthly' THEN 0 WHEN 'signup' THEN 1 ELSE 2 END/)
  })

  it('expire_credit_lots delegates to the shared helper and still returns the count', () => {
    const body = fnBody('expire_credit_lots')
    expect(body).toMatch(/RETURNS INTEGER/)
    expect(body).toMatch(/v_count := v_count \+ public\._sweep_company_lots\(v_company\)/)
    // No duplicated per-lot expire logic any more.
    expect(body).not.toMatch(/'expire:'/)
  })
})

describe('grant_monthly_lot', () => {
  const body = () => fnBody('grant_monthly_lot')

  it('has the specified signature and return shape', () => {
    for (const arg of [
      'p_company_id UUID',
      'p_credits INTEGER',
      'p_period_key TEXT',
      'p_expires_at TIMESTAMPTZ',
      'p_ref_id TEXT',
      'p_idempotency_key TEXT',
    ]) {
      expect(body(), arg).toContain(arg)
    }
    expect(body()).toMatch(/RETURNS TABLE\(balance_after INTEGER, applied BOOLEAN, lot_id UUID\)/)
  })

  it('is idempotent: fast path, re-check under the lock, unique_violation backstop', () => {
    const b = body()
    expect(b).toMatch(/idempotency_key = p_idempotency_key/)
    expect(b).toMatch(/EXCEPTION WHEN unique_violation THEN/)
    // The key is checked at least twice (fast path + after the lock).
    expect((b.match(/cl\.idempotency_key = p_idempotency_key/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('a replayed key returns BEFORE it expires anything (never expires the lot it already granted)', () => {
    const b = body()
    const lock = b.indexOf('RETURNING c.credit_debt INTO v_debt')
    const recheck = b.indexOf('cl.idempotency_key = p_idempotency_key', lock)
    const supersede = b.indexOf('SET expires_at = now()')
    expect(lock).toBeGreaterThan(-1)
    expect(recheck).toBeGreaterThan(lock)
    expect(supersede).toBeGreaterThan(recheck)
  })

  it("supersedes only the company's live monthly lots of ANOTHER period, then sweeps them", () => {
    const b = body()
    expect(b).toMatch(/SET expires_at = now\(\)/)
    expect(b).toMatch(/l\.company_id = p_company_id/)
    expect(b).toMatch(/l\.source = 'monthly'/)
    expect(b).toMatch(/\(l\.expires_at IS NULL OR l\.expires_at > now\(\)\)/)
    expect(b).toMatch(/l\.period_key IS DISTINCT FROM p_period_key/)
    const supersede = b.indexOf('SET expires_at = now()')
    const sweep = b.indexOf('PERFORM public._sweep_company_lots(p_company_id)')
    const insert = b.indexOf('INSERT INTO public.credit_lots')
    expect(sweep).toBeGreaterThan(supersede)
    expect(insert).toBeGreaterThan(sweep)
  })

  it("grants a 'monthly' lot like grant_credit_lot: debt paydown, reason 'grant', cache recompute", () => {
    const b = body()
    expect(b).toMatch(/p_company_id, 'monthly', p_credits, p_credits - v_paydown, p_expires_at, p_period_key, p_ref_id/)
    expect(b).toMatch(/LEAST\(p_credits, v_debt\)/)
    expect(b).toMatch(/p_company_id, p_credits, 'grant', NULL, p_ref_id/)
    expect(b).toMatch(/credit_debt = v_new_debt, credit_balance = v_new_balance/)
    expect(b).toMatch(/RETURN QUERY SELECT v_new_balance, true, v_lot_id/)
  })

  it('rejects non-positive credits and a missing / past expiry', () => {
    const b = body()
    expect(b).toMatch(/p_credits IS NULL OR p_credits <= 0/)
    expect(b).toMatch(/p_expires_at IS NULL OR p_expires_at <= now\(\)/)
  })

  it('supersede + grant run inside the same exception sub-block (a lost race rolls both back)', () => {
    const b = body()
    const supersede = b.indexOf('SET expires_at = now()')
    const begin = b.lastIndexOf('BEGIN', supersede)
    const handler = b.indexOf('EXCEPTION WHEN unique_violation THEN')
    expect(begin).toBeGreaterThan(-1)
    expect(supersede).toBeGreaterThan(begin)
    expect(handler).toBeGreaterThan(supersede)
  })
})

describe('close_monthly_lots', () => {
  const body = () => fnBody('close_monthly_lots')

  it('has the specified signature and return shape', () => {
    expect(body()).toContain('p_company_id UUID')
    expect(body()).toContain('p_ref_id TEXT')
    expect(body()).toMatch(/RETURNS TABLE\(balance_after INTEGER, expired INTEGER\)/)
  })

  it('locks the company, expires live monthly lots now, sweeps, recomputes the cache', () => {
    const b = body()
    const lock = b.indexOf('RETURNING c.credit_debt INTO v_debt')
    const expire = b.indexOf('SET expires_at = now()')
    const sweep = b.indexOf('v_expired := public._sweep_company_lots(p_company_id)')
    expect(lock).toBeGreaterThan(-1)
    expect(expire).toBeGreaterThan(lock)
    expect(sweep).toBeGreaterThan(expire)
    expect(b).toMatch(/l\.source = 'monthly'/)
    expect(b).toMatch(/\(l\.expires_at IS NULL OR l\.expires_at > now\(\)\)/)
    expect(b).toMatch(/SET credit_balance = v_new_balance/)
    // Only monthly lots are closed - never signup / topup / adjust.
    expect(b).not.toMatch(/'topup'|'signup'|'adjust'/)
  })

  it('is idempotent by nature: only still-live lots are touched', () => {
    expect(body()).toMatch(/\(l\.expires_at IS NULL OR l\.expires_at > now\(\)\)/)
  })
})
