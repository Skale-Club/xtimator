-- Estimate analytics overhaul (2026-11-20) — client action events.
--
-- The public share page now reports four more things a client can do, so the
-- owner's per-estimate analytics can show them in the timeline:
--   pdf_download   the client downloaded / opened the PDF
--   print          the client printed the page (beforeprint)
--   sign_start     the client opened the signature / accept flow
--   contact_click  the client tapped the company phone, email or website
--                  (target = 'phone' | 'email' | 'website')
--
-- estimate_engagement_events.event_type carries an inline column CHECK from
-- 20260825000001_phase193_estimate_engagement.sql, which Postgres auto-named
-- estimate_engagement_events_event_type_check. Replace it with one that
-- allows exactly lib/estimate/analytics/contracts.ts ENGAGEMENT_EVENT_TYPES.
-- Existing rows all satisfy the wider list, so the ADD validates cleanly.
--
-- Idempotent: DROP ... IF EXISTS, then ADD. Safe to re-run.
-- Apply by hand on BOTH databases (Supabase dev and Coolify production)
-- before pushing the code that emits the new types.

BEGIN;

ALTER TABLE public.estimate_engagement_events
  DROP CONSTRAINT IF EXISTS estimate_engagement_events_event_type_check;

ALTER TABLE public.estimate_engagement_events
  ADD CONSTRAINT estimate_engagement_events_event_type_check
  CHECK (event_type IN (
    'view','click','scroll_depth','section_view','heartbeat','unlock_ok','unlock_fail',
    'pdf_download','print','sign_start','contact_click'
  ));

COMMIT;
