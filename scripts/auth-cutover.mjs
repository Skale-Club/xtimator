/**
 * Explicit owned-auth preflight. No .env file is loaded implicitly.
 * Inspection is read-only. --install-hook / --activate are separate mutations.
 * See docs/AUTH-CUTOVER.md. Never prints credentials, identities or tokens.
 */
import pg from 'pg'
import { SignJWT } from 'jose'
import { randomUUID } from 'node:crypto'

const args = new Set(process.argv.slice(2))
const expected = [...args].find(value => value.startsWith('--expected-host='))?.slice(16)
const install = args.has('--install-hook')
const activate = args.has('--activate')
const url = process.env.AUTH_DATABASE_URL
const fail = message => { const error = new Error(message); error.name = 'AuthPreflightError'; throw error }

async function main() {
  if (!url || !expected) fail('Set AUTH_DATABASE_URL and pass --expected-host=<verified database host>.')
  if ((install || activate) && !args.has('--exclusive-database')) fail('The PostgREST hook is application-wide; verify an exclusive Xtimator database before changing it.')
  if (install && activate) fail('Install the hook and activate in separate invocations; PostgREST must reload before verification.')
  let target
  try { target = new URL(url) } catch { fail('Invalid database configuration.') }
  if (target.hostname !== expected || !['postgres:', 'postgresql:'].includes(target.protocol)) fail('Database host does not match the explicitly expected target.')
  if (target.hostname.endsWith('.pooler.supabase.com') && target.port === '6543') fail('Use a direct database connection or session pooler on port 5432, not transaction pooling on 6543.')
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, statement_timeout: 15000 })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const { rows: [control] } = await client.query('SELECT active,instance_id FROM public.xtimator_auth_control WHERE singleton')
    const { rows: [counts] } = await client.query(`SELECT
      (SELECT count(*)::int FROM public.xtimator_accounts) AS accounts,
      (SELECT count(*)::int FROM public.xtimator_identities) AS identities,
      (SELECT count(*)::int FROM public.xtimator_accounts WHERE phone_confirmed_at IS NOT NULL) AS verified_phones,
      (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE c.contype='f' AND c.confrelid='auth.users'::regclass AND n.nspname='public') AS remaining_legacy_fks`)
    const { rows: settings } = await client.query(`SELECT unnest(s.setconfig) AS setting FROM pg_db_role_setting s
      WHERE s.setrole=(SELECT oid FROM pg_roles WHERE rolname='authenticator') AND s.setdatabase IN (0,(SELECT oid FROM pg_database WHERE datname=current_database()))`)
    const hooks = settings.map(row => row.setting).filter(value => value.startsWith('pgrst.db_pre_request='))
    const intended = 'pgrst.db_pre_request=public.xtimator_check_request'
    if (hooks.some(value => value !== intended && value !== 'pgrst.db_pre_request=')) fail('An existing PostgREST pre-request hook needs explicit composition; it will not be overwritten.')
    await client.query('ROLLBACK')
    console.log(JSON.stringify({ databaseHost: target.hostname, prepared: true, active: control.active, ...counts, requestHookInstalled: hooks.includes(intended) }))
    if (counts.remaining_legacy_fks) fail('Legacy foreign keys remain; review migration before activation.')
    if (install) {
      await client.query("ALTER ROLE authenticator SET pgrst.db_pre_request='public.xtimator_check_request'")
      await client.query("NOTIFY pgrst, 'reload config'")
      console.log('Request hook installed. Wait for PostgREST to reload, then run inspection again with the data-plane configuration.')
      return
    }
    const api = process.env.NEXT_PUBLIC_SUPABASE_URL
    const apiKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    const signingKey = process.env.XTIMATOR_DATA_JWT_SECRET
    let verified = false
    if (api && apiKey && signingKey && Buffer.byteLength(signingKey) >= 32) {
      const base = new URL(api)
      if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) fail('Data API must use HTTPS outside localhost.')
      const status = await fetch(new URL('/rest/v1/xtimator_auth_control?select=instance_id', base), {
        headers: { apikey: apiKey, authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000),
      })
      const rows = status.ok ? await status.json() : []
      if (rows.length !== 1 || rows[0].instance_id !== control.instance_id) fail('Data API does not match the inspected database.')
      // Nonexistent session/UUID: no account, session or application data is written.
      // Exact 42501 from our hook proves both accepted signature and live gating.
      const token = await new SignJWT({ sub: randomUUID(), role: 'authenticated', session_id: randomUUID() })
        .setProtectedHeader({ alg: 'HS256' }).setIssuer('xtimator').setAudience('authenticated').setIssuedAt().setExpirationTime('1m').sign(new TextEncoder().encode(signingKey))
      const probe = await fetch(new URL('/rest/v1/companies?select=id&limit=0', base), {
        headers: { apikey: apiKey, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      })
      const result = await probe.json().catch(() => ({}))
      verified = probe.status === 403 && result.code === '42501' && result.message === 'Session is no longer valid'
      console.log(JSON.stringify({ dataPlaneMatchesDatabase: true, signingKeyAndLiveRequestHookVerified: verified }))
    }
    if (activate) {
      if (!hooks.includes(intended) || !verified) fail('Activation requires verified signing key, matching database and the live request hook.')
      await client.query('SELECT public.xtimator_activate_owned_auth()')
      console.log('Owned authentication activated. Deploy the matching owned-mode build; old authenticated data tokens are now rejected.')
    } else if (!verified) console.log('Activation not ready: provide data-plane configuration and verify the live request hook. No state changed.')
  } finally { await client.end() }
}

main().catch(error => {
  // Database/gateway errors can include credentials or PII: never echo raw errors.
  console.error(error?.name === 'AuthPreflightError' ? error.message : 'Owned-auth preflight failed. Check the explicit target, prepared schema, privileges, hook and data-plane configuration. No automatic fallback was attempted.')
  process.exitCode = 1
})
