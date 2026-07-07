-- Pre-launch audit fix (A-3 / DB hardening): companies_delete (Phase 85,
-- 20260526000002) grants DELETE to ANY row in company_members for that
-- company_id — owner, admin, or member alike. Team Seats (Phase 135,
-- 20260628000001) introduced the 3-role matrix ('owner','admin','member')
-- specifically to differentiate privilege, but this policy was never
-- narrowed: any invited team member can call the REST API directly
-- (publishable key + their own JWT) and DELETE the company outright.
--
-- Restrict DELETE to the legacy owner-column match OR a company_members row
-- with role = 'owner'.

BEGIN;

DROP POLICY IF EXISTS "companies_delete" ON public.companies;
CREATE POLICY "companies_delete" ON public.companies FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR id IN (
      SELECT company_id FROM company_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

COMMIT;
