-- Public demo read-only enforcement (DB half of defense-in-depth).
--
-- The demo user may browse the dedicated demo company but must never mutate any
-- data. We enforce this with RESTRICTIVE policies that AND with the existing
-- permissive (company-scoped) policies: writes are allowed only when the caller
-- is NOT the demo user. SELECT is untouched, so the demo stays fully readable.
--
-- Superadmins and normal users are unaffected (is_demo_user() is false for
-- them). The seed/provisioning runs via the service role, which bypasses RLS
-- entirely, so it can still populate and reset the demo company.

-- ---------------------------------------------------------------------------
-- 1. Registry of demo user(s). Populated at provisioning time (service role).
--    Kept as a table (not a literal) because the demo auth user is created via
--    Supabase Auth, so its id is not known at migration time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.demo_config (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on; no policies => unreachable by authenticated clients. Only the service
-- role (bypasses RLS) and SECURITY DEFINER functions below can read/write it.
ALTER TABLE public.demo_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. is_demo_user(): true when the current session is a registered demo user.
--    SECURITY DEFINER so it can read demo_config regardless of caller RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_demo_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.demo_config WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_demo_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Add RESTRICTIVE write-block policies to every RLS-enabled public table.
--    Over-blocking is the safe direction for a read-only demo: a restrictive
--    policy can only ever remove access, never grant it. Idempotent (drops
--    first). Re-run a similar migration if new tables are added later.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname <> 'demo_config'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS demo_block_insert ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY demo_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_demo_user())',
      t.relname
    );

    EXECUTE format('DROP POLICY IF EXISTS demo_block_update ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY demo_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_demo_user()) WITH CHECK (NOT public.is_demo_user())',
      t.relname
    );

    EXECUTE format('DROP POLICY IF EXISTS demo_block_delete ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY demo_block_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_demo_user())',
      t.relname
    );
  END LOOP;
END $$;
