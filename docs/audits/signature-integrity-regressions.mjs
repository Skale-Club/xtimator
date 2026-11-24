// Signature release checks on isolated PostgreSQL, never a live database.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const company = '00000000-0000-4000-8000-000000000001'
const project = '00000000-0000-4000-8000-000000000002'
const estimate = '00000000-0000-4000-8000-000000000003'
let checks = 0
async function rejects(query, params, code) {
  await assert.rejects(db.query(query, params), (error) => error.code === code); checks++
}
async function asMember(fn) {
  await db.exec('SET ROLE authenticated')
  try { return await fn() } finally { await db.exec('RESET ROLE') }
}
async function addOrder(number, total) {
  const c = (await db.query(`INSERT INTO change_orders(company_id,project_id,estimate_id,number,title,status,total,subtotal)
    VALUES($1,$2,$3,$4,'Paint fence','sent',$5,$5) RETURNING id,share_token`, [company,project,estimate,number,total])).rows[0]
  await db.query(`INSERT INTO change_order_items(change_order_id,company_id,description,total,unit_price)
    VALUES($1,$2,'Paint fence',$3,$3)`, [c.id,company,total])
  return c
}
async function version(c) { return (await db.query('SELECT updated_at::text AS v FROM change_orders WHERE id=$1',[c.id])).rows[0].v }
async function contract(c) { return (await db.query('SELECT get_change_order_signing_contract($1) AS c',[c.id])).rows[0].c }
async function sign(c, expectedVersion, state) {
  return db.query(`SELECT sign_change_order_atomic($1,$2,$3,'Audit Signer',NULL,'PNG',NULL,NULL,$4::jsonb,$5,$6)`,
    [c.id,c.share_token,expectedVersion,JSON.stringify({version:2,contract:state,items:[{description:'Paint fence'}]}),state.after-state.before,'a'.repeat(64)])
}
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000099'::uuid $$;
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE clients(id uuid PRIMARY KEY,name text);
    CREATE TABLE company_members(company_id uuid,user_id uuid);
    CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid,client_id uuid,status text,total numeric);
    CREATE TABLE estimates(id uuid PRIMARY KEY,company_id uuid,project_id uuid,share_token uuid,
      client_response text,is_current boolean,updated_at timestamptz DEFAULT now(),sent_at timestamptz,
      total numeric,tax_rate numeric DEFAULT 0,currency_code text DEFAULT 'USD',
      estimate_number text,estimate_seq integer,version integer,responded_at timestamptz);
    CREATE TABLE estimate_signatures(id uuid DEFAULT gen_random_uuid(),estimate_id uuid,company_id uuid,
      signer_name text,signer_email text,signature_data text,ip_address inet,user_agent text,
      signed_content jsonb,signed_total numeric,signed_at timestamptz DEFAULT now());
    CREATE TABLE estimate_activity(project_id uuid,company_id uuid,estimate_id uuid,event_type text,metadata jsonb,created_at timestamptz DEFAULT now());
    GRANT SELECT ON company_members,estimate_signatures TO authenticated;
    GRANT SELECT,UPDATE ON estimates,projects TO authenticated;
    GRANT INSERT ON estimate_activity TO authenticated;
  `)
  for (const name of ['20260717000005_phase165_estimates_updated_at_trigger.sql','20261121120000_estimate_updated_at_content_only.sql',
    '20261117000001_change_orders.sql','20261121140000_signature_snapshot_hash.sql','20261123220000_signature_launch_integrity.sql']) await db.exec(await migration(name))
  await db.exec(await migration('20261123220000_signature_launch_integrity.sql')); checks++
  await db.query('INSERT INTO companies VALUES($1)',[company])
  await db.query("INSERT INTO company_members VALUES($1,'00000000-0000-4000-8000-000000000099')",[company])
  await db.query("INSERT INTO projects(id,company_id,status,total) VALUES($1,$2,'accepted',1000)",[project,company])
  await db.query(`INSERT INTO estimates(id,company_id,project_id,share_token,client_response,is_current,total,estimate_number)
    VALUES($1,$2,$3,gen_random_uuid(),'accepted',true,1000,'EST-1')`,[estimate,company,project])
  const a = await addOrder(1,100)
  const oldVersion = await version(a), oldContract = await contract(a)
  await asMember(() => db.query("UPDATE change_order_items SET description='Revised fence' WHERE change_order_id=$1",[a.id]))
  assert.notEqual(await version(a),oldVersion); checks++
  await assert.rejects(sign(a,oldVersion,oldContract),(error)=>error.code==='P0012'); checks++
  await sign(a,await version(a),await contract(a)); checks++
  await asMember(async () => {
    await rejects("UPDATE change_order_items SET description='Unapproved scope' WHERE change_order_id=$1",[a.id],'P0011')
    await rejects("UPDATE change_orders SET client_response='declined',status='declined' WHERE id=$1",[a.id],'P0011')
    await rejects('SELECT record_change_order_response_atomic($1,$2,NULL,NULL)',[a.id,company],'P0011')
    await rejects("UPDATE estimates SET client_response='declined' WHERE id=$1",[estimate],'P0022')
  })
  const frozenA=(await db.query('SELECT signed_content FROM change_order_signatures WHERE change_order_id=$1',[a.id])).rows[0].signed_content
  const b=await addOrder(2,200)
  await sign(b,await version(b),await contract(b)); checks++
  assert.equal(frozenA.contract.after,1100); checks++
  assert.equal((await db.query('SELECT total::float8 AS total FROM projects WHERE id=$1',[project])).rows[0].total,1300); checks++
  const c=await addOrder(3,300), cVersion=await version(c), cContract=await contract(c)
  const d=await addOrder(4,50)
  await sign(d,await version(d),await contract(d))
  assert.equal(await version(c),cVersion); checks++
  await assert.rejects(sign(c,cVersion,cContract),(error)=>error.code==='P0012'); checks++
  const latestCVersion=await version(c)
  await asMember(() => db.query("SELECT record_change_order_response_atomic($1,$2,$3,'accepted')",[c.id,company,latestCVersion])); checks++
  assert.equal((await db.query('SELECT total::float8 AS total FROM projects WHERE id=$1',[project])).rows[0].total,1650); checks++
  await asMember(() => db.query('SELECT record_change_order_response_atomic($1,$2,NULL,NULL)',[c.id,company])); checks++
  assert.equal((await db.query('SELECT total::float8 AS total FROM projects WHERE id=$1',[project])).rows[0].total,1350); checks++
  await db.query("INSERT INTO estimate_signatures(estimate_id,company_id,signer_name,signed_content,signed_total) VALUES($1,$2,'Audit Signer','{}',1000)",[estimate,company])
  await rejects("UPDATE estimates SET client_response='declined' WHERE id=$1 AND company_id=$2 AND is_current=true",[estimate,company],'P0022')
  await asMember(() => rejects('SELECT record_estimate_response_atomic($1,$2,NULL,NULL)',[estimate,company],'P0022'))
  for (const table of ['estimate_signatures','change_order_signatures']) {
    await assert.rejects(db.exec(`UPDATE ${table} SET signer_name='Rewritten'`),/signature_immutable/); checks++
  }
  const save=await asMember(()=>db.query(`SELECT save_change_order_atomic($1,$2,NULL,'{"title":"Revised"}',
    '[{"description":"Adjusted","quantity":1,"unit_price":10,"taxable":true}]') AS result`,[c.id,company]))
  const persisted=await db.query('SELECT updated_at FROM change_orders WHERE id=$1',[c.id])
  assert.equal(new Date(save.rows[0].result.updated_at).getTime(),new Date(persisted.rows[0].updated_at).getTime()); checks++
  console.log(`PASS: ${checks} signature integrity regression checks; isolated PostgreSQL only.`)
} finally { await db.close() }
