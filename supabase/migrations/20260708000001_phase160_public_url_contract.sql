-- Phase 160 (PUBURL-01/03): friendly-URL contract, dormant-first. Mirrors
-- 20260627000001_phase129_advanced_pricing_schema.sql's idiom and
-- 20260706000007_rls_hardening_indexes_grants.sql's partial-unique-index
-- pattern for estimates.share_token.
--
-- Authored-only -- carried by CI->GHCR->Coolify; NOT applied on the VPS
-- (never `supabase db push` from a dev machine). Idempotent (ADD COLUMN IF
-- NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS).
--
-- SECURITY (PUBURL-03): pure DDL -- NO anon grants, NO policy changes of any
-- kind. This table already shipped and reverted one anon-RLS PII leak
-- (20260606000002_drop_estimates_anon_select_policy.sql) -- this migration
-- must never reintroduce that bug class. The friendly-URL lookup
-- (getEstimateByPublicToken, lib/queries/share.ts, Plan 160-02) uses the
-- SAME service-role + exact-match posture as the existing share_token lookup.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug
  ON public.companies(slug) WHERE slug IS NOT NULL;

COMMENT ON COLUMN companies.slug IS
  'Cosmetic path segment for the friendly estimate URL (PUBURL-01). NULL until backfilled by scripts/backfill-public-urls.ts. Never part of the authorization check -- public_slug_token is the sole secret.';

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS public_slug_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_public_slug_token
  ON public.estimates(public_slug_token) WHERE public_slug_token IS NOT NULL;

COMMENT ON COLUMN estimates.public_slug_token IS
  'Second, independent bearer-credential-grade token (PUBURL-01/03) backing the friendly /estimate/{companySlug}/{estimateSlug}-{token} URL. Own partial unique index, separate from share_token -- never truncated/reused from it. NULL until backfilled. Same exact-match, service-role-only lookup discipline as share_token -- see 20260606000002_drop_estimates_anon_select_policy.sql.';
