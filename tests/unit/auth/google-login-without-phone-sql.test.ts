// @vitest-environment node
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Google sign-in without a mandatory phone (migration 20261119200000).
let db: PGlite
const legacyId = '11111111-1111-4111-8111-111111111111'
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
    CREATE TABLE public.demo_config(user_id uuid PRIMARY KEY REFERENCES auth.users(id),company_id uuid);
    INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) VALUES
      ('${legacyId}','owner@example.test',now(),'{}',now(),now());
  `)
  await db.exec(readFileSync('supabase/migrations/20261105000001_owned_identity.sql', 'utf8'))
  // Created after the identity migration, whose preflight refuses unknown tables.
  await db.exec(`CREATE TABLE public.onboarding_drafts(step text NOT NULL CONSTRAINT onboarding_drafts_step_check CHECK (step IN ('language','companyName','industry','location','brandColor','logo')))`)
  await db.exec(readFileSync('supabase/migrations/20261119200000_google_login_without_phone.sql', 'utf8'))
  await db.exec('SELECT public.xtimator_activate_owned_auth()')
}, 30000)
afterAll(async () => { await db?.close() })

async function complete(values: { uid?: string; phone?: string; provider?: string; email?: string; google?: string; current?: string } = {}) {
  const result = await db.query<{ id: string | null }>('SELECT public.xtimator_complete_identity($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',
    [issuer, values.uid ?? randomUUID(), values.provider ?? 'phone', values.phone ?? null, values.email ?? null, values.google ?? null, 'Test user', null, null, values.current ?? null])
  return result.rows[0].id
}
async function row(id: string) {
  return (await db.query<{ email: string | null; email_ok: boolean; phone: string | null; phone_ok: boolean }>(
    'SELECT email,email_confirmed_at IS NOT NULL AS email_ok,phone,phone_confirmed_at IS NOT NULL AS phone_ok FROM xtimator_accounts WHERE id=$1', [id])).rows[0]
}

describe('Google sign-in without a phone', () => {
  it('creates an account from a new Google identity and returns it on the next sign-in', async () => {
    const id = await complete({ uid: 'new-google', provider: 'google.com', email: 'New.Person@example.test', google: 'new-google-sub' })
    expect(id).toBeTruthy()
    expect(await row(id!)).toEqual({ email: 'new.person@example.test', email_ok: true, phone: null, phone_ok: false })
    expect(await complete({ uid: 'new-google', provider: 'google.com', email: 'new.person@example.test', google: 'new-google-sub' })).toBe(id)
  })
  it('reaches the account that already confirmed the same email', async () => {
    expect(await complete({ uid: 'owner-google', provider: 'google.com', email: 'owner@example.test', google: 'owner-google-sub' })).toBe(legacyId)
    const links = await db.query('SELECT issuer FROM xtimator_identities WHERE user_id=$1 ORDER BY issuer', [legacyId])
    expect(links.rows).toEqual([{ issuer: 'https://accounts.google.com' }, { issuer }])
  })
  it('keeps an unconfirmed or ambiguous email behind recovery', async () => {
    await db.exec("INSERT INTO xtimator_accounts(email) VALUES('unconfirmed@example.test')")
    await expect(complete({ provider: 'google.com', email: 'unconfirmed@example.test' })).rejects.toThrow('account_recovery_required')
    await db.exec("INSERT INTO xtimator_accounts(email,email_confirmed_at) VALUES('twice@example.test',now()),('Twice@example.test',now())")
    await expect(complete({ provider: 'google.com', email: 'twice@example.test' })).rejects.toThrow('account_recovery_required')
  })
  it('still asks for a phone when Google sends no verified email', async () => {
    expect(await complete({ uid: 'google-without-email', provider: 'google.com' })).toBeNull()
  })
  it('adds a first phone to a Google-only account through the signed-in link flow', async () => {
    const id = await complete({ uid: 'google-then-phone', provider: 'google.com', email: 'phone-later@example.test' })
    expect(await complete({ uid: 'phone-later-subject', phone: '+15085550200', current: id! })).toBe(id)
    expect(await row(id!)).toMatchObject({ phone: '+15085550200', phone_ok: true })
    expect(await complete({ uid: 'phone-later-subject', phone: '+15085550200' })).toBe(id)
  })
  it('rejects a phone that already belongs to another account', async () => {
    await complete({ uid: 'phone-owner', phone: '+15085550201' })
    const id = await complete({ uid: 'google-conflict', provider: 'google.com', email: 'conflict@example.test' })
    await expect(complete({ uid: 'phone-owner', phone: '+15085550201', current: id! })).rejects.toThrow('identity_conflict')
  })
  it('keeps a new phone account away from an existing email', async () => {
    await expect(complete({ uid: 'phone-with-email', phone: '+15085550202', email: 'owner@example.test' })).rejects.toThrow('account_recovery_required')
  })
  it('keeps the function server-only and lets drafts stop on the phone screen', async () => {
    const grants = await db.query<{ ok: boolean }>("SELECT has_function_privilege('authenticated','public.xtimator_complete_identity(text,text,text,text,text,text,text,text,text,uuid)','EXECUTE') AS ok")
    expect(grants.rows[0].ok).toBe(false)
    await db.exec("INSERT INTO onboarding_drafts(step) VALUES('phone')")
    await expect(db.exec("INSERT INTO onboarding_drafts(step) VALUES('nope')")).rejects.toThrow(/check constraint/)
  })
})
