-- Pre-launch audit fix (DB hardening): storage.objects policies for the
-- audio/photos/pdfs/logos buckets were never migrated to the company_members
-- model when Phase 82 (20260526000001_phase82_rls_company_members.sql)
-- rewrote every public-schema tenant policy from the legacy
-- `companies WHERE user_id = auth.uid()` pattern. Phase 82's own completion
-- assertion only checked `schemaname='public'`, so storage.objects (schema
-- `storage`) slipped through.
--
-- Impact: NOT a cross-tenant leak (the {company_id}/... path prefix check
-- still holds) — but a Team Seats member (added via company_members, not the
-- account owner) cannot upload, read, or delete audio/photos/PDFs for their
-- OWN company through the authenticated client, because the policy only ever
-- matches `companies.user_id`. That silently breaks the capture flow (and PDF
-- downloads) for every non-owner team member.
--
-- logos_select is intentionally NOT touched here — 20260522000001 made the
-- logos bucket public and replaced company_logos_select with an unrestricted
-- logos_public_select policy; that one is correct as-is.

BEGIN;

-- AUDIO bucket
DROP POLICY IF EXISTS "company_audio_insert" ON storage.objects;
CREATE POLICY "company_audio_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_audio_select" ON storage.objects;
CREATE POLICY "company_audio_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_audio_delete" ON storage.objects;
CREATE POLICY "company_audio_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

-- PHOTOS bucket
DROP POLICY IF EXISTS "company_photos_insert" ON storage.objects;
CREATE POLICY "company_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_photos_select" ON storage.objects;
CREATE POLICY "company_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_photos_delete" ON storage.objects;
CREATE POLICY "company_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

-- PDFS bucket
DROP POLICY IF EXISTS "company_pdfs_insert" ON storage.objects;
CREATE POLICY "company_pdfs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_pdfs_select" ON storage.objects;
CREATE POLICY "company_pdfs_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_pdfs_delete" ON storage.objects;
CREATE POLICY "company_pdfs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pdfs' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

-- LOGOS bucket — INSERT/DELETE only (SELECT is the public policy from
-- 20260522000001, left untouched).
DROP POLICY IF EXISTS "company_logos_insert" ON storage.objects;
CREATE POLICY "company_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_logos_delete" ON storage.objects;
CREATE POLICY "company_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos' AND
    (storage.foldername(name))[1] IN (
      SELECT company_members.company_id::text FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

-- Assertion: no storage.objects policy should still reference the legacy
-- companies.user_id pattern (mirrors the Phase 82 in-migration assertion,
-- extended to the storage schema this time).
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (qual ~ 'companies.*user_id' OR with_check ~ 'companies.*user_id');
  IF remaining > 0 THEN
    RAISE EXCEPTION 'storage.objects RLS rewrite incomplete: % polic(y/ies) still reference companies.user_id', remaining;
  END IF;
END
$$;

COMMIT;
