-- Phase 93: read-only attempt-grouped view over pipeline_events.
-- security_invoker=on → pipeline_events super-admin SELECT RLS is enforced through the view.
-- No new table, no writes. Applied via scripts/apply-migration-93-00.mjs (db push blocked by remote drift).

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
  -- terminal status precedence: failed > started > succeeded
  CASE
    WHEN BOOL_OR(pe.status = 'failed')    THEN 'failed'
    WHEN BOOL_OR(pe.status = 'started')   THEN 'started'
    ELSE 'succeeded'
  END                                                  AS terminal_status,
  SUM(COALESCE(pe.duration_ms, 0))                     AS total_duration_ms,
  MAX(pe.retry_count) > 0                              AS has_retry,
  MAX(pe.retry_count)                                  AS max_retry_count,
  COUNT(*)                                             AS event_count
FROM public.pipeline_events pe
GROUP BY pe.attempt_id;

COMMENT ON VIEW public.pipeline_attempts IS
  'Phase 93: attempt-grouped read-only view over pipeline_events. security_invoker=on; no writes.';
