import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-056 step 2 - static contract for the Supabase compatibility shim.
 * The migration must be a no-op on Supabase and idempotent everywhere, so these
 * assertions lock the guards rather than executing SQL.
 */
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107000001_postgrest_compat_shim.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

/** SQL with `-- ...` comment lines removed, so header prose cannot satisfy or trip a check. */
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

describe('postgrest compat shim migration', () => {
  it('guards every CREATE ROLE with a pg_roles existence check', () => {
    for (const role of ['anon', 'authenticated', 'service_role', 'authenticator']) {
      const re = new RegExp(
        String.raw`IF NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname = '${role}'\) THEN\s+CREATE ROLE ${role}\b`,
      )
      expect(code, role).toMatch(re)
    }
    expect((code.match(/CREATE ROLE/g) ?? []).length).toBe(4)
  })

  it('service_role is BYPASSRLS; the other request roles are not', () => {
    expect(code).toMatch(/CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS/)
    expect(code).not.toMatch(/CREATE ROLE (anon|authenticated)\b[^;]*BYPASSRLS/)
  })

  it('authenticator is LOGIN NOINHERIT and is granted the three request roles', () => {
    expect(code).toMatch(/CREATE ROLE authenticator LOGIN NOINHERIT/)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(code).toContain(`GRANT ${role} TO authenticator;`)
    }
  })

  it('never sets a password literal (operator sets it out of band)', () => {
    expect(code).not.toMatch(/PASSWORD\s+'/i)
    expect(code).not.toMatch(/ENCRYPTED\s+PASSWORD/i)
    expect(sql).toContain("<authenticator-password>")
  })

  it('creates the auth schema and the three helpers only when missing, as STABLE sql', () => {
    expect(code).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_namespace WHERE nspname = 'auth'\) THEN\s+CREATE SCHEMA auth;/)
    for (const [fn, ret] of [['uid', 'uuid'], ['role', 'text'], ['jwt', 'jsonb']] as const) {
      expect(code).toMatch(new RegExp(`p\.proname = '${fn}' AND p\.pronargs = 0`))
      expect(code).toMatch(new RegExp(String.raw`CREATE FUNCTION auth\.${fn}\(\) RETURNS ${ret}\s+LANGUAGE sql STABLE`))
    }
    // No CREATE OR REPLACE: that would overwrite Supabase's own definitions.
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION auth\./)
  })

  it('auth helpers read request.jwt.claims (and the legacy per-claim GUCs) via pg_catalog', () => {
    expect(code).toContain("pg_catalog.current_setting('request.jwt.claims', true)")
    expect(code).toContain("pg_catalog.current_setting('request.jwt.claim.sub', true)")
    expect(code).toContain("pg_catalog.current_setting('request.jwt.claim.role', true)")
    expect(code).toContain("->> 'sub'")
    expect(code).toContain("->> 'role'")
    // Unqualified current_setting would depend on the caller's search_path.
    expect(code.replace(/pg_catalog\.current_setting/g, '')).not.toMatch(/current_setting\(/)
  })

  it('installs pgcrypto, uuid-ossp and vector into schema extensions, each guarded', () => {
    expect(code).toMatch(/CREATE SCHEMA extensions;/)
    expect(code).toMatch(/extname = 'pgcrypto'\) THEN\s+CREATE EXTENSION pgcrypto WITH SCHEMA extensions;/)
    expect(code).toMatch(/extname = 'uuid-ossp'\) THEN\s+CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;/)
    expect(code).toMatch(/extname = 'vector'\) THEN\s+CREATE EXTENSION vector WITH SCHEMA extensions;/)
  })

  it('grants and default privileges run only when supabase_admin is absent (no-op on Supabase)', () => {
    expect(code).toMatch(/is_supabase boolean := EXISTS \(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname = 'supabase_admin'\)/)
    const gated = code.slice(code.indexOf('IF NOT is_supabase THEN'))
    expect(gated).toContain('GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role')
    expect(gated).toMatch(/GRANT ALL ON ALL TABLES\s+IN SCHEMA public TO anon, authenticated, service_role/)
    expect(gated).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES\s+TO anon, authenticated, service_role/)
    expect(gated).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES/)
    expect(gated).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS/)
    // Nothing grant-shaped may appear before the gate.
    const before = code.slice(0, code.indexOf('IF NOT is_supabase THEN'))
    expect(before).not.toMatch(/GRANT (ALL|USAGE|EXECUTE)/)
    expect(before).not.toMatch(/ALTER DEFAULT PRIVILEGES/)
  })

  it('never drops, disables RLS, or alters existing application objects', () => {
    expect(code).not.toMatch(/\bDROP\b/i)
    expect(code).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    expect(code).not.toMatch(/\bALTER TABLE\b/i)
  })

  it('documents purpose, the Supabase no-op, and when to apply it', () => {
    const header = sql.slice(0, sql.indexOf('DO $shim$'))
    expect(header).toMatch(/PURPOSE/)
    expect(header).toMatch(/NO-OP ON SUPABASE/)
    expect(header).toMatch(/AFTER the pg_restore/)
    expect(header).toMatch(/BEFORE\s+(--\s+)?PostgREST starts/)
  })
})
