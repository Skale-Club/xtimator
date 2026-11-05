// @vitest-environment node
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite
const legacyId = '11111111-1111-4111-8111-111111111111'
const migratedGoogle = '22222222-2222-4222-8222-222222222222'
const issuer = 'https://securetoken.google.com/xtimator-test'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator;
    ALTER ROLE authenticator SET pgrst.db_pre_request='public.xtimator_check_request';
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz,raw_user_meta_data jsonb,raw_app_meta_data jsonb,created_at timestamptz,updated_at timestamptz);
    CREATE TABLE auth.identities(provider text,provider_id text,identity_data jsonb,user_id uuid REFERENCES auth.users(id));
    CREATE TABLE public.companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),name text);
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.companies TO authenticated;
    CREATE POLICY company_owner ON public.companies FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
    CREATE TABLE public.demo_config(user_id uuid PRIMARY KEY REFERENCES auth.users(id),company_id uuid);
    CREATE FUNCTION public.count_users() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM auth.users $$;
    INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) VALUES
      ('${legacyId}','owner@example.test',now(),' {"phone":"+15085550101"}',now(),now()),
      ('${migratedGoogle}','google@example.test',now(),'{}',now(),now());
    INSERT INTO auth.identities VALUES('google','legacy-google-sub','{"sub":"legacy-google-sub"}','${migratedGoogle}');
    INSERT INTO public.companies(user_id,name) VALUES('${legacyId}','Preserved company');
  `)
  await db.exec(readFileSync('supabase/migrations/20261105000001_owned_identity.sql', 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })

async function complete(values: { uid?: string; phone?: string; provider?: string; email?: string; google?: string; pending?: string; recovery?: string; current?: string } = {}) {
  const result = await db.query<{ id: string | null }>('SELECT public.xtimator_complete_identity($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',
    [issuer, values.uid ?? randomUUID(), values.provider ?? 'phone', values.phone ?? null, values.email ?? null, values.google ?? null, 'Test user', values.pending ?? null, values.recovery ?? null, values.current ?? null])
  return result.rows[0].id
}
async function activate() { await db.exec('SELECT public.xtimator_activate_owned_auth()') }
async function account(phone?: string) {
  const id = randomUUID()
  await db.query('INSERT INTO public.xtimator_accounts(id,phone,phone_confirmed_at) VALUES($1,$2,$3)', [id, phone ?? null, phone ? new Date().toISOString() : null])
  return id
}
async function asUser(claims: object, sql: string) {
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)])
  await db.exec('SET ROLE authenticated')
  try { return await db.query(sql) }
  finally { await db.exec('RESET ROLE') }
}

describe('owned identity migration and transactions', () => {
  it('refuses a shared application schema before creating identity tables', async () => {
    const shared = new PGlite()
    try {
      await shared.exec('CREATE TABLE public.sales_reps(id integer PRIMARY KEY)')
      await expect(shared.exec(readFileSync('supabase/migrations/20261105000001_owned_identity.sql', 'utf8'))).rejects.toThrow('exclusive reviewed application database')
      expect((await shared.query("SELECT to_regclass('public.xtimator_accounts') AS created")).rows[0]).toMatchObject({ created: null })
    } finally { await shared.close() }
  })
  it('preserves UUIDs/FKs and does not promote editable profile phone to login', async () => {
    const row = (await db.query<{ id: string; phone: null; phone_confirmed_at: null }>('SELECT id,phone,phone_confirmed_at FROM xtimator_accounts WHERE id=$1', [legacyId])).rows[0]
    expect(row).toEqual({ id: legacyId, phone: null, phone_confirmed_at: null })
    const refs = await db.query<{ target: string }>("SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conrelid='public.companies'::regclass AND contype='f'")
    expect(refs.rows[0].target).toBe('xtimator_accounts')
    expect((await db.query('SELECT * FROM public.count_users()')).rows[0]).toMatchObject({ count_users: 2 })
    await expect(complete({ phone: '+15085550102' })).rejects.toThrow('auth_not_activated')
  })
  it('mirrors legacy creation before activation and retains imported Google subject', async () => {
    const id = randomUUID()
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, 'during-preparation@example.test'])
    expect((await db.query('SELECT id FROM xtimator_accounts WHERE id=$1', [id])).rows).toHaveLength(1)
    await activate()
    expect(await complete({ uid: 'firebase-google-new-uid', provider: 'google.com', google: 'legacy-google-sub', email: 'google@example.test' })).toBe(migratedGoogle)
  })
  it('creates one phone account and rejects conflicting provider links', async () => {
    const id = await complete({ uid: 'phone-one', phone: '+15085550103' })
    expect(await complete({ uid: 'phone-one-again', phone: '+15085550103' })).toBe(id)
    const other = await account('+15085550104')
    await expect(complete({ uid: 'phone-one', phone: '+15085550104' })).rejects.toThrow('identity_conflict')
    expect((await db.query('SELECT phone FROM xtimator_accounts WHERE id=$1', [other])).rows[0]).toMatchObject({ phone: '+15085550104' })
  })
  it('requires phone for an unknown Google identity and never links by matching email', async () => {
    expect(await complete({ uid: 'unknown-google', provider: 'google.com', email: 'owner@example.test' })).toBeNull()
    await expect(complete({ uid: 'new-phone-legacy-email', phone: '+15085550105', email: 'owner@example.test' })).rejects.toThrow('account_recovery_required')
  })
  it('uses a single-use pending Google proof to retain an existing account UUID', async () => {
    await db.query("INSERT INTO xtimator_auth_challenges(token_hash,kind,user_id,payload,expires_at) VALUES('pending-google','google',$1,$2,now()+interval '10 minutes')", [migratedGoogle, JSON.stringify({ issuer, subject: 'firebase-google-new-uid' })])
    expect(await complete({ uid: 'google-phone', phone: '+15085550106', pending: 'pending-google' })).toBe(migratedGoogle)
    await expect(complete({ phone: '+15085550106', pending: 'pending-google' })).rejects.toThrow('challenge_expired')
  })
  it('consumes recovery only after email proof and persists wrong-code attempts', async () => {
    await db.query("INSERT INTO xtimator_auth_challenges(token_hash,kind,user_id,code_hash,expires_at) VALUES('recover-legacy','recovery',$1,'correct-code-hash',now()+interval '10 minutes')", [legacyId])
    await expect(complete({ phone: '+15085550107', recovery: 'recover-legacy' })).rejects.toThrow('challenge_expired')
    expect((await db.query("SELECT xtimator_verify_challenge('recover-legacy','wrong') AS ok")).rows[0]).toMatchObject({ ok: false })
    expect((await db.query("SELECT attempts FROM xtimator_auth_challenges WHERE token_hash='recover-legacy'")).rows[0]).toMatchObject({ attempts: 1 })
    expect((await db.query("SELECT xtimator_verify_challenge('recover-legacy','correct-code-hash') AS ok")).rows[0]).toMatchObject({ ok: true })
    expect(await complete({ uid: 'recovered-phone', phone: '+15085550107', recovery: 'recover-legacy' })).toBe(legacyId)
    expect((await db.query("SELECT * FROM xtimator_auth_challenges WHERE token_hash='recover-legacy'")).rows).toHaveLength(0)
  })
  it('locks a challenge after five wrong attempts', async () => {
    await db.exec("INSERT INTO xtimator_auth_challenges(token_hash,kind,code_hash,expires_at) VALUES('five-attempts','recovery','right',now()+interval '10 minutes')")
    for (let n = 0; n < 5; n++) await db.exec("SELECT xtimator_verify_challenge('five-attempts','wrong')")
    expect((await db.query("SELECT xtimator_verify_challenge('five-attempts','right') AS ok")).rows[0]).toMatchObject({ ok: false })
  })
  it('rejects old phone identity after a verified phone change', async () => {
    const id = await complete({ uid: 'old-phone-subject', phone: '+15085550108' })
    expect(await complete({ uid: 'new-phone-subject', phone: '+15085550109', current: id! })).toBe(id)
    await expect(complete({ uid: 'old-phone-subject', phone: '+15085550108' })).rejects.toThrow('identity_conflict')
  })
  it('blocks disabled and demo accounts before changing their identity', async () => {
    const disabled = await account('+15085550110')
    await db.query('UPDATE xtimator_accounts SET disabled_at=now() WHERE id=$1', [disabled])
    await expect(complete({ phone: '+15085550110' })).rejects.toThrow('account_disabled')
    const demo = await account('+15085550111')
    await db.query('INSERT INTO demo_config(user_id) VALUES($1)', [demo])
    await expect(complete({ phone: '+15085550111' })).rejects.toThrow('account_disabled')
  })
  it('never allows browser roles to read session hashes or provision identities', async () => {
    await expect(asUser({ sub: legacyId, role: 'authenticated' }, 'SELECT token_hash FROM xtimator_sessions')).rejects.toThrow(/permission denied/)
    await expect(asUser({ sub: legacyId, role: 'authenticated' }, 'SELECT xtimator_activate_owned_auth()')).rejects.toThrow(/permission denied/)
  })
  it('keeps tenant RLS and revokes data tokens when their owned session is deleted', async () => {
    const id = await account()
    const session = randomUUID()
    await db.query("INSERT INTO xtimator_sessions(id,token_hash,user_id,expires_at) VALUES($1,'rls-test',$2,now()+interval '1 day')", [session, id])
    await db.query("INSERT INTO companies(user_id,name) VALUES($1,'Only my company')", [id])
    const claims = { sub: id, role: 'authenticated', iss: 'xtimator', session_id: session }
    const rows = await asUser(claims, 'SELECT name FROM companies')
    expect(rows.rows).toEqual([{ name: 'Only my company' }])
    await expect(asUser({ ...claims, sub: legacyId }, "INSERT INTO companies(user_id,name) VALUES('" + id + "','forged')")).rejects.toThrow(/row-level security/)
    await db.query('DELETE FROM xtimator_sessions WHERE id=$1', [session])
    expect((await asUser(claims, 'SELECT name FROM companies')).rows).toHaveLength(0)
    await expect(asUser(claims, 'SELECT xtimator_check_request()')).rejects.toThrow('Session is no longer valid')
  })
  it('rejects legacy access tokens after cutover, including the pre-request RPC gate', async () => {
    const legacy = { sub: legacyId, role: 'authenticated', iss: 'https://legacy.supabase.test/auth/v1' }
    expect((await asUser(legacy, 'SELECT name FROM companies')).rows).toHaveLength(0)
    await expect(asUser(legacy, 'SELECT xtimator_check_request()')).rejects.toThrow('Session is no longer valid')
  })
  it('applies a verified email only to its authenticated challenge owner', async () => {
    const id = await account()
    await db.query("INSERT INTO xtimator_auth_challenges(token_hash,kind,user_id,payload,code_hash,verified_at,expires_at) VALUES('email-test','email',$1,'{\"email\":\"new-verified@example.test\"}','code',now(),now()+interval '10 minutes')", [id])
    expect((await db.query("SELECT xtimator_apply_verified_email('email-test',$1) AS ok", [legacyId])).rows[0]).toMatchObject({ ok: false })
    expect((await db.query("SELECT xtimator_apply_verified_email('email-test',$1) AS ok", [id])).rows[0]).toMatchObject({ ok: true })
    expect((await db.query('SELECT email,email_confirmed_at IS NOT NULL AS verified FROM xtimator_accounts WHERE id=$1', [id])).rows[0]).toMatchObject({ email: 'new-verified@example.test', verified: true })
  })
})
