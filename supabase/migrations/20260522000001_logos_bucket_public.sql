-- Make the `logos` bucket public so that:
--   1. The estimate PDF generator (react-pdf, server-side, no cookies) can fetch
--      company.logo_url to embed the image.
--   2. The share view (anonymous client opening the share link, no session) can
--      render <img src={company.logo_url}>.
--   3. The topbar/sidebar (authenticated browser, but <img> requests don't carry
--      Supabase auth cookies) can render the logo.
--
-- Security note: company logos are content that already ships in every
-- estimate sent to a client. They are not sensitive. The `photos` and `pdfs`
-- buckets remain private — they contain customer job-site photos and the
-- generated estimate PDFs which DO contain pricing/business data.

UPDATE storage.buckets
SET public = true
WHERE id = 'logos';

-- Existing "company_logos_select" policy restricted reads to authenticated
-- members of the owning company. With the bucket now public, we need an
-- unrestricted SELECT policy so anon/public requests succeed. Drop the old
-- one and replace with a public-read policy.
DROP POLICY IF EXISTS "company_logos_select" ON storage.objects;

CREATE POLICY "logos_public_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

-- INSERT / DELETE policies are unchanged — only authenticated users who own
-- the company can upload/remove their own logo. The bucket being public
-- affects only read access.
