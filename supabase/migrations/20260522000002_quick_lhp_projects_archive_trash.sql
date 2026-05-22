-- Quick task 260522-lhp — Projects two-stage trash + archive (QUICK-LHP-DB-01).
--
-- Adds two nullable timestamps to `projects`:
--   archived_at — set when user archives; cleared when unarchived. UI hides these from default Active view.
--   deleted_at  — set when user soft-deletes; cleared when restored. Inngest cleanup-trash hard-deletes after 30 days.
--
-- Note on D-08 ("Hard-delete only"): D-08 is overridden for projects only, per user feedback
-- memory (two-stage trash pattern). recordings/photos/estimates remain hard-delete (cascaded
-- by ON DELETE CASCADE from projects).
--
-- RLS: no policy changes needed. Existing projects_select/insert/update/delete policies are
-- company-scoped via (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())) and
-- already cover UPDATE (archive/unarchive/soft-delete/restore = UPDATE) and DELETE
-- (hard-delete = DELETE). Default view filtering (deleted_at IS NULL etc.) is enforced
-- at the application layer in lib/queries/project.ts — RLS still guards row visibility.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ NULL;

-- Partial indexes optimize the three list views. Each tab queries a disjoint subset of rows;
-- partial indexes keep them small (only matching rows are indexed) and selective.
-- "Active":   archived_at IS NULL AND deleted_at IS NULL
-- "Archived": archived_at IS NOT NULL AND deleted_at IS NULL
-- "Trash":    deleted_at IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_projects_active_by_company
  ON projects (company_id, created_at DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_trash_deleted_at
  ON projects (deleted_at)
  WHERE deleted_at IS NOT NULL;
