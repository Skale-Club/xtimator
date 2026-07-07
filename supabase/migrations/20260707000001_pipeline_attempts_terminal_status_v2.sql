-- 260707-hhp (P2): pipeline_attempts terminal_status v2 — latest-event semantics.
-- Applied manually via Supabase MCP apply_migration (db push blocked by remote
-- drift) — see 260707-hhp SUMMARY.
--
-- Bug fixed: the v1 view (20260530000001_phase93_pipeline_attempts_view.sql)
-- computed terminal_status with precedence failed > started > succeeded. Any
-- attempt containing a 'started' row — i.e. every multi-event attempt,
-- including fully completed generations (save_recording succeeded, transcribe
-- succeeded, generate_estimate succeeded all leave no 'started' rows EXCEPT
-- the started rows recorded at each step's entry) — reported 'started'
-- forever. Confirmed against production data.
--
-- v2 semantics (matches lib/inngest/functions/pipeline-watchdog.ts's
-- classifyLastEvent): the LATEST event by created_at decides the outcome —
--   - any row failed                                        → 'failed'
--   - latest row succeeded on generate_estimate/preview_redirect → 'succeeded'
--   - otherwise                                              → 'started'
--
-- Every other column is IDENTICAL to v1: same SELECT list order, same
-- security_invoker = on, same GROUP BY.

CREATE OR REPLACE VIEW public.pipeline_attempts
WITH (security_invoker = on) AS
SELECT
  pe.attempt_id,
  MIN(pe.created_at)                                   AS first_at,
  MAX(pe.created_at)                                   AS last_at,
  -- lineage: take the non-null value seen on any row for the attempt
  MAX(pe.user_id::text)::uuid                          AS user_id,
  MAX(pe.company_id::text)::uuid                       AS company_id,
  MAX(pe.project_id::text)::uuid                       AS project_id,
  MAX(pe.estimate_id::text)::uuid                      AS estimate_id,
  MAX(pe.input_type)                                   AS input_type,
  -- step reached = step of the latest row by created_at
  (ARRAY_AGG(pe.step ORDER BY pe.created_at DESC))[1]  AS step_reached,
  -- terminal status v2: latest-event semantics (see header comment)
  CASE
    WHEN BOOL_OR(pe.status = 'failed') THEN 'failed'
    WHEN (ARRAY_AGG(pe.status ORDER BY pe.created_at DESC))[1] = 'succeeded'
     AND (ARRAY_AGG(pe.step  ORDER BY pe.created_at DESC))[1] IN ('generate_estimate', 'preview_redirect')
      THEN 'succeeded'
    ELSE 'started'
  END                                                  AS terminal_status,
  SUM(COALESCE(pe.duration_ms, 0))                     AS total_duration_ms,
  MAX(pe.retry_count) > 0                              AS has_retry,
  MAX(pe.retry_count)                                  AS max_retry_count,
  COUNT(*)                                             AS event_count
FROM public.pipeline_events pe
GROUP BY pe.attempt_id;

COMMENT ON VIEW public.pipeline_attempts IS
  '260707-hhp v2 (2026-07-07): attempt-grouped read-only view over pipeline_events. terminal_status uses latest-event semantics (matches classifyLastEvent) instead of v1''s failed > started > succeeded precedence. security_invoker=on; no writes.';
