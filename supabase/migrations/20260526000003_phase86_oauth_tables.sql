-- Phase 86: OAuth 2.0 authorization-server tables for MCP custom-connector integration.
--
-- Locked decisions (SEED-030):
--   * Xtimator is the OAuth authorization-server + resource-server.
--   * Claude (Claude.ai / Desktop / Code) is the OAuth client — registered dynamically (RFC 7591).
--   * PKCE S256 only (public client, no client secret).
--   * Tokens scoped to (user_id, company_id) — the user authorizes Claude for the active company.
--   * All token values are HASHED (sha256) before storage — DB leaks must not compromise live sessions.
--   * All four tables are RLS deny-all — only the service-role client can read/write (the OAuth
--     endpoints themselves run server-side; tables must NEVER be readable from the browser).

BEGIN;

-- 1. oauth_clients ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   text UNIQUE NOT NULL,
  client_name                 text NOT NULL,
  redirect_uris               text[] NOT NULL,
  grant_types                 text[] NOT NULL,
  response_types              text[] NOT NULL,
  token_endpoint_auth_method  text NOT NULL DEFAULT 'none',
  created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
-- Deny-all: no policies created → no authenticated/anon access. Only service-role bypasses RLS.

-- 2. oauth_authorization_codes ---------------------------------------------
-- Primary key = code_hash. We never store the plaintext code; lookup is by sha256(code).
CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
  code_hash               text PRIMARY KEY,
  client_id               text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code_challenge          text NOT NULL,
  code_challenge_method   text NOT NULL CHECK (code_challenge_method = 'S256'),
  redirect_uri            text NOT NULL,
  scope                   text NOT NULL,
  expires_at              timestamptz NOT NULL,
  consumed_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_at_idx
  ON public.oauth_authorization_codes (expires_at);

-- 3. oauth_access_tokens ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
  token_hash    text PRIMARY KEY,
  client_id     text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope         text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS oauth_access_tokens_expires_at_idx
  ON public.oauth_access_tokens (expires_at);

-- 4. oauth_refresh_tokens ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
  token_hash    text PRIMARY KEY,
  client_id     text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope         text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_expires_at_idx
  ON public.oauth_refresh_tokens (expires_at);

-- Post-create assertions: RLS must be enabled on every oauth_* table, AND there must be
-- ZERO policies (deny-all). If either invariant is violated, fail loudly.
DO $$
DECLARE
  rls_off  int;
  policies int;
BEGIN
  SELECT count(*) INTO rls_off
    FROM pg_class
   WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
     AND relname IN ('oauth_clients','oauth_authorization_codes','oauth_access_tokens','oauth_refresh_tokens')
     AND relrowsecurity = false;
  IF rls_off > 0 THEN
    RAISE EXCEPTION 'Phase 86: % oauth_* table(s) have RLS disabled', rls_off;
  END IF;

  SELECT count(*) INTO policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('oauth_clients','oauth_authorization_codes','oauth_access_tokens','oauth_refresh_tokens');
  IF policies > 0 THEN
    RAISE EXCEPTION 'Phase 86: % unexpected policy(ies) on oauth_* tables (deny-all expected)', policies;
  END IF;
END
$$;

COMMIT;
