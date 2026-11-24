// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

let db: PGlite
const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const [company, user, reassignedUser, project, estimate, project2, estimate2, staged, client, attemptA, attemptB, section, item] =
  Array.from({ length: 13 }, (_, index) => uuid(index + 1))
const phone = '+15555550100'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE companies (id uuid PRIMARY KEY);
    CREATE TABLE test_authority (phone_e164 text PRIMARY KEY, company_id uuid, user_id uuid, authorized boolean);
    CREATE FUNCTION resolve_whatsapp_sender_authority(text)
      RETURNS TABLE (company_id uuid, user_id uuid, phone_e164 text, authorized boolean)
      LANGUAGE sql AS 'SELECT company_id, user_id, phone_e164, authorized FROM test_authority WHERE phone_e164 = $1';
    CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, name text, phone text, preferred_language text);
    CREATE TABLE projects (id uuid PRIMARY KEY, company_id uuid, name text, status text, client_id uuid, total numeric, project_type text);
    CREATE TABLE estimates (id uuid PRIMARY KEY, company_id uuid, project_id uuid, version integer, is_current boolean,
      status text DEFAULT 'draft', workflow_status text DEFAULT 'draft', sent_at timestamptz, client_response text,
      total numeric, consolidated_at timestamptz, share_expires_at timestamptz, language text DEFAULT 'en',
      summary text, notes text, timeline text, payment_terms text, updated_at timestamptz DEFAULT now(),
      subtotal numeric, discount_amount numeric, tax_amount numeric, balance_due numeric);
    CREATE TABLE estimate_signatures (estimate_id uuid);
    CREATE TABLE photos (id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE estimate_photos (estimate_id uuid, photo_id uuid, company_id uuid, sort_order integer, PRIMARY KEY(estimate_id, photo_id));
    CREATE TABLE whatsapp_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, phone_number text,
      state text, draft_project_id uuid, draft_estimate_id uuid, expires_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE estimate_deliveries (estimate_id uuid, company_id uuid, channel text, format text, recipient_email text,
      recipient_phone text, provider text, provider_message_id text, status text, error_message text, sent_at timestamptz);
    CREATE TABLE estimate_activity (project_id uuid, company_id uuid, estimate_id uuid, event_type text, metadata jsonb);
    CREATE TABLE estimate_sections (id uuid PRIMARY KEY, estimate_id uuid, company_id uuid, title text, subtotal numeric);
    CREATE TABLE estimate_items (id uuid PRIMARY KEY, section_id uuid, company_id uuid, description text, quantity numeric,
      unit text, unit_price numeric, total numeric, sort_order integer, price_source text, cost numeric, markup_pct numeric,
      discount numeric DEFAULT 0);
  `)
  for (const file of ['20261118000001_atomic_estimate_activation.sql', '20261123142000_whatsapp_command_safety.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  // Reproduce Supabase default privileges observed on the development database.
  await db.exec(`GRANT ALL ON whatsapp_estimate_session_watermarks, whatsapp_estimate_commands,
    whatsapp_estimate_delivery_channels TO anon, authenticated`)
  await db.exec(readFileSync('supabase/migrations/20261123144000_whatsapp_command_table_grants.sql', 'utf8'))
})
afterAll(async () => db?.close())

it('removes inherited browser grants while retaining service access and deny-all RLS', async () => {
  const rows = await db.query<{ relrowsecurity: boolean; browser: boolean; anonymous: boolean; service: boolean }>(`
    SELECT relrowsecurity, has_table_privilege('authenticated', oid, 'SELECT') AS browser,
      has_table_privilege('anon', oid, 'INSERT') AS anonymous,
      has_table_privilege('service_role', oid, 'UPDATE') AS service
    FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN
      ('whatsapp_estimate_session_watermarks','whatsapp_estimate_commands','whatsapp_estimate_delivery_channels')`)
  expect(rows.rows).toHaveLength(3)
  for (const row of rows.rows) expect(row).toEqual({ relrowsecurity: true, browser: false, anonymous: false, service: true })
})

beforeEach(async () => {
  await db.exec(`TRUNCATE companies, test_authority, clients, projects, estimates, estimate_signatures, photos,
    estimate_photos, whatsapp_sessions, estimate_deliveries, estimate_activity, estimate_sections, estimate_items CASCADE`)
  await db.query('INSERT INTO companies VALUES ($1)', [company])
  await db.query('INSERT INTO test_authority VALUES ($1,$2,$3,true)', [phone, company, user])
  await db.query('INSERT INTO clients (id, company_id, name) VALUES ($1,$2,$3)', [client, company, 'Client'])
  await db.query(`INSERT INTO projects (id, company_id, name, status, client_id, total)
    VALUES ($1,$2,'Original','estimate_ready',$3,100), ($4,$2,'Replacement','estimate_ready',$3,150)`,
  [project, company, client, project2])
  await db.query(`INSERT INTO estimates (id, company_id, project_id, version, is_current, total, generation_staged)
    VALUES ($1,$2,$3,1,true,100,false), ($4,$2,$5,1,true,150,false), ($6,$2,$3,2,false,250,true)`,
  [estimate, company, project, estimate2, project2, staged])
})

async function open(projectId = project, estimateId = estimate, order = 0) {
  const result = await db.query<{ opened: boolean }>(`SELECT whatsapp_open_estimate_session($1,$2,$3,$4,$5,'awaiting_confirm',
    timestamptz '2026-11-23 00:00:00+00' + $6::int * interval '1 second', now() + interval '30 minutes') AS opened`,
  [company, phone, user, projectId, estimateId, order])
  return result.rows[0].opened
}

async function activeSession() {
  return (await db.query<{ id: string; draft_estimate_id: string }>('SELECT id, draft_estimate_id FROM whatsapp_sessions')).rows[0]
}

async function claim(sessionId: string, kind = 'send', messageId = 'wamid.a', attempt = attemptA, sender = user) {
  return (await db.query<{ result: { status: string; command_id: string } }>(
    'SELECT whatsapp_claim_estimate_command($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) AS result',
    [company, phone, sender, sessionId, project, estimate, messageId, kind, attempt],
  )).rows[0].result
}

it('preserves the old project when a replacement is invalid, retires its session after acceptance, and rejects late replays', async () => {
  expect(await open()).toBe(true)
  const original = await activeSession()
  expect(await open(project2, estimate, 1)).toBe(false)
  expect(await activeSession()).toEqual(original)
  expect(await open(project2, estimate2, 2)).toBe(true)
  expect(await open(project, estimate, 1)).toBe(false)
  expect((await activeSession()).draft_estimate_id).toBe(estimate2)
  expect((await claim(original.id)).status).toBe('stale')
  expect((await db.query('SELECT id FROM projects')).rows).toHaveLength(2)
})

it('closes a sent, answered, signed confirmation without touching its records', async () => {
  await open()
  const { id } = await activeSession()
  await db.query("UPDATE estimates SET sent_at=now(), status='sent', client_response='accepted' WHERE id=$1", [estimate])
  await db.query('INSERT INTO estimate_signatures VALUES ($1)', [estimate])
  expect((await claim(id)).status).toBe('answered')
  const { command_id: command } = await claim(id, 'cancel')
  await db.query('SELECT whatsapp_cancel_estimate_session($1,$2)', [command, attemptA])
  expect(await activeSession()).toBeUndefined()
  expect((await db.query('SELECT id FROM estimates WHERE id=$1', [estimate])).rows).toEqual([{ id: estimate }])
  expect((await db.query('SELECT id FROM projects WHERE id=$1', [project])).rows).toEqual([{ id: project }])
  expect((await db.query('SELECT estimate_id FROM estimate_signatures')).rows).toEqual([{ estimate_id: estimate }])
  expect(await open()).toBe(false)
})

it('reserves a delivery channel only once across concurrent commands and an interrupted worker', async () => {
  await open()
  const { id } = await activeSession()
  const { command_id: first } = await claim(id)
  expect((await claim(id, 'send', 'wamid.b', attemptB)).status).toBe('busy')
  await db.query("SELECT whatsapp_prepare_estimate_delivery($1,$2,$3,now()+interval '90 days')", [first, attemptA, client])
  const reserve = async (command: string, attempt: string, channel: string) => (await db.query<{ status: string }>(
    'SELECT whatsapp_claim_estimate_delivery_channel($1,$2,$3,$4) AS status', [command, attempt, client, channel],
  )).rows[0].status
  expect(await reserve(first, attemptA, 'email')).toBe('claimed')
  await db.query("UPDATE whatsapp_estimate_commands SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [first])
  const { command_id: second } = await claim(id, 'send', 'wamid.b', attemptB)
  expect(await reserve(second, attemptB, 'email')).toBe('dispatching')
  await db.query('SELECT whatsapp_record_estimate_delivery_channel($1,$2,$3,$4,$5,null,$6,true,null)',
    [first, attemptA, 'email', client, 'test@example.test', 'provider-id'])
  expect(await reserve(second, attemptB, 'email')).toBe('sent')
  expect(await reserve(second, attemptB, 'sms')).toBe('claimed')
  await db.query('SELECT whatsapp_finish_estimate_command($1,$2)', [second, attemptB])
  expect(await activeSession()).toBeUndefined()
  expect((await db.query('SELECT channel, status FROM estimate_deliveries')).rows).toEqual([{ channel: 'email', status: 'sent' }])
  expect((await db.query('SELECT status, workflow_status FROM estimates WHERE id=$1', [estimate])).rows)
    .toEqual([{ status: 'sent', workflow_status: 'consolidated' }])
})

it('revalidates the claimed sender before applying a write', async () => {
  await open()
  const { id } = await activeSession()
  expect((await claim(id, 'cancel', 'wamid.old', attemptA, reassignedUser)).status).toBe('stale')
  const { command_id: claimed } = await claim(id, 'cancel')
  await db.query('UPDATE test_authority SET user_id=$1 WHERE phone_e164=$2', [reassignedUser, phone])
  await expect(db.query('SELECT whatsapp_cancel_estimate_session($1,$2)', [claimed, attemptA])).rejects.toThrow('whatsapp_estimate_session_stale')
  expect((await claim(id, 'cancel', 'wamid.new', attemptB, reassignedUser)).status).toBe('stale')
  expect((await activeSession()).id).toBe(id)
})

it('keeps the prior estimate and session until regeneration activates the new version', async () => {
  await open()
  const { id } = await activeSession()
  const { command_id: command } = await claim(id, 'regenerate')
  const activate = (update: object) => db.query('SELECT whatsapp_activate_regenerated_estimate($1,$2,$3,$4)',
    [command, attemptA, staged, JSON.stringify(update)])
  await expect(activate({ status: 'sent' })).rejects.toThrow('invalid_generation_status')
  expect((await activeSession()).draft_estimate_id).toBe(estimate)
  expect((await db.query('SELECT id FROM estimates WHERE project_id=$1 AND is_current', [project])).rows).toEqual([{ id: estimate }])
  await activate({ status: 'estimate_ready' })
  expect((await activeSession()).draft_estimate_id).toBe(staged)
  expect((await db.query('SELECT id, is_current FROM estimates WHERE project_id=$1 ORDER BY version', [project])).rows)
    .toEqual([{ id: estimate, is_current: false }, { id: staged, is_current: true }])
})

it('rejects stale line edits and commits the item and every derived total together', async () => {
  await open()
  const { id } = await activeSession()
  const { command_id: command } = await claim(id, 'edit')
  await db.query(`INSERT INTO estimate_sections VALUES ($1,$2,$3,'Labor',100)`, [section, estimate, company])
  await db.query(`INSERT INTO estimate_items (id,section_id,company_id,description,quantity,unit_price,total)
    VALUES ($1,$2,$3,'Original',1,100,100)`, [item, section, company])
  const commit = (revision: string) => db.query(`SELECT whatsapp_commit_estimate_item_edit($1,$2,$3,'update',$4,$5,$6,$7,$8)`, [
    command, attemptA, revision, section, { id: item, description: 'Revised', quantity: 2 },
    { total: 220, subtotal: 200, discount_amount: 0, tax_amount: 20, balance_due: 170 },
    [{ id: section, subtotal: 200 }], [{ id: item, unit_price: 100, total: 200 }],
  ])
  await expect(commit('2000-01-01')).rejects.toThrow('whatsapp_estimate_changed')
  expect((await db.query('SELECT description, total::integer FROM estimate_items')).rows)
    .toEqual([{ description: 'Original', total: 100 }])
  const revision = (await db.query<{ revision: string }>('SELECT updated_at::text AS revision FROM estimates WHERE id=$1', [estimate])).rows[0].revision
  await commit(revision)
  expect((await db.query('SELECT description, total::integer FROM estimate_items')).rows)
    .toEqual([{ description: 'Revised', total: 200 }])
  expect((await db.query('SELECT total::integer, balance_due::integer FROM estimates WHERE id=$1', [estimate])).rows)
    .toEqual([{ total: 220, balance_due: 170 }])
  expect((await db.query('SELECT total::integer FROM projects WHERE id=$1', [project])).rows).toEqual([{ total: 220 }])
  expect((await claim(id, 'edit')).status).toBe('replayed')
})
