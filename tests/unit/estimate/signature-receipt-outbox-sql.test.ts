// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [company, client, project, estimate, estimateToken, changeOrder, changeOrderToken] =
  Array.from({ length: 7 }, (_, index) => uuid(index + 1))
const version = '2026-11-20T15:00:00Z'
const frozenIdentity = (frozenClient: { id: string; email: string | null } | null) => ({
  language: 'es',
  company: { name: 'Frozen Plumbing' },
  client: frozenClient,
})
const estimateSnapshot = JSON.stringify({
  identity: frozenIdentity({ id: client, email: ' Client@Example.COM ' }),
  consent: { statement: 'Approve', key: 'test' },
})
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE clients(id uuid PRIMARY KEY, company_id uuid NOT NULL, name text, email text);
    CREATE TABLE company_members(company_id uuid, user_id uuid);
    CREATE TABLE projects(id uuid PRIMARY KEY, company_id uuid, client_id uuid, status text, total numeric);
    CREATE TABLE estimates(id uuid PRIMARY KEY, company_id uuid, project_id uuid,
      share_token uuid, client_response text, is_current boolean, updated_at timestamptz DEFAULT now(),
      total numeric, tax_rate numeric DEFAULT 0, currency_code text DEFAULT 'USD',
      estimate_number text, estimate_seq integer, version integer, responded_at timestamptz, language text);
    CREATE TABLE estimate_signatures(id uuid DEFAULT gen_random_uuid(), estimate_id uuid,
      company_id uuid, signer_name text, signer_email text, signature_data text, ip_address inet,
      user_agent text, signed_content jsonb, signed_total numeric, signed_at timestamptz DEFAULT now());
    CREATE TABLE estimate_activity(project_id uuid, company_id uuid, estimate_id uuid,
      event_type text, metadata jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE customer_messages(trigger_source text NOT NULL CHECK (trigger_source IN ('manual')));
  `)
  for (const name of [
    '20260717000005_phase165_estimates_updated_at_trigger.sql',
    '20261121120000_estimate_updated_at_content_only.sql',
    '20261117000001_change_orders.sql',
    '20261121140000_signature_snapshot_hash.sql',
    '20261123220000_signature_launch_integrity.sql',
    '20261123221000_signature_receipt_outbox.sql',
    '20261123222000_signature_receipt_identity.sql',
  ]) {
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'))
  }
  await db.query("INSERT INTO companies VALUES ($1,'Bright Plumbing')", [company])
  await db.query("INSERT INTO clients VALUES ($1,$2,'Test Client',' Client@Example.com ')", [client, company])
  await db.query("INSERT INTO projects VALUES ($1,$2,$3,'sent',100)", [project, company, client])
  await db.query(`INSERT INTO estimates(id,company_id,project_id,share_token,is_current,updated_at,total,language)
    VALUES ($1,$2,$3,$4,true,$5,100,'en')`, [estimate, company, project, estimateToken, version])
  await db.query(`INSERT INTO change_orders(id,company_id,project_id,estimate_id,share_token,number,status,updated_at,total)
    VALUES ($1,$2,$3,$4,$5,1,'sent',$6,25)`, [changeOrder, company, project, estimate, changeOrderToken, version])
  await signEstimate()
}, 30_000)

afterAll(async () => { await db?.close() })

function signEstimate({
  id = estimate,
  token = estimateToken,
  expectedVersion = version,
  signerEmail = 'CLIENT@example.com' as string | null,
  snapshot = estimateSnapshot,
} = {}) {
  return db.query(
    "SELECT sign_estimate_atomic($1,$2,$3,'Test Client',$4,'png',NULL,NULL,$5::jsonb,100,$6)",
    [id, token, expectedVersion, signerEmail, snapshot, digest(snapshot)],
  )
}

async function signChangeOrder(id: string, token: string, identity: ReturnType<typeof frozenIdentity>, signerEmail: string | null) {
  const contract = (await db.query<{ contract: unknown }>(
    'SELECT get_change_order_signing_contract($1) AS contract', [id],
  )).rows[0].contract
  const snapshot = JSON.stringify({ contract, identity })
  await db.query(
    "SELECT sign_change_order_atomic($1,$2,$3,'Test Client',$4,'png',NULL,NULL,$5::jsonb,25,$6)",
    [id, token, version, signerEmail, snapshot, digest(snapshot)],
  )
}

async function expectSkippedReceipt(id: string, kind: 'estimate' | 'change_order') {
  const { rows } = await db.query(
    'SELECT kind,state,client_id,recipient_sha256,share_token_sha256,last_issue FROM signature_receipt_outbox WHERE document_id=$1',
    [id],
  )
  expect(rows).toEqual([{
    kind,
    state: 'skipped',
    client_id: null,
    recipient_sha256: null,
    share_token_sha256: null,
    last_issue: 'no_safe_recipient',
  }])
}

describe('transactional signature receipt outbox', () => {
  it('queues a pinned receipt in the real signing transaction without an event or duplicate', async () => {
    const { rows: [current] } = await db.query<{ updated_at: string }>(
      'SELECT updated_at::text AS updated_at FROM estimates WHERE id=$1', [estimate],
    )
    await expect(signEstimate({ expectedVersion: current.updated_at })).rejects.toThrow('estimate_already_responded')
    const { rows } = await db.query('SELECT * FROM signature_receipt_outbox WHERE document_id=$1', [estimate])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'estimate',
      state: 'pending',
      client_id: client,
      recipient_sha256: digest('client@example.com'),
      share_token_sha256: digest(estimateToken),
      language: 'es',
      business_name: 'Frozen Plumbing',
      attempts: 0,
    })
    expect(JSON.stringify(rows[0])).not.toContain('client@example.com')
    expect(JSON.stringify(rows[0])).not.toContain(estimateToken)
  })

  it('commits a change-order signature without scheduling mail to a supplied mismatched address', async () => {
    await signChangeOrder(changeOrder, changeOrderToken, frozenIdentity({ id: client, email: 'client@example.com' }), 'other@example.com')
    await expectSkippedReceipt(changeOrder, 'change_order')
    expect((await db.query('SELECT client_response FROM change_orders WHERE id=$1', [changeOrder])).rows)
      .toEqual([{ client_response: 'accepted' }])
  })

  it.each([
    { document: uuid(11), token: uuid(12), frozenClient: { id: client, email: 'previous@example.com' }, change: 'email changes' },
    { document: uuid(13), token: uuid(14), frozenClient: null, change: 'a contact is attached' },
    { document: uuid(15), token: uuid(16), frozenClient: { id: client, email: null }, change: 'an email is added' },
  ])('skips an estimate receipt when $change after the signed view', async ({ document, token, frozenClient }) => {
    await db.query(`INSERT INTO estimates(id,company_id,project_id,share_token,is_current,updated_at,total,language)
      VALUES ($1,$2,$3,$4,true,$5,100,'en')`, [document, company, project, token, version])
    await signEstimate({
      id: document,
      token,
      signerEmail: null,
      snapshot: JSON.stringify({ identity: frozenIdentity(frozenClient) }),
    })

    await expectSkippedReceipt(document, 'estimate')
    expect((await db.query('SELECT client_response FROM estimates WHERE id=$1', [document])).rows)
      .toEqual([{ client_response: 'accepted' }])
  })

  it('skips a change-order receipt after the client is reassigned even when their emails match', async () => {
    const document = uuid(17)
    const token = uuid(18)
    await db.query(`INSERT INTO change_orders(id,company_id,project_id,estimate_id,share_token,number,status,updated_at,total)
      VALUES ($1,$2,$3,$4,$5,2,'sent',$6,25)`, [document, company, project, estimate, token, version])
    await signChangeOrder(document, token, frozenIdentity({ id: uuid(19), email: 'client@example.com' }), null)

    await expectSkippedReceipt(document, 'change_order')
    expect((await db.query('SELECT client_response FROM change_orders WHERE id=$1', [document])).rows)
      .toEqual([{ client_response: 'accepted' }])
  })

  it('grants access to the delivery worker only', async () => {
    const { rows } = await db.query(`
      SELECT
        has_table_privilege('anon', 'signature_receipt_outbox', 'SELECT') AS anon_read,
        has_table_privilege('authenticated', 'signature_receipt_outbox', 'UPDATE') AS owner_update,
        has_table_privilege('service_role', 'signature_receipt_outbox', 'SELECT,UPDATE') AS worker_access,
        relrowsecurity AS rls
      FROM pg_class WHERE relname='signature_receipt_outbox'
    `)
    expect(rows).toEqual([{ anon_read: false, owner_update: false, worker_access: true, rls: true }])
  })
})
