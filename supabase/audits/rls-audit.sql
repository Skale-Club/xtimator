-- RLS Posture Audit — Xtimator
--
-- Returns one row per table in public/storage schemas, classifying RLS posture
-- as OK / WARN / FAIL.
--
-- Run via:
--   psql "$PROD_DB_URL" -f supabase/audits/rls-audit.sql
--
-- Alternative:
--   Paste into Supabase Dashboard SQL Editor.
--
-- Pass criterion:
--   Zero rows where posture LIKE 'FAIL%'.
--
-- Snapshot the output to:
--   .planning/phases/61-production-database-foundation/61-prod-rls-snapshot.txt

WITH table_rls AS (
  SELECT
    n.nspname  AS schemaname,
    c.relname  AS tablename,
    c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname IN ('public', 'storage')
    AND c.relname NOT LIKE 'pg_%'
),
policy_counts AS (
  SELECT
    schemaname,
    tablename,
    COUNT(*) AS policy_count
  FROM pg_policies
  GROUP BY schemaname, tablename
)
SELECT
  t.schemaname,
  t.tablename,
  t.rls_enabled,
  COALESCE(p.policy_count, 0) AS policy_count,
  CASE
    WHEN NOT t.rls_enabled
      THEN 'FAIL — RLS DISABLED'
    WHEN t.tablename IN (
      'platform_integrations',
      'platform_branding',
      'usage_events',
      'company_whatsapp',
      'whatsapp_sessions',
      'whatsapp_processed_messages',
      'processed_stripe_events'
    ) AND COALESCE(p.policy_count, 0) > 0
      THEN 'WARN — DENY-ALL TABLE HAS POLICIES'
    WHEN t.schemaname = 'public'
     AND t.tablename NOT IN (
       'platform_integrations',
       'platform_branding',
       'usage_events',
       'company_whatsapp',
       'whatsapp_sessions',
       'whatsapp_processed_messages',
       'processed_stripe_events'
     )
     AND COALESCE(p.policy_count, 0) = 0
      THEN 'FAIL — TENANT TABLE HAS NO POLICIES'
    ELSE 'OK'
  END AS posture
FROM table_rls t
LEFT JOIN policy_counts p
  ON p.schemaname = t.schemaname
 AND p.tablename  = t.tablename
ORDER BY t.schemaname, t.tablename;
