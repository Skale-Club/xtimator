-- Preserve the v2 attempt summary and append the error fields used by admin search.
-- The aggregation keeps older errors searchable after another step is recorded.
CREATE OR REPLACE VIEW public.pipeline_attempts
WITH (security_invoker = on) AS
SELECT
  pe.attempt_id,
  MIN(pe.created_at)                                   AS first_at,
  MAX(pe.created_at)                                   AS last_at,
  MAX(pe.user_id::text)::uuid                          AS user_id,
  MAX(pe.company_id::text)::uuid                       AS company_id,
  MAX(pe.project_id::text)::uuid                       AS project_id,
  MAX(pe.estimate_id::text)::uuid                      AS estimate_id,
  MAX(pe.input_type)                                   AS input_type,
  (ARRAY_AGG(pe.step ORDER BY pe.created_at DESC))[1]  AS step_reached,
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
  COUNT(*)                                             AS event_count,
  STRING_AGG(DISTINCT pe.error_message, E'\n' ORDER BY pe.error_message) AS error_message,
  STRING_AGG(DISTINCT pe.error_code, E'\n' ORDER BY pe.error_code) AS error_code
FROM public.pipeline_events pe
GROUP BY pe.attempt_id;

COMMENT ON VIEW public.pipeline_attempts IS
  'Read-only attempt summary with v2 status and searchable errors. security_invoker=on preserves pipeline_events RLS.';

NOTIFY pgrst, 'reload schema';
