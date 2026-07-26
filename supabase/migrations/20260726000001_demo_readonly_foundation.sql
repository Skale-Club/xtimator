-- Phase 180 / SAFE-03: final direct-Supabase write boundary for the public demo.
--
-- Existing permissive tenant policies remain authoritative. These RESTRICTIVE
-- policies can only subtract authenticated write access. The service role
-- continues to bypass RLS for deliberate seed/reset operations.

BEGIN;

-- Fail before changing constraints or policies unless the registry is exactly
-- the seeded dedicated user/company pair. Never guess, repair, or delete data
-- in a migration.
DO $$
DECLARE
  mapping_count integer;
  distinct_company_count integer;
  null_company_count integer;
  valid_mapping_count integer;
BEGIN
  SELECT
    COUNT(*),
    COUNT(DISTINCT company_id),
    COUNT(*) FILTER (WHERE company_id IS NULL)
  INTO mapping_count, distinct_company_count, null_company_count
  FROM public.demo_config;

  SELECT COUNT(*)
  INTO valid_mapping_count
  FROM public.demo_config dc
  JOIN auth.users u
    ON u.id = dc.user_id
  JOIN public.companies c
    ON c.id = dc.company_id
   AND c.user_id = dc.user_id
  JOIN public.company_members cm
    ON cm.user_id = dc.user_id
   AND cm.company_id = dc.company_id
  WHERE dc.company_id IS NOT NULL;

  IF mapping_count <> 1
     OR distinct_company_count <> 1
     OR null_company_count <> 0
     OR valid_mapping_count <> 1 THEN
    RAISE EXCEPTION
      'demo_config preflight failed: expected exactly one non-null user/company mapping backed by auth.users, companies, and company_members (rows %, companies %, nulls %, valid %)',
      mapping_count,
      distinct_company_count,
      null_company_count,
      valid_mapping_count;
  END IF;
END
$$;

ALTER TABLE public.demo_config
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.demo_config'::regclass
      AND conname = 'demo_config_company_id_fkey'
  ) THEN
    ALTER TABLE public.demo_config
      ADD CONSTRAINT demo_config_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS demo_config_company_id_key
  ON public.demo_config(company_id);

-- Keep the principal helper from the original demo migration, but pin its
-- namespace and reset its grants on every rerun.
CREATE OR REPLACE FUNCTION public.is_demo_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.demo_config
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_demo_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_user() TO authenticated;

-- A row/path belongs to the deterministic demo tenant when its trusted company
-- identifier is the one and only hardened registry mapping.
CREATE OR REPLACE FUNCTION public.is_demo_company(candidate uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.demo_config
    WHERE company_id = candidate
  );
$$;

REVOKE ALL ON FUNCTION public.is_demo_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_company(uuid) TO authenticated;

-- Principal-wide deny: the dedicated public identity cannot write any current
-- public RLS base table, including tables created after the July rerun.
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
END
$$;

-- Row-wide deny: even another authenticated member cannot mutate rows owned by
-- the deterministic demo company. Only UUID company_id columns are compatible
-- with the helper and included in this sweep.
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
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'company_id'
          AND a.atttypid = 'uuid'::regtype
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS demo_company_block_insert ON public.%I',
      t.relname
    );
    EXECUTE format(
      'CREATE POLICY demo_company_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_demo_company(company_id))',
      t.relname
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS demo_company_block_update ON public.%I',
      t.relname
    );
    EXECUTE format(
      'CREATE POLICY demo_company_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_demo_company(company_id)) WITH CHECK (NOT public.is_demo_company(company_id))',
      t.relname
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS demo_company_block_delete ON public.%I',
      t.relname
    );
    EXECUTE format(
      'CREATE POLICY demo_company_block_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_demo_company(company_id))',
      t.relname
    );
  END LOOP;
END
$$;

-- companies uses id rather than company_id as its trusted tenant key.
DROP POLICY IF EXISTS demo_company_block_insert ON public.companies;
CREATE POLICY demo_company_block_insert
  ON public.companies
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_demo_company(id));

DROP POLICY IF EXISTS demo_company_block_update ON public.companies;
CREATE POLICY demo_company_block_update
  ON public.companies
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT public.is_demo_company(id))
  WITH CHECK (NOT public.is_demo_company(id));

DROP POLICY IF EXISTS demo_company_block_delete ON public.companies;
CREATE POLICY demo_company_block_delete
  ON public.companies
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT public.is_demo_company(id));

-- Storage is outside public and needs its own principal triplet.
DROP POLICY IF EXISTS demo_block_insert ON storage.objects;
CREATE POLICY demo_block_insert
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_demo_user());

DROP POLICY IF EXISTS demo_block_update ON storage.objects;
CREATE POLICY demo_block_update
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT public.is_demo_user())
  WITH CHECK (NOT public.is_demo_user());

