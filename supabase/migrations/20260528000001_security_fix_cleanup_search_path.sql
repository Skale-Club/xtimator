-- Security Review (B03/B04): cleanup_orphan_draft_projects is SECURITY DEFINER
-- but had an empty search_path, leaving it open to schema-prefix / search-path
-- injection. Pin an explicit search_path. Function body is unchanged.
--
-- Rollback: re-create the function without the SET search_path clause.

CREATE OR REPLACE FUNCTION public.cleanup_orphan_draft_projects()
RETURNS TABLE(deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
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
