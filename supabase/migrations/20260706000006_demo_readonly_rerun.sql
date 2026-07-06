-- Pre-launch audit fix: re-run the demo-readonly RESTRICTIVE policy sweep
-- from 20260530000001_demo_readonly.sql. That migration's own comment warned
-- "Re-run a similar migration if new tables are added later" — it only swept
-- tables that existed AT THAT TIME. Every table created since (invoices,
-- price_book_item_options, knowledge_entries, company_invites,
-- estimate_photos, whatsapp_*, price_research_cache, oauth_*, etc.) never
-- got the demo_block_insert/update/delete policies, so the demo user could
-- write to them via the authenticated client.
--
-- Identical DO-block, safe to re-run: idempotent (drops each policy before
-- recreating), and skips demo_config plus any table already covered (the
-- CREATE POLICY is a no-op there — same definition either way).

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
