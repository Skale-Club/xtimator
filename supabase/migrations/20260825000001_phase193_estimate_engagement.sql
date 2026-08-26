-- Phase 193 — Estimate engagement observability + optional share password.
--
-- 1. estimate_engagement_events — per-visit telemetry for the PUBLIC share page
--    (opens, clicks with coordinates, scroll depth, section visibility,
--    time-on-page heartbeats, password unlock outcomes).
--
--    It cannot reuse estimate_activity: that table has project_id NOT NULL and
--    is authenticated-only, while these events are produced by anonymous
--    visitors. Same reasoning as tour_events
--    (20260521000001_tour_events.sql) — session-level, not project-scoped.
--
--    Writes go exclusively through the service-role client (the collector at
--    app/api/track/estimate resolves the share token server-side first).
--    Deliberately NO anon policy of any kind: 20260606000002 dropped anon
--    SELECT on estimates precisely because a token-shaped RLS predicate
--    matched every row. Nothing here reopens that class.
--
--    Privacy: no IP address and no raw user agent are persisted. The client IP
--    is used only as an in-memory rate-limit key; device is coarsened to
--    mobile/desktop. Rows are purged after 90 days by the retention job.
--
-- 2. estimates.view_count / last_viewed_at — cheap counters for the header
--    chip, so the workspace never has to aggregate the events table just to
--    show "5 opens". estimates.viewed_at keeps its existing meaning (FIRST
--    view) and is left untouched.
--
-- 3. estimates.share_password_hash / share_password_set_at — optional password
--    lock on a share link. NULL hash = open link (existing behavior for every
--    row today). The hash is scrypt (salt$hash, base64url) computed in the app;
--    the plaintext never reaches the database.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Engagement events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estimate_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Anonymous visitor identity: a localStorage UUID (visitor) and a per-tab
  -- UUID (session). Never an auth.users id — these are prospects, not users.
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'view','click','scroll_depth','section_view','heartbeat','unlock_ok','unlock_fail'
  )),
  -- Section/element identifier for click + section_view (data-track-section).
  target TEXT,
  -- Click position, stored so a heatmap can be re-projected onto the document
  -- at any render width: x as a percentage of document width, y in absolute px
  -- from the document top, alongside the document height at capture time.
  x_pct NUMERIC(5,2) CHECK (x_pct IS NULL OR (x_pct >= 0 AND x_pct <= 100)),
  y_px INTEGER CHECK (y_px IS NULL OR y_px >= 0),
  doc_h INTEGER CHECK (doc_h IS NULL OR doc_h > 0),
  viewport_w INTEGER CHECK (viewport_w IS NULL OR viewport_w > 0),
  device TEXT CHECK (device IS NULL OR device IN ('mobile','desktop')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_engagement_events_estimate
  ON public.estimate_engagement_events(estimate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_engagement_events_company
  ON public.estimate_engagement_events(company_id, created_at DESC);
-- Retention job scans by age across all companies.
CREATE INDEX IF NOT EXISTS idx_estimate_engagement_events_created_at
  ON public.estimate_engagement_events(created_at);

ALTER TABLE public.estimate_engagement_events ENABLE ROW LEVEL SECURITY;

-- Read-only for company members (the workspace dashboard). No INSERT/UPDATE/
-- DELETE policy: every write is service-role, which bypasses RLS.
DROP POLICY IF EXISTS "estimate_engagement_events_select" ON public.estimate_engagement_events;
CREATE POLICY "estimate_engagement_events_select"
  ON public.estimate_engagement_events
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_members.company_id FROM public.company_members
      WHERE company_members.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.estimate_engagement_events IS
  'Phase 193 — anonymous engagement telemetry for public estimate share pages. Service-role writes only; 90-day retention.';

-- ---------------------------------------------------------------------------
-- 2. Estimate counters
-- ---------------------------------------------------------------------------
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.estimates.view_count IS
  'Phase 193 — total share-page opens. estimates.viewed_at remains the FIRST view.';

-- Backfill from the activity log so the feature is not blank on day one.
-- trg_estimates_set_updated_at is suspended for the duration: a historical
-- counter backfill must not make every estimate look edited today (the
-- workspace sorts and displays updated_at).
ALTER TABLE public.estimates DISABLE TRIGGER trg_estimates_set_updated_at;

UPDATE public.estimates e
SET view_count = agg.opens,
    last_viewed_at = GREATEST(agg.last_open, e.viewed_at)
FROM (
  SELECT estimate_id, COUNT(*)::int AS opens, MAX(created_at) AS last_open
  FROM public.estimate_activity
  WHERE event_type = 'estimate_viewed' AND estimate_id IS NOT NULL
  GROUP BY estimate_id
) agg
WHERE e.id = agg.estimate_id;

-- Estimates viewed before the activity log existed still get a sane count.
UPDATE public.estimates
SET view_count = 1, last_viewed_at = viewed_at
WHERE viewed_at IS NOT NULL AND view_count = 0;

ALTER TABLE public.estimates ENABLE TRIGGER trg_estimates_set_updated_at;

-- ---------------------------------------------------------------------------
-- 3. Optional share password
-- ---------------------------------------------------------------------------
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS share_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS share_password_set_at TIMESTAMPTZ;

COMMENT ON COLUMN public.estimates.share_password_hash IS
  'Phase 193 — scrypt hash (salt$hash, base64url) of the share-link password. NULL = open link. Plaintext never stored.';

COMMIT;
