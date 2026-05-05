-- Phase 18: Orphan-draft cleanup cron (D-03)
--
-- Removes draft projects with no recordings and no estimates older than 24 hours.
-- Optimized for the eager-create flow introduced in plan 18-01: every "New Project"
-- click writes a row before the user records anything. If they bail before recording,
-- the row would otherwise live forever.

CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.cleanup_orphan_draft_projects()
RETURNS TABLE(deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  WITH targets AS (
    SELECT p.id
    FROM projects p
    WHERE p.status = 'draft'
      AND p.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (SELECT 1 FROM recordings r WHERE r.project_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM estimates e  WHERE e.project_id = p.id)
  ),
  deleted_rows AS (
    DELETE FROM projects WHERE id IN (SELECT id FROM targets) RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO deleted FROM deleted_rows;

  deleted_count := deleted;
  RETURN NEXT;
END;
$$;

-- Schedule: every day at 03:00 UTC. Use SELECT WHERE NOT EXISTS so re-running the migration
-- does not throw on the unique cron.job.jobname constraint.
-- Rollback: SELECT cron.unschedule('cleanup-orphan-draft-projects'); DROP FUNCTION public.cleanup_orphan_draft_projects();
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-orphan-draft-projects') THEN
    PERFORM cron.schedule(
      'cleanup-orphan-draft-projects',
      '0 3 * * *',
      $cron$ SELECT public.cleanup_orphan_draft_projects(); $cron$
    );
  END IF;
END
$do$;
