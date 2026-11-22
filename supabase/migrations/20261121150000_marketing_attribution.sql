-- Ads tracking, prepared dormant (2026-11-21).
--
-- 1. companies.acquisition: where the signup came from, captured from the
--    visitor's first-party cookies at onboarding (first and last touch: UTM
--    tags, ad click ids, landing page, referrer), the cookie-consent choice at
--    that moment, and the GA4 / Meta browser ids needed to attribute later
--    server-side conversions. Written once, by the server, for a genuine first
--    company. NULL for companies created before this migration.
--
-- 2. marketing_conversions: one row per conversion the server reported (or
--    chose not to report) to GA4 / Meta. event_id is UNIQUE so retries,
--    webhook redeliveries and repeated "first estimate" checks can never count
--    a conversion twice. Service role only: RLS on, no policies.
--
-- Additive only: no existing column, row or policy changes. Note: writing
-- companies.acquisition does not touch estimates.updated_at (different table).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS acquisition jsonb;

COMMENT ON COLUMN public.companies.acquisition IS
  'Signup attribution (first/last touch, consent at signup, GA4/Meta browser ids). Server-written once at first-company onboarding.';

CREATE TABLE IF NOT EXISTS public.marketing_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN ('sign_up', 'first_estimate', 'purchase')),
  event_id text NOT NULL UNIQUE,
  value numeric(12, 2),
  currency text,
  -- 'sent' | 'disabled' | 'no_consent' | 'no_browser_id' | 'error'
  ga4_status text,
  meta_status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS marketing_conversions_company_idx
  ON public.marketing_conversions (company_id, event_name);

ALTER TABLE public.marketing_conversions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_conversions IS
  'Server-side ad conversions (GA4 Measurement Protocol, Meta Conversions API). Service role only.';
