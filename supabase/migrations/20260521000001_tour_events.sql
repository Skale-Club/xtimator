-- Migration: add tour_events table for activation-funnel telemetry.
-- Tour events are session-level, not project-scoped, so they cannot reuse
-- estimate_activity (which has project_id NOT NULL).
-- Mirrors estimate_activity shape minus project_id, adds user_id.

CREATE TABLE tour_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('tour_started','tour_step_completed','tour_finished','tour_skipped')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tour_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_events_company_access" ON tour_events
  FOR ALL TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
