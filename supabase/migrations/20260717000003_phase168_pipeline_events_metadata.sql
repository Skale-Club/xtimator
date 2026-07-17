-- supabase/migrations/20260717000003_phase168_pipeline_events_metadata.sql
-- Phase 168 (PHOTO-02/03): pipeline_events gains an additive `metadata` JSONB
-- column so the analyze-photos job can attach {analyzedCount, totalCount,
-- failedCount} to its terminal `succeeded` event — the "N of M photos
-- analyzed" UI (168-02) reads this back off the journal via poll-outcome.
-- Nullable, no default: every pre-existing row and every OTHER
-- instrumentation call site (recordPipelineEvent's other callers) is
-- unaffected — metadata is opt-in per call site.
--
-- Idempotent: safe to re-run. NOT applied to remote directly — deploy is
-- CI->GHCR->Coolify (consistent with phases 106/108/110/167), the pipeline
-- owns applying it.

ALTER TABLE public.pipeline_events
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.pipeline_events.metadata IS
  'Phase 168 (PHOTO-02/03): optional structured counts/context (e.g. {analyzedCount, totalCount, failedCount} recorded on analyze''s terminal succeeded event). Additive/nullable — absent on all pre-Phase-168 rows and on any call site that does not pass it.';
