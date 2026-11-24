// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const company = '11111111-1111-4111-8111-111111111111'
const estimate = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const migration = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8')
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
    CREATE TABLE companies(id uuid PRIMARY KEY,tier text DEFAULT 'free',name text);
    CREATE TABLE company_members(company_id uuid,user_id uuid);
    CREATE TABLE estimates(id uuid PRIMARY KEY,company_id uuid,total numeric,currency_code text,is_current boolean,client_response text);
    CREATE TABLE change_orders(id uuid PRIMARY KEY,estimate_id uuid,total numeric,client_response text);
  `)
  for (const file of [
    '20260514000001_phase58_stripe_processed_events.sql',
    '20260619000001_phase94_invoices.sql',
    '20260624000004_phase112_credit_ledger.sql',
    '20260706000002_atomic_credit_ledger_rpc.sql',
    '20261106000001_credit_lots.sql',
    '20261106000002_credit_lots_cycle.sql',
    '20261117000002_change_order_invoices.sql',
    '20261121190000_invoice_stripe_account.sql',
    '20261121200000_invoice_refunds.sql',
    '20261123130000_payment_recovery.sql',
    '20261123133000_legacy_refund_watermarks.sql',
  ]) await db.exec(migration(file))
}, 60_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`TRUNCATE companies,estimates,change_orders,processed_stripe_events CASCADE;
    INSERT INTO companies(id) VALUES('${company}'),('${other}');
    INSERT INTO estimates VALUES('${estimate}','${company}',1000,'USD',true,'accepted');`)
})
async function scalar(sql: string, params: unknown[] = []) { return (await db.query<Record<string, any>>(sql, params)).rows[0] }
async function reserve(kind: string, amount: number, changeOrderId?: string) {
  const row = { id: crypto.randomUUID(), estimate_id: estimate, company_id: company, kind,
    amount_cents: amount, currency_code: 'USD', change_order_id: changeOrderId ?? null,
    stripe_account_id: 'acct_test', stripe_issue_request: { frozen: true } }
  return scalar('SELECT reserve_connect_invoice($1::jsonb,20000,100000) AS r', [JSON.stringify(row)])
}
describe('payment recovery SQL', () => {
  it.each(['ch_legacy', 're_legacy'])('preserves an existing legacy reversal keyed on %s', async legacyRef => {
    await scalar("SELECT grant_credit_lot($1,'topup',900,NULL,NULL,'pi','grant-key','topup')", [company])
    await scalar("SELECT consume_credits($1,90,NULL,$2,NULL,NULL,$3,'adjust')", [company, legacyRef, `refund:${legacyRef}`])
    expect((await scalar("SELECT reverse_stripe_credits($1,'ch_legacy',900,ARRAY['re_legacy']) AS n", [company]))!.n).toBe(810)
    expect((await scalar('SELECT credit_balance FROM companies WHERE id=$1', [company]))!.credit_balance).toBe(0)
    expect((await scalar("SELECT reverse_stripe_credits($1,'ch_legacy',900,ARRAY['re_legacy']) AS n", [company]))!.n).toBe(0)
  })
  it('reclaims a crashed webhook lease but never reclaims a completed event', async () => {
    const first = (await scalar("SELECT claim_stripe_event('evt_1') AS r"))!.r
    expect(first.state).toBe('acquired')
    expect((await scalar("SELECT claim_stripe_event('evt_1') AS r"))!.r.state).toBe('busy')
    await db.exec("UPDATE processed_stripe_events SET lease_until=now()-interval '1 second'")
    const second = (await scalar("SELECT claim_stripe_event('evt_1') AS r"))!.r
    expect(second.state).toBe('acquired')
    expect(second.token).not.toBe(first.token)
    expect((await scalar("SELECT finish_stripe_event('evt_1',$1,true) AS ok", [first.token]))!.ok).toBe(false)
    expect((await scalar("SELECT finish_stripe_event('evt_1',$1,true) AS ok", [second.token]))!.ok).toBe(true)
    expect((await scalar("SELECT claim_stripe_event('evt_1') AS r"))!.r.state).toBe('completed')
  })
  it('keeps a failed webhook retryable', async () => {
    const first = (await scalar("SELECT claim_stripe_event('evt_fail') AS r"))!.r
    await scalar("SELECT finish_stripe_event('evt_fail',$1,false)", [first.token])
    expect((await scalar("SELECT claim_stripe_event('evt_fail') AS r"))!.r.state).toBe('acquired')
  })
  it('reuses an unresolved purchase across request ids and preserves original price/card snapshot', async () => {
    const first = (await scalar("SELECT reserve_billing_operation($1,'credit_purchase','first',$2) AS r", [company, '{"price":1000,"card":"pm_original"}']))!.r
    const second = (await scalar("SELECT reserve_billing_operation($1,'credit_purchase','second',$2) AS r", [company, '{"price":5000,"card":"pm_new"}']))!.r
    expect(second.id).toBe(first.id)
    expect(second.request).toEqual(first.request)
    const otherOp = (await scalar("SELECT reserve_billing_operation($1,'credit_purchase','first','{}') AS r", [other]))!.r
    expect(otherOp.id).not.toBe(first.id)
  })
  it('reverses 90 then 810 credits for a partial then full refund, tolerating older/duplicate events', async () => {
    await scalar("SELECT grant_credit_lot($1,'topup',900,NULL,NULL,'pi','grant-key','topup')", [company])
    expect((await scalar("SELECT reverse_stripe_credits($1,'ch_1',90) AS n", [company]))!.n).toBe(90)
    expect((await scalar("SELECT reverse_stripe_credits($1,'ch_1',900) AS n", [company]))!.n).toBe(810)
    expect((await scalar("SELECT reverse_stripe_credits($1,'ch_1',90) AS n", [company]))!.n).toBe(0)
    expect((await scalar('SELECT credit_balance FROM companies WHERE id=$1', [company]))!.credit_balance).toBe(0)
    await expect(scalar("SELECT reverse_stripe_credits($1,'ch_1',900)", [other])).rejects.toThrow('ownership')
  })
  it('two full requests converge on one reservation and one frozen routing id', async () => {
    const [a, b] = await Promise.all([reserve('full', 100000), reserve('full', 100000)])
    expect(a!.r.id).toBe(b!.r.id)
    expect((await scalar('SELECT count(*)::int AS n FROM invoices'))!.n).toBe(1)
  })
  it('a full reservation excludes a later deposit or balance, including old unresolved drafts', async () => {
    await reserve('full', 100000)
    await db.exec("UPDATE invoices SET created_at=now()-interval '2 days'")
    await expect(reserve('deposit', 20000)).rejects.toThrow('invoicing changed')
    await expect(reserve('balance', 80000)).rejects.toThrow('invoicing changed')
  })
  it('a deposit and balance cannot exceed the contract; void permits reissue', async () => {
    await reserve('deposit', 20000)
    await reserve('balance', 80000)
    await expect(reserve('full', 100000)).rejects.toThrow('already exists')
    await db.exec("UPDATE invoices SET status='void'")
    expect((await reserve('full', 100000))!.r.amount_cents).toBe(100000)
  })
  it('untrusted roles cannot reserve payments or execute reversal RPCs', async () => {
    await db.exec('SET ROLE authenticated')
    await expect(scalar("SELECT claim_stripe_event('forged')")).rejects.toThrow('permission denied')
    await expect(scalar('SELECT * FROM billing_operations')).rejects.toThrow('permission denied')
    await db.exec('RESET ROLE')
  })
  it('invoice refunds cannot regress under an older concurrent snapshot', async () => {
    const row = (await reserve('full', 100000))!.r
    await scalar('SELECT record_invoice_refund($1,$2,900)', [company, row.id])
    await scalar('SELECT record_invoice_refund($1,$2,90)', [company, row.id])
    expect((await scalar('SELECT refunded_cents FROM invoices WHERE id=$1', [row.id]))!.refunded_cents).toBe(900)
    await expect(scalar('SELECT record_invoice_refund($1,$2,1000)', [other, row.id])).rejects.toThrow('not found')
  })
})
