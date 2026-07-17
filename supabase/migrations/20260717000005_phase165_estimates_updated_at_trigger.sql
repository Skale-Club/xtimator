-- Phase 165 Plan 01 (SAVE-02, audit finding B3): estimates.updated_at is
-- currently only bumped by application code that explicitly sets it in an
-- UPDATE payload. createBlankEstimate's supersede flip
-- (`UPDATE estimates SET is_current = false`, lib/actions/estimate.ts) does
-- NOT set updated_at, so a stale open tab holding the just-superseded
-- version still passes the client's optimistic-concurrency
-- `.eq('updated_at', expectedUpdatedAt)` check and can silently write to an
-- orphaned old version with zero feedback.
--
-- A BEFORE UPDATE trigger makes updated_at authoritative at the DATABASE
-- layer for every update path (supersede flip, save_estimate_atomic's header
-- UPDATE, savePresentationSettings, markAsSentAction, etc.) — the trigger
-- fires AFTER save_estimate_atomic's row lock (step 1, SELECT ... FOR UPDATE)
-- reads the pre-update snapshot, so the compare-and-set in that function
-- reads the OLD value and the trigger advances it on the SAME statement's
-- write, closing the version-authority gap.
--
-- Application code that still explicitly sets updated_at in its own UPDATE
-- payload is harmless (the trigger's NEW.updated_at = now() always wins,
-- executed after any column assignment in the same UPDATE) but Phase 165
-- Plan 01 Task 3 removes those explicit assignments from saveEstimate since
-- the trigger now owns the column.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimates_set_updated_at ON public.estimates;

CREATE TRIGGER trg_estimates_set_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON FUNCTION public.set_updated_at IS
  'Phase 165 (SAVE-02): stamps NEW.updated_at = now() on every UPDATE to a row using this trigger. Makes estimates.updated_at a reliable version token independent of application code remembering to set it.';
