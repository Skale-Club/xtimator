-- supabase/migrations/20260624000003_phase110_ai_cost_events.sql
-- Phase 110: Real Cost Capture Foundation (COST-03) — Measure-Only Mode (CALIB-01).
-- Append-only, one row per AI operation cost. Service-role writes only.
-- Deny-all client RLS (model: pipeline_events / usage_events). Super-admin SELECT only.
-- TEXT + CHECK for the enum-like columns (project avoids Postgres enums — mirrors pipeline_events).
-- MEASURE-ONLY: this table stores the REAL USD cost of each AI call. It carries NO
--   credit/debit/ledger/balance/markup column — nothing here can charge a tenant.
--   The credit ledger (Phase 112) is a SEPARATE table that reads these rows; debiting
--   does not begin until calibration (Phase 116) derives the numbers.
-- null vs 0 discipline: real_cost_usd is NULLABLE. NULL = the provider returned no cost
--   (e.g. Gemini, or an unknown Whisper rate). It is NEVER coerced to 0, so calibration
--   can exclude unknowns from the mean instead of biasing it toward zero.
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS. NOT applied to remote — deploy is
--   CI->GHCR->Coolify (consistent with phases 106/108); the pipeline owns applying it.

CREATE TABLE IF NOT EXISTS public.ai_cost_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id     UUID NOT NULL,
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id     UUID,            -- not FK-constrained: cost rows survive project deletion for forensics
  estimate_id    UUID,            -- nullable: most cost is incurred before an estimate row exists
  operation_type TEXT NOT NULL
    CHECK (operation_type IN ('estimate', 'photo_batch', 'audio_minutes', 'price_research', 'translation', 'vision')),
  provider       TEXT NOT NULL
    CHECK (provider IN ('openrouter', 'openai', 'anthropic', 'gemini')),
  model          TEXT,            -- nullable: best-effort provider model id
  real_cost_usd  NUMERIC(12,6),   -- nullable: NULL = provider returned no cost (Gemini / whisper-unknown). NEVER 0.
  units          NUMERIC(12,2),   -- optional context: photo count / audio minutes
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deny-all for anon/authenticated; service role bypasses RLS for writes.
ALTER TABLE public.ai_cost_events ENABLE ROW LEVEL SECURITY;

-- Super-admins only (no client INSERT/UPDATE/DELETE policies — service role bypasses RLS).
CREATE POLICY "ai_cost_events_select_super_admin"
  ON public.ai_cost_events
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())));

-- Per-attempt correlation (COST-03), operation-type cost rollups, and per-company aggregation.
CREATE INDEX IF NOT EXISTS ai_cost_events_attempt_id ON public.ai_cost_events(attempt_id);
CREATE INDEX IF NOT EXISTS ai_cost_events_op_created ON public.ai_cost_events(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_cost_events_company    ON public.ai_cost_events(company_id, created_at DESC);

COMMENT ON TABLE public.ai_cost_events IS
  'Append-only per-AI-operation real-cost log. Service-role writes only; super-admin read only. Phase 110 — measure-only (no charging columns).';
