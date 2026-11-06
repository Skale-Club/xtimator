-- SEED-056 step 2 - Supabase compatibility shim for a self-hosted PostgREST.
--
-- PURPOSE
--   Xtimator's data layer is supabase-js -> PostgREST with 459 RLS policies that
--   call auth.uid() / auth.jwt() / auth.role() and target the roles anon,
--   authenticated and service_role. A pg_dump of schema `public` does NOT carry
--   those dependencies, so a vanilla PostgreSQL 17 (+ pgvector) restore has
--   neither the roles nor the `auth` helper functions nor the `extensions`
--   schema (the dump references extensions.vector). This migration creates
--   exactly the pieces Supabase provides, so the restored schema and every RLS
--   policy behave identically behind a vanilla PostgREST
--   (PGRST_JWT_SECRET = XTIMATOR_DATA_JWT_SECRET).
--
-- WHY IT IS A NO-OP ON SUPABASE
--   Every object created here already exists on Supabase (roles, auth.uid/
--   role/jwt, the extensions schema and the extensions themselves, grants and
--   default privileges). Each step is guarded by an existence check, and the
--   grants/default-privileges step runs ONLY when the role `supabase_admin` is
--   absent (i.e. on a non-Supabase server), so applying it to Supabase never
--   alters ownership, grants or definitions. Applying it twice is also a no-op.
--
-- WHERE / WHEN TO APPLY (self-hosted target only)
--   Run as a superuser (roles with BYPASSRLS can only be created by one), right
--   AFTER the pg_restore of `public` + `supabase_migrations` and BEFORE
--   PostgREST starts. scripts/db-copy.sh does this for you; the manual form is
--     psql "$TARGET_ADMIN_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261107000001_postgrest_compat_shim.sql
--   The operator then sets the authenticator password OUT OF BAND (never in this
--   file):  ALTER ROLE authenticator PASSWORD '<authenticator-password>';
--   See docs/runbooks/db-to-coolify.md.
--
-- Rollback (self-hosted only; never run on Supabase):
--   DROP SCHEMA auth CASCADE; DROP ROLE authenticator, service_role, authenticated, anon;

DO $shim$
DECLARE
  is_supabase boolean := EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin');
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Roles
  ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- LOGIN but NOINHERIT; NO PASSWORD here - the operator sets it out of band.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;

  -- authenticator may SET ROLE to the three request roles (PostgREST does this per request).
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid AND r.rolname = 'anon'
    JOIN pg_catalog.pg_roles u ON u.oid = m.member AND u.rolname = 'authenticator'
  ) THEN
    GRANT anon TO authenticator;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid AND r.rolname = 'authenticated'
    JOIN pg_catalog.pg_roles u ON u.oid = m.member AND u.rolname = 'authenticator'
  ) THEN
    GRANT authenticated TO authenticator;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid AND r.rolname = 'service_role'
    JOIN pg_catalog.pg_roles u ON u.oid = m.member AND u.rolname = 'authenticator'
  ) THEN
    GRANT service_role TO authenticator;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Schema auth + JWT helper functions (Supabase's exact definitions)
  ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid' AND p.pronargs = 0
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $body$
        SELECT coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid
      $body$
    $f$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'role' AND p.pronargs = 0
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE
      AS $body$
        SELECT coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
          (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )::text
      $body$
    $f$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'jwt' AND p.pronargs = 0
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION auth.jwt() RETURNS jsonb
      LANGUAGE sql STABLE
      AS $body$
        SELECT coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
        )::jsonb
      $body$
    $f$;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Extensions (Supabase keeps them in schema "extensions"; the dump
  --    references extensions.vector, so the target must match).
  ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'extensions') THEN
    CREATE SCHEMA extensions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'uuid-ossp') THEN
    CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'vector') THEN
    CREATE EXTENSION vector WITH SCHEMA extensions;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Grants and default privileges - ONLY on a non-Supabase server.
  --    Mirrors Supabase: broad ALL to the three request roles, with RLS
  --    (not GRANTs) doing the tenancy enforcement.
  ---------------------------------------------------------------------------
  IF NOT is_supabase THEN
    GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;

    -- pg_restore --no-privileges leaves existing objects ungranted: grant now.
    GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

    -- Objects created later by the migrating role get the same grants.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

    -- Supabase's database-level search_path; lets unqualified vector operators resolve.
    EXECUTE pg_catalog.format(
      'ALTER DATABASE %I SET search_path TO "$user", public, extensions',
      pg_catalog.current_database()
    );
  END IF;
END
$shim$;
