-- Phase 79: Multi-company foundation — company_members join table
-- D-01: composite PK (user_id, company_id); role = 'owner' for v4.0
-- D-02: idempotent backfill INSERT ... ON CONFLICT DO NOTHING
-- D-03: RLS — user can read rows where user_id = auth.uid(); no INSERT/UPDATE/DELETE policies (writes via service role only)
-- D-04: companies.user_id column is INTENTIONALLY preserved; Phase 82 will rewrite RLS and drop it

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE public.company_members (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

COMMENT ON TABLE public.company_members IS
  'Phase 79: maps users to companies for v4.0 multi-tenancy. role is constrained to ''owner'' in v4.0; future tiers will widen the CHECK.';
COMMENT ON COLUMN public.company_members.role IS
  'Role within the company. Only ''owner'' is valid in v4.0. CHECK widened in a later milestone if Admin/Member tiers ship.';

-- Index for D-07 fallback resolution: ORDER BY companies.created_at DESC for the user's memberships
CREATE INDEX company_members_user_id ON public.company_members(user_id);

-- ============================================================
-- ROW LEVEL SECURITY (D-03)
-- ============================================================

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- D-03: user can READ their own membership rows. No INSERT/UPDATE/DELETE policies →
-- authenticated clients cannot mutate this table. Writes happen via service role only
-- (createOrUpdateCompany 'first' / 'add' modes in Plan 03 use the service-role path via
-- the existing server action's authenticated supabase client, which is still authorized
-- because the policy WITH CHECK is absent → no INSERT is permitted from anon/authenticated.
-- We deliberately scope this to SELECT only; service-role bypasses RLS.)
CREATE POLICY "company_members_select" ON public.company_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- BACKFILL (D-02 — idempotent)
-- ============================================================

INSERT INTO public.company_members (user_id, company_id, role)
SELECT user_id, id, 'owner'
FROM public.companies
ON CONFLICT (user_id, company_id) DO NOTHING;
