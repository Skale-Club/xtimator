-- supabase/migrations/20260529000001_phase92_pipeline_events.sql
-- Phase 92: Pipeline Event Persistence (EVENT-01)
-- Append-only, one row per step execution. Service-role writes only.
-- Deny-all client RLS (model: usage_events / processed_stripe_events).
-- Super-admin SELECT for Phase 93 (model: platform_admins predicate).
-- TEXT + CHECK for the enum-like columns (project avoids Postgres enums — STATE.md D-07/D-08).
-- No updated_at: append-only rows are never updated (D-01), so it would always equal created_at.
-- Applied via: bunx supabase db push --db-url $DATABASE_URL

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    UUID NOT NULL,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id    UUID,            -- not FK-constrained: events must survive project deletion for forensics
  estimate_id   UUID,            -- nullable: most steps run before an estimate row exists
  user_id       UUID,            -- nullable: derived best-effort; never block an event on a missing user
  input_type    TEXT NOT NULL
    CHECK (input_type IN ('recording', 'photo', 'manual_text')),
  step          TEXT NOT NULL
    CHECK (step IN ('save_recording', 'transcribe', 'analyze', 'generate_estimate', 'preview_redirect')),
  status        TEXT NOT NULL
    CHECK (status IN ('started', 'succeeded', 'failed')),
  error_message TEXT,
  error_code    TEXT,
  provider      TEXT
    CHECK (provider IS NULL OR provider IN ('openai', 'openrouter', 'anthropic')),
  duration_ms   INTEGER,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deny-all for anon/authenticated; service role bypasses RLS for writes.
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

-- Phase 93 read contract: super-admins only (no client INSERT/UPDATE/DELETE policies).
CREATE POLICY "pipeline_events_select_super_admin"
  ON public.pipeline_events
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())));

-- Phase 93 per-attempt timeline (ordered SELECT) + admin filters.
CREATE INDEX pipeline_events_attempt_id      ON public.pipeline_events(attempt_id);
CREATE INDEX pipeline_events_company_created ON public.pipeline_events(company_id, created_at DESC);
CREATE INDEX pipeline_events_created_at      ON public.pipeline_events(created_at DESC);
CREATE INDEX pipeline_events_status          ON public.pipeline_events(status);

COMMENT ON TABLE public.pipeline_events IS
  'Append-only per-step pipeline event log. Service-role writes only; super-admin read only. Phase 92.';
