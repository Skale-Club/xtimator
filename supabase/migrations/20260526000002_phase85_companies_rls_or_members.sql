-- Phase 85: Extend companies_* RLS policies with company_members OR-clause.
--
-- Rationale:
--   * Phase 79 added company_members + backfilled 1 owner per company.
--   * Phase 81 wired the Switcher + Add Company flow (createOrUpdateCompany('add')).
--   * After Phase 82, every tenant-scoped table gates by company_members.
--   * BUT `companies` itself still gates by `companies.user_id = auth.uid()`, which means
--     a multi-company user (rare today, but real post-Phase-81) can't SELECT/UPDATE
--     their non-primary companies through the standard authenticated client.
--
-- This migration extends each companies_* policy with an OR-clause: accept the row
-- if either (a) the legacy user_id ownership matches, OR (b) the user is a member
-- of the company via company_members. For every existing user this is a no-op
-- (backfill guarantees both conditions resolve to the same set). For multi-company
-- users it correctly grants access to additional companies.
--
-- We intentionally do NOT drop `companies.user_id` here — that's deferred to a future
-- v5 cleanup phase. The column stays as a backwards-compat handle that mode:'first'
-- and lib/actions/auth.ts still use.

BEGIN;

-- companies_select
DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid()))
  );

-- companies_insert  (WITH CHECK only)
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
-- INSERT WITH CHECK keeps the legacy clause only — a new INSERT cannot satisfy a
-- "you must be a member" rule before the member row exists. createOrUpdateCompany('add')
-- already sets user_id = claims.sub on the new row (updated in lib/actions/company.ts
-- as part of this phase), so this CHECK is satisfied.

-- companies_update
DROP POLICY IF EXISTS "companies_update" ON public.companies;
CREATE POLICY "companies_update" ON public.companies FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid()))
  );

-- companies_delete
DROP POLICY IF EXISTS "companies_delete" ON public.companies;
CREATE POLICY "companies_delete" ON public.companies FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid()))
  );

-- Post-rewrite assertion: every companies_* read/update/delete policy must include the new pattern.
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing FROM pg_policies
   WHERE schemaname='public' AND tablename='companies'
     AND policyname IN ('companies_select','companies_update','companies_delete')
     AND (qual !~ 'company_members.*user_id' OR (with_check IS NOT NULL AND with_check !~ 'company_members.*user_id'));
  IF missing > 0 THEN
    RAISE EXCEPTION 'Phase 85: % companies_* policies still missing the company_members OR-clause', missing;
  END IF;
END
$$;

COMMIT;
