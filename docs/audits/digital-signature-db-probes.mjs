// Historical launch investigation against isolated in-memory PostgreSQL.
// These assertions reproduce the BEFORE state, without the corrective migration.
// For current regression expectations use signature-integrity-regressions.mjs.
// Run: node docs/audits/digital-signature-db-probes.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const db = new PGlite()
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const company = '00000000-0000-4000-8000-000000000001'
const project = '00000000-0000-4000-8000-000000000002'
const estimate = '00000000-0000-4000-8000-000000000003'
const changeOrder = '00000000-0000-4000-8000-000000000004'
const token = '00000000-0000-4000-8000-000000000005'
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000099'::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE clients(id uuid PRIMARY KEY, name text);
    CREATE TABLE company_members(company_id uuid, user_id uuid);
    CREATE TABLE projects(id uuid PRIMARY KEY, company_id uuid, client_id uuid, status text, total numeric);
    CREATE TABLE estimates(id uuid PRIMARY KEY, company_id uuid, project_id uuid,
      share_token uuid, client_response text, is_current boolean, updated_at timestamptz DEFAULT now(),
      total numeric, tax_rate numeric DEFAULT 0, currency_code text DEFAULT 'USD',
      estimate_number text, estimate_seq integer, version integer, responded_at timestamptz);
    CREATE TABLE estimate_signatures(id uuid DEFAULT gen_random_uuid(), estimate_id uuid,
      company_id uuid, signer_name text, signer_email text, signature_data text, ip_address inet,
      user_agent text, signed_content jsonb, signed_total numeric, signed_at timestamptz DEFAULT now());
    CREATE TABLE estimate_activity(project_id uuid, company_id uuid, estimate_id uuid,
      event_type text, metadata jsonb, created_at timestamptz DEFAULT now());
    GRANT SELECT ON company_members TO authenticated;
  `)
  await db.exec(await migration('20260717000005_phase165_estimates_updated_at_trigger.sql'))
  await db.exec(await migration('20261121120000_estimate_updated_at_content_only.sql'))
  await db.exec(await migration('20261117000001_change_orders.sql'))
  await db.exec(await migration('20261121140000_signature_snapshot_hash.sql'))
  await db.query('INSERT INTO companies VALUES ($1)', [company])
  await db.query("INSERT INTO company_members VALUES ($1,'00000000-0000-4000-8000-000000000099')", [company])
  await db.query('INSERT INTO projects(id,company_id,status,total) VALUES ($1,$2,\'accepted\',1000)', [project, company])
  await db.query(`INSERT INTO estimates(id,company_id,project_id,share_token,client_response,is_current,total,estimate_number)
    VALUES ($1,$2,$3,gen_random_uuid(),'accepted',true,1000,'EST-1')`, [estimate, company, project])
  await db.query(`INSERT INTO change_orders(id,company_id,project_id,estimate_id,number,title,status,share_token,total,subtotal)
    VALUES ($1,$2,$3,$4,1,'Paint fence','sent',$5,100,100)`, [changeOrder, company, project, estimate, token])
  await db.query(`INSERT INTO change_order_items(change_order_id,company_id,description,total,unit_price)
    VALUES ($1,$2,'Paint fence',100,100)`, [changeOrder, company])

  const before = (await db.query('SELECT updated_at::text AS version FROM change_orders WHERE id=$1', [changeOrder])).rows[0].version
  await db.exec('SET ROLE authenticated')
  await db.query('UPDATE change_order_items SET description=\'Unseen replacement scope\' WHERE change_order_id=$1', [changeOrder])
  await db.exec('RESET ROLE')
  const after = (await db.query('SELECT updated_at::text AS version FROM change_orders WHERE id=$1', [changeOrder])).rows[0].version
  assert.equal(after, before)
  // The real latest RPC accepts the unchanged page version despite the line edit.
  await db.query(`SELECT sign_change_order_atomic($1,$2,$3,'Audit Signer',NULL,'PNG',NULL,NULL,$4::jsonb,100,$5)`,
    [changeOrder, token, before, JSON.stringify({items:[{description:'Unseen replacement scope'}]}), 'a'.repeat(64)])
  console.log('CONFIRMED: direct CO item edit leaves page version unchanged; real signing RPC accepts it.')

  await db.exec('SET ROLE authenticated')
  await db.query('UPDATE change_order_items SET description=\'Changed after signing\' WHERE change_order_id=$1', [changeOrder])
  await db.exec('RESET ROLE')
  const live = (await db.query('SELECT description FROM change_order_items WHERE change_order_id=$1', [changeOrder])).rows[0]
  const frozen = (await db.query('SELECT signed_content FROM change_order_signatures WHERE change_order_id=$1', [changeOrder])).rows[0]
  assert.equal(live.description, 'Changed after signing')
  assert.equal(frozen.signed_content.items[0].description, 'Unseen replacement scope')
  console.log('CONFIRMED: signed CO items remain writable while stored evidence stays unchanged.')

  await db.exec('SET ROLE authenticated')
  await db.query(`UPDATE change_orders SET client_response='declined',status='declined'
    WHERE id=$1 AND company_id=$2`, [changeOrder, company])
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT client_response FROM change_orders WHERE id=$1', [changeOrder])).rows[0].client_response, 'declined')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM change_order_signatures WHERE change_order_id=$1', [changeOrder])).rows[0].n, 1)
  console.log('CONFIRMED: authenticated CO parent response UPDATE can overwrite signed acceptance.')

  // Model the interleaving: owner checked no signature; signer committed; owner's
  // unconditioned UPDATE now executes with the same id/company/current filters.
  await db.query(`INSERT INTO estimate_signatures(estimate_id,company_id,signer_name,signed_content,signed_total)
    VALUES ($1,$2,'Audit Signer','{}',1000)`, [estimate, company])
  await db.query(`UPDATE estimates SET client_response='declined',responded_at=now()
    WHERE id=$1 AND company_id=$2 AND is_current=true`, [estimate, company])
  const state = (await db.query('SELECT client_response FROM estimates WHERE id=$1', [estimate])).rows[0]
  assert.equal(state.client_response, 'declined')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM estimate_signatures WHERE estimate_id=$1', [estimate])).rows[0].n, 1)
  console.log('CONFIRMED: parent response UPDATE can overwrite signed acceptance; signature still exists.')

  for (const table of ['estimate_signatures', 'change_order_signatures']) {
    await assert.rejects(db.exec(`UPDATE ${table} SET signer_name='Rewritten'`), /signature_immutable/)
  }
  console.log('CONTROL PASSED: both signature evidence tables reject direct rewriting.')
} finally {
  await db.close()
}
