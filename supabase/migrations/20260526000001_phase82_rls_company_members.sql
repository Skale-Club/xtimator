-- Phase 82: Rewrite tenant-scoped RLS to gate by company_members instead of companies.user_id.
-- Legacy: SELECT companies.id FROM companies WHERE companies.user_id = auth.uid()
-- New:    SELECT company_members.company_id FROM company_members WHERE company_members.user_id = auth.uid()
-- For every existing user, Phase 79 backfill (1 owner per company) guarantees behavioral equivalence.
-- For multi-company users (post Phase 81), the new pattern correctly grants access to additional companies.

BEGIN;

-- clients.clients_delete
DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- clients.clients_insert
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- clients.clients_select
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- clients.clients_update
DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- company_price_book.company_price_book_delete
DROP POLICY IF EXISTS "company_price_book_delete" ON public.company_price_book;
CREATE POLICY "company_price_book_delete" ON public.company_price_book FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- company_price_book.company_price_book_insert
DROP POLICY IF EXISTS "company_price_book_insert" ON public.company_price_book;
CREATE POLICY "company_price_book_insert" ON public.company_price_book FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- company_price_book.company_price_book_select
DROP POLICY IF EXISTS "company_price_book_select" ON public.company_price_book;
CREATE POLICY "company_price_book_select" ON public.company_price_book FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- company_price_book.company_price_book_update
DROP POLICY IF EXISTS "company_price_book_update" ON public.company_price_book;
CREATE POLICY "company_price_book_update" ON public.company_price_book FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_activity.estimate_activity_delete
DROP POLICY IF EXISTS "estimate_activity_delete" ON public.estimate_activity;
CREATE POLICY "estimate_activity_delete" ON public.estimate_activity FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_activity.estimate_activity_insert
DROP POLICY IF EXISTS "estimate_activity_insert" ON public.estimate_activity;
CREATE POLICY "estimate_activity_insert" ON public.estimate_activity FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_activity.estimate_activity_select
DROP POLICY IF EXISTS "estimate_activity_select" ON public.estimate_activity;
CREATE POLICY "estimate_activity_select" ON public.estimate_activity FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_deliveries.estimate_deliveries_insert
DROP POLICY IF EXISTS "estimate_deliveries_insert" ON public.estimate_deliveries;
CREATE POLICY "estimate_deliveries_insert" ON public.estimate_deliveries FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_deliveries.estimate_deliveries_select
DROP POLICY IF EXISTS "estimate_deliveries_select" ON public.estimate_deliveries;
CREATE POLICY "estimate_deliveries_select" ON public.estimate_deliveries FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_items.estimate_items_delete
DROP POLICY IF EXISTS "estimate_items_delete" ON public.estimate_items;
CREATE POLICY "estimate_items_delete" ON public.estimate_items FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_items.estimate_items_insert
DROP POLICY IF EXISTS "estimate_items_insert" ON public.estimate_items;
CREATE POLICY "estimate_items_insert" ON public.estimate_items FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_items.estimate_items_select
DROP POLICY IF EXISTS "estimate_items_select" ON public.estimate_items;
CREATE POLICY "estimate_items_select" ON public.estimate_items FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_items.estimate_items_update
DROP POLICY IF EXISTS "estimate_items_update" ON public.estimate_items;
CREATE POLICY "estimate_items_update" ON public.estimate_items FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_sections.estimate_sections_delete
DROP POLICY IF EXISTS "estimate_sections_delete" ON public.estimate_sections;
CREATE POLICY "estimate_sections_delete" ON public.estimate_sections FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_sections.estimate_sections_insert
DROP POLICY IF EXISTS "estimate_sections_insert" ON public.estimate_sections;
CREATE POLICY "estimate_sections_insert" ON public.estimate_sections FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_sections.estimate_sections_select
DROP POLICY IF EXISTS "estimate_sections_select" ON public.estimate_sections;
CREATE POLICY "estimate_sections_select" ON public.estimate_sections FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_sections.estimate_sections_update
DROP POLICY IF EXISTS "estimate_sections_update" ON public.estimate_sections;
CREATE POLICY "estimate_sections_update" ON public.estimate_sections FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimate_signatures.estimate_signatures_select
DROP POLICY IF EXISTS "estimate_signatures_select" ON public.estimate_signatures;
CREATE POLICY "estimate_signatures_select" ON public.estimate_signatures FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimates.estimates_delete
DROP POLICY IF EXISTS "estimates_delete" ON public.estimates;
CREATE POLICY "estimates_delete" ON public.estimates FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimates.estimates_insert
DROP POLICY IF EXISTS "estimates_insert" ON public.estimates;
CREATE POLICY "estimates_insert" ON public.estimates FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimates.estimates_select
DROP POLICY IF EXISTS "estimates_select" ON public.estimates;
CREATE POLICY "estimates_select" ON public.estimates FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- estimates.estimates_update
DROP POLICY IF EXISTS "estimates_update" ON public.estimates;
CREATE POLICY "estimates_update" ON public.estimates FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- photos.photos_delete
DROP POLICY IF EXISTS "photos_delete" ON public.photos;
CREATE POLICY "photos_delete" ON public.photos FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- photos.photos_insert
DROP POLICY IF EXISTS "photos_insert" ON public.photos;
CREATE POLICY "photos_insert" ON public.photos FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- photos.photos_select
DROP POLICY IF EXISTS "photos_select" ON public.photos;
CREATE POLICY "photos_select" ON public.photos FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- photos.photos_update
DROP POLICY IF EXISTS "photos_update" ON public.photos;
CREATE POLICY "photos_update" ON public.photos FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_folders.price_book_folders_delete
DROP POLICY IF EXISTS "price_book_folders_delete" ON public.price_book_folders;
CREATE POLICY "price_book_folders_delete" ON public.price_book_folders FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_folders.price_book_folders_insert
DROP POLICY IF EXISTS "price_book_folders_insert" ON public.price_book_folders;
CREATE POLICY "price_book_folders_insert" ON public.price_book_folders FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_folders.price_book_folders_select
DROP POLICY IF EXISTS "price_book_folders_select" ON public.price_book_folders;
CREATE POLICY "price_book_folders_select" ON public.price_book_folders FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_folders.price_book_folders_update
DROP POLICY IF EXISTS "price_book_folders_update" ON public.price_book_folders;
CREATE POLICY "price_book_folders_update" ON public.price_book_folders FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_imports.Members can delete imports for their company
DROP POLICY IF EXISTS "Members can delete imports for their company" ON public.price_book_imports;
CREATE POLICY "Members can delete imports for their company" ON public.price_book_imports FOR DELETE TO public
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_imports.Members can insert imports for their company
DROP POLICY IF EXISTS "Members can insert imports for their company" ON public.price_book_imports;
CREATE POLICY "Members can insert imports for their company" ON public.price_book_imports FOR INSERT TO public
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- price_book_imports.Members can read company imports
DROP POLICY IF EXISTS "Members can read company imports" ON public.price_book_imports;
CREATE POLICY "Members can read company imports" ON public.price_book_imports FOR SELECT TO public
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- projects.projects_delete
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- projects.projects_insert
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- projects.projects_select
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- projects.projects_update
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- recordings.recordings_delete
DROP POLICY IF EXISTS "recordings_delete" ON public.recordings;
CREATE POLICY "recordings_delete" ON public.recordings FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- recordings.recordings_insert
DROP POLICY IF EXISTS "recordings_insert" ON public.recordings;
CREATE POLICY "recordings_insert" ON public.recordings FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- recordings.recordings_select
DROP POLICY IF EXISTS "recordings_select" ON public.recordings;
CREATE POLICY "recordings_select" ON public.recordings FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- recordings.recordings_update
DROP POLICY IF EXISTS "recordings_update" ON public.recordings;
CREATE POLICY "recordings_update" ON public.recordings FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- tour_events.tour_events_company_access
DROP POLICY IF EXISTS "tour_events_company_access" ON public.tour_events;
CREATE POLICY "tour_events_company_access" ON public.tour_events FOR ALL TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- Post-rewrite in-migration assertion
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM pg_policies
   WHERE schemaname='public'
     AND (qual ~ 'companies.*user_id' OR with_check ~ 'companies.*user_id');
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Phase 82 RLS rewrite incomplete: % policies still reference companies.user_id', remaining;
  END IF;
END
$$;

COMMIT;