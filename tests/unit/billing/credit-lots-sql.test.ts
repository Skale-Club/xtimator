// @vitest-environment node
/**
 * Executes the REAL credit PL/pgSQL (credit_lots, consume_credits,
 * grant_credit_lot, grant_monthly_lot, close_monthly_lots, expire_credit_lots,
 * _sweep_company_lots) in PGlite. Every other billing test is mocked or a regex
 * over migration text.
 *
 * Stubs (the only non-production SQL here): roles, `auth.uid()`, `company_members`
 * and a minimal `companies` table (the real one has dozens of unrelated
 * columns). Migration 20261109200000 (messaging) is skipped: its constraint swap
 * is superseded by 20261119210000, which re-lists every operation.
 * No preprocessing of the migration SQL was needed.
 */
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const co = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

const mig = (f: string) => readFileSync(`supabase/migrations/${f}`, 'utf8')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.companies(
      id uuid PRIMARY KEY, tier text DEFAULT 'free', name text
    );
    CREATE TABLE public.company_members(company_id uuid, user_id uuid);
    GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
  `)
  for (const f of [
    '20260624000004_phase112_credit_ledger.sql',
    '20260706000002_atomic_credit_ledger_rpc.sql',
    '20261106000001_credit_lots.sql',
    '20261106000002_credit_lots_cycle.sql',
    '20261119210000_credit_ledger_refine_op.sql',
  ]) {
    await db.exec(mig(f))
  }
}, 60_000)
afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await db.exec(`
    TRUNCATE credit_ledger, credit_lots, companies CASCADE;
    INSERT INTO companies(id) VALUES ('${co}'), ('${other}');
  `)
})

type Row = Record<string, any>
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> =>
  (await db.query<Row>(sql, params)).rows

const grantLot = async (
  source: string,
  credits: number,
  opts: { key?: string | null; expires?: string | null; period?: string | null; reason?: string; company?: string } = {},
) =>
  (await q(
    `SELECT * FROM grant_credit_lot($1::uuid,$2,$3,$4::timestamptz,$5,$6,$7,$8)`,
    [opts.company ?? co, source, credits, opts.expires ?? null, opts.period ?? null, 'test',
      opts.key === undefined ? null : opts.key, opts.reason ?? 'grant'],
  ))[0]

const consume = async (credits: number, key: string | null = null, op = 'estimate') =>
  (await q(`SELECT * FROM consume_credits($1::uuid,$2,$3,'ref',NULL,NULL,$4)`, [co, credits, op, key]))[0]

const monthly = async (credits: number, period: string, key: string, days = 30) =>
  (await q(
    `SELECT * FROM grant_monthly_lot($1::uuid,$2,$3, now() + ($4 || ' days')::interval,'inv',$5)`,
    [co, credits, period, String(days), key],
  ))[0]

const company = async () => (await q(`SELECT credit_balance, credit_debt FROM companies WHERE id=$1`, [co]))[0]
const lots = async () => q(`SELECT * FROM credit_lots WHERE company_id=$1 ORDER BY created_at, source`, [co])
const ledger = async () => q(`SELECT * FROM credit_ledger WHERE company_id=$1 ORDER BY created_at, id`, [co])
const live = async () =>
  Number((await q(
    `SELECT COALESCE(SUM(remaining),0)::int AS s FROM credit_lots WHERE company_id=$1 AND (expires_at IS NULL OR expires_at > now())`,
    [co],
  ))[0].s)
const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString()

/** companies.credit_balance = live lots - debt, and = SUM(ledger deltas) after any write. */
async function expectInvariant() {
  const c = await company()
  expect(c.credit_balance).toBe((await live()) - c.credit_debt)
  const sum = Number((await q(`SELECT COALESCE(SUM(delta_credits),0)::int AS s FROM credit_ledger WHERE company_id=$1`, [co]))[0].s)
  expect(sum).toBe(c.credit_balance)
}

describe('credit lots SQL (real PL/pgSQL)', () => {
  it('1. signup lot: 350 credits granted once; a replay of signup:{id} adds nothing', async () => {
    const key = `signup:${co}`
    const first = await grantLot('signup', 350, { key })
    expect(first.applied).toBe(true)
    expect(first.balance_after).toBe(350)
    const replay = await grantLot('signup', 350, { key })
    expect(replay.applied).toBe(false)
    expect(replay.balance_after).toBe(350)
    expect(replay.lot_id).toBe(first.lot_id)
    expect(await lots()).toHaveLength(1)
    expect(await ledger()).toHaveLength(1)
    expect((await company()).credit_balance).toBe(350)
    await expectInvariant()
  })

  it('2. consume_credits drains monthly, then signup, then rest by soonest expiry; one ledger row with per-lot split; replay is a no-op', async () => {
    const signup = await grantLot('signup', 100, { key: 's' })
    const topupLate = await grantLot('topup', 100, { key: 'tl', expires: days(90), reason: 'topup' })
    const topupSoon = await grantLot('topup', 100, { key: 'ts', expires: days(10), reason: 'topup' })
    const adjust = await grantLot('adjust', 100, { key: 'a', reason: 'adjust' }) // never expires -> last
    const m = await monthly(100, '2026-11-01', 'grant:m1')
    expect((await company()).credit_balance).toBe(500)

    const r = await consume(430, 'debit:1')
    expect(r.applied).toBe(true)
    expect(r.balance_after).toBe(70)
    const c = await company()
    expect(c.credit_balance).toBe(70)
    expect(c.credit_debt).toBe(0)

    const rem = Object.fromEntries((await lots()).map((l) => [l.id, l.remaining]))
    expect(rem[m.lot_id]).toBe(0)
    expect(rem[signup.lot_id]).toBe(0)
    expect(rem[topupSoon.lot_id]).toBe(0)
    expect(rem[topupLate.lot_id]).toBe(0) // soonest expiry first, then the later one
    expect(rem[adjust.lot_id]).toBe(70) // NULL expiry (NULLS LAST) drained last

    const debits = (await ledger()).filter((l) => l.reason === 'debit')
    expect(debits).toHaveLength(1)
    expect(debits[0].delta_credits).toBe(-430)
    expect(debits[0].balance_after).toBe(70)
    expect(debits[0].lot_split).toEqual([
      { lot_id: m.lot_id, credits: 100 },
      { lot_id: signup.lot_id, credits: 100 },
      { lot_id: topupSoon.lot_id, credits: 100 },
      { lot_id: topupLate.lot_id, credits: 100 },
      { lot_id: adjust.lot_id, credits: 30 },
    ])

    const replay = await consume(430, 'debit:1')
    expect(replay.applied).toBe(false)
    expect(replay.balance_after).toBe(70)
    expect((await company()).credit_balance).toBe(70)
    expect((await ledger()).filter((l) => l.reason === 'debit')).toHaveLength(1)
    await expectInvariant()
  })

  it('3. overdraft: shortfall goes to credit_debt, balance_after is NEGATIVE (-debt), lots hit 0, split records {debt}', async () => {
    await grantLot('signup', 10, { key: 's' })
    const r = await consume(14, 'd1')
    expect(r.applied).toBe(true)
    expect(r.balance_after).toBe(-4) // convention: balance = live lots - debt
    expect(await company()).toMatchObject({ credit_balance: -4, credit_debt: 4 })
    expect((await lots())[0].remaining).toBe(0)
    const d = (await ledger()).find((l) => l.reason === 'debit')!
    expect(d.lot_split.at(-1)).toEqual({ debt: 4 })
    await expectInvariant()
  })

  it('4. Free -> Pro: grant_monthly_lot(3000) repays debt 3 first (lot remaining 2997, balance 2997, ledger delta +3000)', async () => {
    await grantLot('signup', 5, { key: 's' })
    await consume(8, 'd1')
    expect(await company()).toMatchObject({ credit_balance: -3, credit_debt: 3 })

    const g = await monthly(3000, '2026-11-19', 'grant:pro:1')
    expect(g.applied).toBe(true)
    expect(g.balance_after).toBe(2997)
    expect(await company()).toMatchObject({ credit_balance: 2997, credit_debt: 0 })
    const lot = (await lots()).find((l) => l.id === g.lot_id)!
    expect(lot).toMatchObject({ granted: 3000, remaining: 2997, source: 'monthly' })
    const row = (await ledger()).find((l) => l.reason === 'grant' && l.lot_id === g.lot_id)!
    expect(row.delta_credits).toBe(3000)
    expect(row.balance_after).toBe(2997)
    await expectInvariant()
  })

  it('5. renewal: a new period supersedes (expires) the previous monthly lot; replaying a period does not expire its own lot', async () => {
    const a = await monthly(100, '2026-11-01', 'grant:m1')
    await consume(40, 'd1') // 60 left in lot A
    const replayA = await monthly(100, '2026-11-01', 'grant:m1')
    expect(replayA.applied).toBe(false)
    expect(replayA.lot_id).toBe(a.lot_id)
    let lotA = (await lots()).find((l) => l.id === a.lot_id)!
    expect(lotA.remaining).toBe(60)
    expect(new Date(lotA.expires_at).getTime()).toBeGreaterThan(Date.now())
    expect((await company()).credit_balance).toBe(60)

    const b = await monthly(100, '2026-12-01', 'grant:m2')
    expect(b.applied).toBe(true)
    expect(b.balance_after).toBe(100) // unused 60 of A are lost
    lotA = (await lots()).find((l) => l.id === a.lot_id)!
    expect(lotA.remaining).toBe(0)
    expect(new Date(lotA.expires_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    const exp = (await ledger()).filter((l) => l.reason === 'expire')
    expect(exp).toHaveLength(1)
    expect(exp[0]).toMatchObject({ delta_credits: -60, lot_id: a.lot_id, idempotency_key: `expire:${a.lot_id}` })
    // replaying period A's key AFTER B exists must not resurrect or expire anything
    expect((await monthly(100, '2026-11-01', 'grant:m1')).applied).toBe(false)
    expect((await company()).credit_balance).toBe(100)
    await expectInvariant()
  })

  it('6. close_monthly_lots (cancellation) closes the monthly lot only; signup/adjust lots untouched; second call expires nothing', async () => {
    const s = await grantLot('signup', 50, { key: 's' })
    const adj = await grantLot('adjust', 20, { key: 'a', reason: 'adjust' })
    const m = await monthly(300, '2026-11-01', 'grant:m1')
    expect((await company()).credit_balance).toBe(370)

    const r = (await q(`SELECT * FROM close_monthly_lots($1::uuid,'sub_cancel')`, [co]))[0]
    expect(r.expired).toBe(1)
    expect(r.balance_after).toBe(70)
    const byId = Object.fromEntries((await lots()).map((l) => [l.id, l]))
    expect(byId[m.lot_id].remaining).toBe(0)
    expect(byId[s.lot_id].remaining).toBe(50)
    expect(byId[adj.lot_id].remaining).toBe(20)
    expect(byId[s.lot_id].expires_at).toBeNull()
    expect((await company()).credit_balance).toBe(70)
    await expectInvariant()

    const again = (await q(`SELECT * FROM close_monthly_lots($1::uuid,'sub_cancel')`, [co]))[0]
    expect(again.expired).toBe(0)
    expect(again.balance_after).toBe(70)
  })

  it('7. expire_credit_lots sweeps a lapsed topup lot; its remaining no longer counts; re-run is a no-op', async () => {
    const keep = await grantLot('signup', 30, { key: 's' })
    const t = await grantLot('topup', 200, { key: 't', reason: 'topup', expires: days(1) })
    await consume(10, 'd1') // signup drains first -> topup stays 200
    expect((await company()).credit_balance).toBe(220)
    // time passes: the topup lapses (cache is stale until the sweep runs)
    await q(`UPDATE credit_lots SET expires_at = now() - interval '1 minute' WHERE id=$1`, [t.lot_id])

    const n = (await q(`SELECT expire_credit_lots() AS n`))[0].n
    expect(n).toBe(1)
    const lot = (await lots()).find((l) => l.id === t.lot_id)!
    expect(lot.remaining).toBe(0)
    expect((await lots()).find((l) => l.id === keep.lot_id)!.remaining).toBe(20)
    expect((await company()).credit_balance).toBe(20)
    const exp = (await ledger()).find((l) => l.reason === 'expire')!
    expect(exp).toMatchObject({ delta_credits: -200, balance_after: 20, lot_id: t.lot_id })
    await expectInvariant()
    expect((await q(`SELECT expire_credit_lots() AS n`))[0].n).toBe(0)
  })

  it('8. operation_type refine (and chat/messaging) is accepted by the ledger CHECK; unknown ops are rejected', async () => {
    await grantLot('signup', 100, { key: 's' })
    expect((await consume(5, 'r1', 'refine')).applied).toBe(true)
    expect((await consume(5, 'r2', 'messaging')).applied).toBe(true)
    expect((await ledger()).filter((l) => l.operation_type === 'refine')).toHaveLength(1)
    await expect(consume(5, 'r3', 'bogus_op')).rejects.toThrow(/credit_ledger_operation_type_check|check constraint/i)
    // the failed call rolled back entirely
    expect((await company()).credit_balance).toBe(90)
    await expectInvariant()
  })
})
