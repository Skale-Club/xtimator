-- supabase/migrations/20260717000002_phase167_ai_cost_events_dedup.sql
-- Phase 167 (BILL-04/BILL-05): dedupe existing ai_cost_events duplicate rows
-- for ('audio_minutes', 'estimate') BEFORE adding the unique guard, then add a
-- PARTIAL unique index scoped to those two operation types ONLY.
--
-- WHY PARTIAL (not a full unique index on the whole table): 'vision'/'photo_batch'
-- rows will legitimately share ONE attemptId across multiple per-photo cost rows
-- once Phase 167-02 threads costContext into the vision path (this plan's D4
-- finding — today those rows carry a random attemptId + null company, tracked
-- separately and NOT fixed here). A full unique index on
-- (attempt_id, operation_type) would silently swallow those legitimate
-- per-photo vision rows via the ON CONFLICT-adjacent 23505 path. 'audio_minutes'
-- and 'estimate' are ALWAYS exactly one row per attempt — those are the only
-- two operation types this migration constrains.
--
-- Retry re-pay (D3): the transcribe job previously had no transcript-exists
-- short-circuit, so a generate-stage Retry re-ran Whisper and inserted a
-- SECOND ('audio_minutes', attempt_id) row — a duplicate REAL-COST measurement
-- (the customer's credit debit stayed correct/idempotent via its own RPC key;
-- only the cost LOG was inflated N×). The same duplicate-row class is
-- reachable for 'estimate' via generateEstimateJob's own step-replay edge
-- cases. Deduping (keeping the EARLIEST row — the first real attempt) before
-- creating the index makes future duplicates structurally impossible instead
-- of merely reducing their odds.
--
-- Idempotent: safe to re-run. NOT applied to remote directly — deploy is
-- CI->GHCR->Coolify (consistent with phases 106/108/110), the pipeline owns
-- applying it.

-- 1) Dedupe: for each (attempt_id, operation_type) pair restricted to the two
--    types this migration constrains, keep only the EARLIEST row (by
--    created_at, tie-broken by id for determinism) and delete the rest.
DELETE FROM public.ai_cost_events a
USING public.ai_cost_events b
WHERE a.attempt_id = b.attempt_id
  AND a.operation_type = b.operation_type
  AND a.operation_type IN ('audio_minutes', 'estimate')
  AND (a.created_at, a.id) > (b.created_at, b.id);

-- 2) PARTIAL unique index — vision/photo_batch rows stay unconstrained (see
--    rationale above). Created AFTER the dedupe so it never fails to apply
--    against pre-existing violators. Idempotent create.
CREATE UNIQUE INDEX IF NOT EXISTS ai_cost_events_attempt_op_unique
  ON public.ai_cost_events (attempt_id, operation_type)
  WHERE operation_type IN ('audio_minutes', 'estimate');

COMMENT ON INDEX public.ai_cost_events_attempt_op_unique IS
  'Phase 167 (BILL-04): at-most-one cost row per (attempt_id, operation_type) for audio_minutes/estimate ONLY — vision/photo_batch stay unconstrained for the 167-02 per-photo cost rollup. recordAICost swallows the resulting 23505 as success.';
