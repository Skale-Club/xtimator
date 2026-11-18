// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite
const company = '11111111-1111-4111-8111-111111111111'
const otherCompany = '22222222-2222-4222-8222-222222222222'
const project = '33333333-3333-4333-8333-333333333333'
const oldId = '44444444-4444-4444-8444-444444444444'
const newId = '55555555-5555-4555-8555-555555555555'
const photo = '66666666-6666-4666-8666-666666666666'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, name text);
    CREATE TABLE projects(id uuid PRIMARY KEY, company_id uuid NOT NULL, name text, project_type text, total numeric, status text, client_id uuid REFERENCES clients(id));
    CREATE TABLE estimates(id uuid PRIMARY KEY, company_id uuid NOT NULL, project_id uuid REFERENCES projects(id),
      version integer, is_current boolean NOT NULL DEFAULT false, summary text, total numeric,
      workflow_status text DEFAULT 'draft', client_response text, sent_at timestamptz, notes text, timeline text,
      estimate_seq integer, UNIQUE(company_id,estimate_seq));
    CREATE TABLE estimate_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estimate_id uuid REFERENCES estimates(id) ON DELETE CASCADE, title text DEFAULT 'General');
    CREATE TABLE estimate_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid REFERENCES estimate_sections(id) ON DELETE CASCADE,
      description text DEFAULT 'Existing work',quantity numeric DEFAULT 1,unit text DEFAULT 'each',unit_price numeric DEFAULT 100,discount numeric DEFAULT 0);
    CREATE TABLE estimate_signatures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), estimate_id uuid REFERENCES estimates(id));
    CREATE TABLE photos(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE estimate_photos(estimate_id uuid REFERENCES estimates(id) ON DELETE CASCADE,
      photo_id uuid REFERENCES photos(id), company_id uuid, sort_order integer, UNIQUE(estimate_id,photo_id));
    GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `)
  await db.exec(readFileSync('supabase/migrations/20261118000001_atomic_estimate_activation.sql', 'utf8'))
  await db.exec(readFileSync('supabase/migrations/20261118000002_estimate_sequence_lock.sql', 'utf8'))
  await db.exec(readFileSync('supabase/migrations/20261118000003_scope_vague_discard.sql', 'utf8'))
  await db.exec('CREATE TRIGGER test_estimate_seq BEFORE INSERT ON estimates FOR EACH ROW EXECUTE FUNCTION public.set_estimate_seq()')
  await db.exec(`
    CREATE FUNCTION reject_test_project_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected project write failure'; END $$;
  `)
}, 30_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`
    DROP TRIGGER IF EXISTS test_project_failure ON projects;
    TRUNCATE projects,estimates,estimate_sections,estimate_items,estimate_signatures,photos,estimate_photos,clients CASCADE;
    INSERT INTO projects(id,company_id,name,project_type,total,status) VALUES('${project}','${company}','Existing job','painting',100,'estimate_ready');
    INSERT INTO estimates(id,company_id,project_id,version,is_current,summary,total,generation_staged) VALUES
      ('${oldId}','${company}','${project}',1,true,'Existing work',100,false),
      ('${newId}','${company}','${project}',2,false,'New work',200,true);
    INSERT INTO estimate_sections(id,estimate_id) VALUES('${oldId}','${oldId}'),('${newId}','${newId}');
    INSERT INTO estimate_items(section_id) VALUES('${oldId}'),('${newId}');
    INSERT INTO photos VALUES('${photo}','${company}');
    INSERT INTO estimate_photos VALUES('${oldId}','${photo}','${company}',0);
  `)
})
async function activate(opts: {
  companyId?: string; target?: string; previous?: string | null; restore?: boolean;
  discard?: string | null; keepExisting?: boolean; update?: Record<string, unknown>
} = {}) {
  const r = await db.query<{ result: { estimate_id: string; version: number } }>(
    'SELECT public.activate_estimate_version($1,$2,$3,$4,$5::jsonb,$6,$7,$8) AS result',
    [opts.companyId ?? company,project,opts.target ?? newId,
      opts.previous === undefined ? oldId : opts.previous,
      JSON.stringify(opts.update ?? { status: 'estimate_ready' }), opts.discard ?? null,
      opts.restore ?? false,opts.keepExisting ?? false],
  )
  const { estimate_id, version } = r.rows[0].result
  return { estimate_id, version }
}
async function snapshot() {
  return {
    estimates: (await db.query<{
      id: string
      version: number | null
      is_current: boolean
      generation_staged: boolean
    }>('SELECT id,version,is_current,generation_staged FROM estimates ORDER BY id')).rows,
    project: (await db.query<{
      total: string | null
      status: string | null
      project_type: string | null
      name: string | null
      client_id: string | null
    }>('SELECT total,status,project_type,name,client_id FROM projects')).rows,
    photos: (await db.query<{
      estimate_id: string | null
      photo_id: string | null
      company_id: string | null
      sort_order: number | null
    }>('SELECT * FROM estimate_photos ORDER BY estimate_id')).rows,
  }
}
async function failProjectWrites() {
  await db.exec('CREATE TRIGGER test_project_failure BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION reject_test_project_write()')
}
async function discard(status = 'draft') {
  await db.query('SELECT public.discard_vague_estimate($1,$2,$3,$4)',[company,project,newId,status])
}

describe('real PostgreSQL activation and recovery transactions', () => {
  it('commits one current version, project state and photo carry-forward together', async () => {
    expect(await activate({ update: { status: 'awaiting_details', project_type: 'plumbing' } })).toEqual({ estimate_id:newId,version:2 })
    const s = await snapshot()
    expect(s.estimates).toEqual([
      {id:oldId,version:1,is_current:false,generation_staged:false},
      {id:newId,version:2,is_current:true,generation_staged:false},
    ])
    expect(s.project[0]).toMatchObject({total:'200',status:'awaiting_details',project_type:'plumbing'})
    expect(s.photos).toHaveLength(2)
  })
  it('rolls back demotion, promotion and copied photos if the project update fails', async () => {
    const before = await snapshot()
    await failProjectWrites()
    await expect(activate()).rejects.toThrow('injected project write failure')
    expect(await snapshot()).toEqual(before)
  })
  it('rejects a foreign tenant and stale expected current without any change', async () => {
    const before = await snapshot()
    await expect(activate({companyId:otherCompany})).rejects.toThrow('generation_project_not_found')
    await expect(activate({previous:null})).rejects.toThrow('generation_current_conflict')
    expect(await snapshot()).toEqual(before)
  })
  it.each(['accepted','declined'])('preserves an answered current estimate (%s)', async response => {
    await db.query('UPDATE estimates SET client_response=$1 WHERE id=$2',[response,oldId])
    const before = await snapshot()
    await expect(activate()).rejects.toThrow('generation_estimate_locked')
    expect(await snapshot()).toEqual(before)
  })
  it('protects a signed version even before its client response was recorded', async () => {
    await db.query('INSERT INTO estimate_signatures(estimate_id) VALUES($1)',[oldId])
    await expect(activate()).rejects.toThrow('generation_estimate_locked')
  })
  it('replays activation without overwriting subsequent acceptance or project changes', async () => {
    const first = await activate()
    await db.query("UPDATE projects SET status='accepted' WHERE id=$1",[project])
    await db.query("UPDATE estimates SET client_response='accepted' WHERE id=$1",[newId])
    expect(await activate()).toEqual(first)
    expect((await snapshot()).project[0].status).toBe('accepted')
  })
  it('atomically restores the first draft, its trade and total, deleting only the discarded pass', async () => {
    await activate({update:{status:'estimate_ready',project_type:'plumbing'}})
    expect(await activate({target:oldId,previous:newId,restore:true,discard:newId,
      update:{status:'awaiting_details',project_type:'painting'}})).toEqual({estimate_id:oldId,version:1})
    const s = await snapshot()
    expect(s.estimates).toEqual([{id:oldId,version:1,is_current:true,generation_staged:false}])
    expect(s.project[0]).toMatchObject({total:'100',status:'awaiting_details',project_type:'painting'})
  })
  it('rolls back a failed restore, leaving the second version intact and current', async () => {
    await activate()
    const before = await snapshot()
    await failProjectWrites()
    await expect(activate({target:oldId,previous:newId,restore:true,discard:newId})).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it('only removes a pristine blank inside a successful activation', async () => {
    await db.query('UPDATE estimates SET summary=NULL,total=0 WHERE id=$1',[oldId])
    await db.query("UPDATE estimate_items SET description='',unit_price=0 WHERE section_id=$1",[oldId])
    const before = await snapshot()
    await failProjectWrites()
    await expect(activate()).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
    await db.exec('DROP TRIGGER test_project_failure ON projects')
    expect(await activate()).toEqual({estimate_id:newId,version:1})
    expect((await snapshot()).estimates).toHaveLength(1)
  })
  it('preserves an edited unpriced manual estimate as history instead of calling it pristine', async () => {
    await db.query('UPDATE estimates SET summary=NULL,total=0 WHERE id=$1',[oldId])
    await activate()
    expect((await snapshot()).estimates).toHaveLength(2)
  })
  it('allocates version numbers from committed versions only', async () => {
    await db.query("INSERT INTO estimates(id,company_id,project_id,version,total,generation_staged) VALUES(gen_random_uuid(),$1,$2,999,123,true)",[company,project])
    expect((await activate()).version).toBe(2)
  })
  it('allocates a distinct company sequence and respects an explicit imported number', async () => {
    expect((await db.query('SELECT estimate_seq FROM estimates ORDER BY estimate_seq')).rows).toEqual([
      {estimate_seq:1},{estimate_seq:2},
    ])
    await db.query('INSERT INTO estimates(id,company_id,project_id,estimate_seq) VALUES(gen_random_uuid(),$1,$2,40)',[company,project])
    const next = await db.query<{ estimate_seq: number }>(
      'INSERT INTO estimates(id,company_id,project_id) VALUES(gen_random_uuid(),$1,$2) RETURNING estimate_seq',
      [company,project],
    )
    expect(next.rows[0].estimate_seq).toBe(41)
  })
  it('links a unique normalized client in the activation transaction', async () => {
    await db.query("INSERT INTO clients(id,company_id,name) VALUES($1,$2,'Jane Doe')",[photo,company])
    await activate({update:{client_id:photo,detected_client_name:'  JANE   DOE.  '}})
    expect((await snapshot()).project[0].client_id).toBe(photo)
  })
  it('rechecks all company clients instead of trusting uniqueness from a truncated application read', async () => {
    await db.query("INSERT INTO clients(id,company_id,name) VALUES($1,$2,'Jane Doe'),(gen_random_uuid(),$2,'jane doe.')",[photo,company])
    await activate({update:{client_id:photo,detected_client_name:'Jane Doe'}})
    expect((await snapshot()).project[0].client_id).toBeNull()
  })
  it('preserves a client manually chosen while generation was running', async () => {
    await db.query("INSERT INTO clients(id,company_id,name) VALUES($1,$2,'Jane Doe'),($3,$2,'Other client')",[photo,company,otherCompany])
    await db.query('UPDATE projects SET client_id=$1 WHERE id=$2',[otherCompany,project])
    await activate({update:{client_id:photo,detected_client_name:'Jane Doe'}})
    expect((await snapshot()).project[0].client_id).toBe(otherCompany)
  })
  it('does not link another tenant client or link anything on a failed activation', async () => {
    await db.query("INSERT INTO clients(id,company_id,name) VALUES($1,$2,'Jane Doe')",[photo,otherCompany])
    await activate({update:{client_id:photo,detected_client_name:'Jane Doe'}})
    expect((await snapshot()).project[0].client_id).toBeNull()
    await db.query('UPDATE clients SET company_id=$1 WHERE id=$2',[company,photo])
    await db.query('UPDATE estimates SET is_current=(id=$1),generation_staged=(id=$2) WHERE project_id=$3',[oldId,newId,project])
    await failProjectWrites()
    await expect(activate({update:{client_id:photo,detected_client_name:'Jane Doe'}})).rejects.toThrow()
    expect((await snapshot()).project[0].client_id).toBeNull()
  })
  it('create-if-absent returns the current version and leaves its state unchanged', async () => {
    const before = await snapshot()
    expect(await activate({previous:null,keepExisting:true})).toEqual({estimate_id:oldId,version:1})
    expect(await snapshot()).toEqual(before)
  })
  it('never discards a priced estimate or an unrelated current version', async () => {
    await expect(discard()).rejects.toThrow('generation_current_conflict')
    await activate()
    await expect(discard()).rejects.toThrow('estimate_is_not_vague')
    expect((await snapshot()).estimates.find(e=>e.id===newId)?.is_current).toBe(true)
  })
  it('requires the trusted tenant even if project and estimate IDs match another company', async () => {
    await db.query('UPDATE estimates SET total=0 WHERE id=$1',[newId])
    await activate()
    const before = await snapshot()
    await expect(db.query('SELECT public.discard_vague_estimate($1,$2,$3)',[otherCompany,project,newId]))
      .rejects.toThrow('generation_project_not_found')
    expect(await snapshot()).toEqual(before)
  })
  it('discards a vague version and restores the previous committed usable draft; replay is harmless', async () => {
    await db.query('UPDATE estimates SET total=0 WHERE id=$1',[newId])
    await activate()
    await discard('awaiting_details')
    const s = await snapshot()
    expect(s.estimates).toEqual([{id:oldId,version:1,is_current:true,generation_staged:false}])
    expect(s.project[0]).toMatchObject({total:'100',status:'awaiting_details'})
    await discard('awaiting_details')
    expect(await snapshot()).toEqual(s)
  })
  it('rolls back a discard and restoration if the project state cannot be written', async () => {
    await db.query('UPDATE estimates SET total=0 WHERE id=$1',[newId])
    await activate()
    const before = await snapshot()
    await failProjectWrites()
    await expect(discard()).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it('fails closed on pre-existing duplicate current rows', async () => {
    await db.query('UPDATE estimates SET is_current=true WHERE id=$1',[newId])
    await expect(activate()).rejects.toThrow('generation_current_conflict')
  })
  it.each(['anon','authenticated'])('does not grant activation/discard to %s', async role => {
    await db.exec(`SET ROLE ${role}`)
    try {
      await expect(activate()).rejects.toThrow('permission denied')
      await expect(discard()).rejects.toThrow('permission denied')
    } finally { await db.exec('RESET ROLE') }
  })
})
