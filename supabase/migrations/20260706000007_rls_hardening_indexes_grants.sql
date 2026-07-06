-- Pre-launch audit fix — DB hardening bundle:
--   1. price_book_item_options RLS regressed to the legacy companies.user_id
--      pattern (created 2026-06-20, 25 days after the Phase 82 rewrite) —
--      team members can't manage price-book add-on options for their own
--      company through the authenticated client.
--   2. Drop two anon-role policies that are functionally dead today (the
--      estimates table has had no anon SELECT policy since
--      20260606000002_drop_estimates_anon_select_policy.sql, so their
--      subqueries always evaluate empty) but remain a landmine: if anon
--      SELECT on estimates is ever reintroduced, these silently reopen a
--      cross-tenant read/write path.
--   3. Missing indexes on hot foreign-key columns — every RLS check on these
--      tables (company_id IN (...)) and every cascade delete does a seq scan
--      today. estimates(share_token) is the most load-bearing: it backs
--      every public share-link page view and had NEITHER an index NOR a
--      uniqueness constraint.
--   4. Grant hygiene: two SECURITY DEFINER-adjacent functions were callable
--      via PostgREST by any authenticated/anon caller even though their only
--      real callers use the service-role client (which bypasses GRANT/REVOKE
--      entirely). Revoking removes a needless public RPC surface.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. price_book_item_options — rewrite to company_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "company members can manage their item options" ON public.price_book_item_options;
CREATE POLICY "company members can manage their item options"
  ON public.price_book_item_options
  FOR ALL
  USING (
    company_id IN (
      SELECT company_members.company_id FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_members.company_id FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Drop dead anon policies (see header)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "estimate_photos_anon_select_by_share_token" ON public.estimate_photos;
DROP POLICY IF EXISTS "estimate_signatures_anon_insert" ON public.estimate_signatures;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
-- Public share link — every anonymous page view of a shared estimate looks
-- this up. Also enforces the invariant the app already relies on (a
-- non-null share_token is unique per estimate).
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_share_token
  ON public.estimates(share_token) WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_company_id ON public.clients(company_id);

CREATE INDEX IF NOT EXISTS idx_recordings_project_id ON public.recordings(project_id);
CREATE INDEX IF NOT EXISTS idx_recordings_company_id ON public.recordings(company_id);

CREATE INDEX IF NOT EXISTS idx_photos_project_id ON public.photos(project_id);
CREATE INDEX IF NOT EXISTS idx_photos_company_id ON public.photos(company_id);

CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON public.estimates(project_id);

CREATE INDEX IF NOT EXISTS idx_estimate_sections_estimate_id ON public.estimate_sections(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_sections_company_id ON public.estimate_sections(company_id);

CREATE INDEX IF NOT EXISTS idx_estimate_items_section_id ON public.estimate_items(section_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_company_id ON public.estimate_items(company_id);

CREATE INDEX IF NOT EXISTS idx_estimate_activity_project_id ON public.estimate_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_estimate_activity_company_id ON public.estimate_activity(company_id);
CREATE INDEX IF NOT EXISTS idx_estimate_activity_estimate_id ON public.estimate_activity(estimate_id);

CREATE INDEX IF NOT EXISTS idx_company_price_book_company_id ON public.company_price_book(company_id);

CREATE INDEX IF NOT EXISTS idx_price_book_item_options_company_id ON public.price_book_item_options(company_id);
CREATE INDEX IF NOT EXISTS idx_price_book_item_options_item_id ON public.price_book_item_options(item_id);

-- ---------------------------------------------------------------------------
-- 4. Grant hygiene — service-role-only RPCs
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_draft_projects() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_user_count() FROM PUBLIC, anon, authenticated;

COMMIT;