DROP POLICY IF EXISTS demo_block_delete ON storage.objects;
CREATE POLICY demo_block_delete
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT public.is_demo_user());

-- Company-prefixed Storage paths use the first folder only when it is a
-- syntactically valid UUID. Invalid or missing folders become NULL rather than
-- raising during policy evaluation; existing permissive bucket policies still
-- decide whether those paths are writable.
DROP POLICY IF EXISTS demo_company_block_insert ON storage.objects;
CREATE POLICY demo_company_block_insert
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_demo_company(
      CASE
        WHEN (storage.foldername(name))[1]
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
    )
  );

DROP POLICY IF EXISTS demo_company_block_update ON storage.objects;
CREATE POLICY demo_company_block_update
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    NOT public.is_demo_company(
      CASE
        WHEN (storage.foldername(name))[1]
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
    )
  )
  WITH CHECK (
    NOT public.is_demo_company(
      CASE
        WHEN (storage.foldername(name))[1]
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
    )
  );

DROP POLICY IF EXISTS demo_company_block_delete ON storage.objects;
CREATE POLICY demo_company_block_delete
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    NOT public.is_demo_company(
      CASE
        WHEN (storage.foldername(name))[1]
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
    )
  );

-- Terminal catalog assertions make an incomplete rerun fail atomically.
DO $$
DECLARE
  missing_public_user integer;
  missing_public_company integer;
  missing_companies integer;
  missing_storage integer;
BEGIN
  WITH expected AS (
    SELECT
      c.relname AS tablename,
      spec.policyname,
      spec.cmd
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (
      VALUES
        ('demo_block_insert', 'INSERT'),
        ('demo_block_update', 'UPDATE'),
        ('demo_block_delete', 'DELETE')
    ) AS spec(policyname, cmd)
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname <> 'demo_config'
  )
  SELECT COUNT(*)
  INTO missing_public_user
  FROM expected e
  LEFT JOIN pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = e.tablename
   AND p.policyname = e.policyname
   AND p.cmd = e.cmd
   AND p.permissive = 'RESTRICTIVE'
   AND 'authenticated' = ANY (p.roles)
  WHERE p.policyname IS NULL;

  WITH company_tables AS (
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname <> 'demo_config'
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'company_id'
          AND a.atttypid = 'uuid'::regtype
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
  ),
  expected AS (
    SELECT
      ct.tablename,
      spec.policyname,
      spec.cmd
    FROM company_tables ct
    CROSS JOIN (
      VALUES
        ('demo_company_block_insert', 'INSERT'),
        ('demo_company_block_update', 'UPDATE'),
        ('demo_company_block_delete', 'DELETE')
    ) AS spec(policyname, cmd)
  )
  SELECT COUNT(*)
  INTO missing_public_company
  FROM expected e
  LEFT JOIN pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = e.tablename
   AND p.policyname = e.policyname
   AND p.cmd = e.cmd
   AND p.permissive = 'RESTRICTIVE'
   AND 'authenticated' = ANY (p.roles)
  WHERE p.policyname IS NULL;

  WITH expected AS (
    SELECT *
    FROM (
      VALUES
        ('demo_company_block_insert', 'INSERT'),
        ('demo_company_block_update', 'UPDATE'),
        ('demo_company_block_delete', 'DELETE')
    ) AS spec(policyname, cmd)
  )
  SELECT COUNT(*)
  INTO missing_companies
  FROM expected e
  LEFT JOIN pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = 'companies'
   AND p.policyname = e.policyname
   AND p.cmd = e.cmd
   AND p.permissive = 'RESTRICTIVE'
   AND 'authenticated' = ANY (p.roles)
  WHERE p.policyname IS NULL;

  WITH expected AS (
    SELECT *
    FROM (
      VALUES
        ('demo_block_insert', 'INSERT'),
        ('demo_block_update', 'UPDATE'),
        ('demo_block_delete', 'DELETE'),
        ('demo_company_block_insert', 'INSERT'),
        ('demo_company_block_update', 'UPDATE'),
        ('demo_company_block_delete', 'DELETE')
    ) AS spec(policyname, cmd)
  )
  SELECT COUNT(*)
  INTO missing_storage
  FROM expected e
  LEFT JOIN pg_policies p
    ON p.schemaname = 'storage'
   AND p.tablename = 'objects'
   AND p.policyname = e.policyname
   AND p.cmd = e.cmd
   AND p.permissive = 'RESTRICTIVE'
   AND 'authenticated' = ANY (p.roles)
  WHERE p.policyname IS NULL;

  IF missing_public_user > 0
     OR missing_public_company > 0
     OR missing_companies > 0
     OR missing_storage > 0 THEN
    RAISE EXCEPTION
      'demo read-only catalog coverage incomplete: public user %, public company %, companies %, storage %',
      missing_public_user,
      missing_public_company,
      missing_companies,
      missing_storage;
  END IF;
END
$$;

COMMIT;
