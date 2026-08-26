-- Phase 193 — keep engagement counters out of the optimistic-concurrency path.
--
-- 20260825000001 added estimates.view_count / last_viewed_at, which the public
-- beacon collector (app/api/track/estimate) writes on every anonymous share-page
-- open. trg_estimates_set_updated_at had no WHEN clause, so each of those writes
-- restamped estimates.updated_at — and updated_at is NOT cosmetic here:
--
--   * lib/actions/estimate.ts passes it as p_expected_updated_at (compare-and-set
--     on the owner's editor save),
--   * app/api/estimates/[id]/sign/route.ts passes it into sign_estimate_atomic,
--     which re-checks it under a row lock,
--   * lib/pdf/render-estimate-pdf.ts keys its render cache on it.
--
-- Left unfixed, a prospect merely OPENING the estimate would invalidate the
-- owner's in-flight save, spuriously fail the client's own signature attempt,
-- and bust the PDF cache. Engagement telemetry must be invisible to that path.
--
-- Fix 1: the trigger now fires only when something OTHER than the engagement
-- counters changed. The jsonb-difference form is deliberate — it keeps working
-- as columns are added, instead of enumerating a column list that would rot.
--
-- Fix 2: bump_estimate_view_count() replaces the collector's read-then-write
-- increment, which lost updates when two visitors opened the estimate at once.
-- SECURITY DEFINER + REVOKE mirrors the grant hygiene in
-- 20260706000007_rls_hardening_indexes_grants.sql: the service-role client
-- bypasses grants, so no other role needs this RPC exposed via PostgREST.

BEGIN;

DROP TRIGGER IF EXISTS trg_estimates_set_updated_at ON public.estimates;

CREATE TRIGGER trg_estimates_set_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  WHEN (
    (to_jsonb(OLD) - 'view_count' - 'last_viewed_at' - 'updated_at')
    IS DISTINCT FROM
    (to_jsonb(NEW) - 'view_count' - 'last_viewed_at' - 'updated_at')
  )
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION public.bump_estimate_view_count(
  p_estimate_id UUID,
  p_delta INTEGER
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.estimates
  SET view_count = COALESCE(view_count, 0) + GREATEST(COALESCE(p_delta, 0), 0),
      last_viewed_at = NOW()
  WHERE id = p_estimate_id;
$$;

REVOKE ALL ON FUNCTION public.bump_estimate_view_count(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_estimate_view_count(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.bump_estimate_view_count(UUID, INTEGER) FROM authenticated;

COMMENT ON FUNCTION public.bump_estimate_view_count(UUID, INTEGER) IS
  'Phase 193 - atomic share-page view counter increment. Service-role only; deliberately does not touch updated_at (see trg_estimates_set_updated_at WHEN clause).';

COMMIT;
