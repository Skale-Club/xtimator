-- supabase/migrations/20261121120000_estimate_updated_at_content_only.sql
-- estimates.updated_at is the estimate's CONTENT version, not a "row touched"
-- stamp. It drives three things:
--
--   * lib/actions/estimate.ts passes it as p_expected_updated_at (compare-and-set
--     on the owner's editor save),
--   * app/api/estimates/[id]/sign/route.ts requires the client's rendered value
--     (contentVersion) and sign_estimate_atomic re-checks it under a row lock,
--   * lib/pdf/render-estimate-pdf.ts keys its render cache on it.
--
-- 20260825000002 already kept the engagement counters (view_count,
-- last_viewed_at) out of it, but more non-content writes still restamped it:
--
--   * viewed_at — logEstimateView (app/estimate/[token]/actions.ts) stamps it on
--     the client's FIRST open, AFTER the page has read updated_at. The client's
--     first signature attempt then carried a stale contentVersion and got a
--     spurious 409 estimate_updated ("This estimate was just updated"). It also
--     raised a false "changed elsewhere" in an owner editor open at that moment.
--   * sent_at, share_expires_at — the send routes and markAsSentAction.
--   * share_password_hash, share_password_set_at — setEstimateSharePassword
--     from the Share sheet.
--
-- None of these change what the client reads or signs (none is rendered by the
-- web document, the paginated preview or either PDF template), so they no
-- longer count as a content change. change_orders already excludes viewed_at
-- (20261117000001).
--
-- Only the trigger's WHEN clause changes; set_updated_at() is shared by other
-- tables and is not redefined. No data changes. Idempotent.
-- Apply by hand to BOTH databases (Supabase dev and Coolify production) BEFORE
-- the deploy that depends on it; the deploy never runs migrations.

DROP TRIGGER IF EXISTS trg_estimates_set_updated_at ON public.estimates;

CREATE TRIGGER trg_estimates_set_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  WHEN (
    (to_jsonb(OLD) - 'view_count' - 'last_viewed_at' - 'viewed_at' - 'sent_at'
      - 'share_expires_at' - 'share_password_hash' - 'share_password_set_at'
      - 'updated_at')
    IS DISTINCT FROM
    (to_jsonb(NEW) - 'view_count' - 'last_viewed_at' - 'viewed_at' - 'sent_at'
      - 'share_expires_at' - 'share_password_hash' - 'share_password_set_at'
      - 'updated_at')
  )
  EXECUTE FUNCTION public.set_updated_at();
