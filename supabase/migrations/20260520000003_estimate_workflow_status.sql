-- SEED-028 Phase A: Estimate workflow status (draft -> consolidated)
--
-- An estimate is editable while in `draft`, and locks to read-only on `consolidated`.
-- Send/PDF/share endpoints will require workflow_status = 'consolidated'.
-- A new version (v2, v3, ...) is created by forking from a consolidated estimate
-- into a fresh draft.

ALTER TABLE estimates
  ADD COLUMN workflow_status text NOT NULL DEFAULT 'draft'
    CHECK (workflow_status IN ('draft', 'consolidated')),
  ADD COLUMN consolidated_at timestamptz,
  ADD COLUMN consolidated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: estimates that were already sent are treated as consolidated.
-- Anything else stays as draft (the column default).
UPDATE estimates
SET
  workflow_status = 'consolidated',
  consolidated_at = COALESCE(sent_at, updated_at)
WHERE sent_at IS NOT NULL;

-- At most one active (is_current = true) draft per project.
-- A project may still have any number of consolidated versions and at most one
-- current consolidated. The active draft is what the editor opens.
CREATE UNIQUE INDEX one_active_draft_per_project
  ON estimates (project_id)
  WHERE workflow_status = 'draft' AND is_current = true;

COMMENT ON COLUMN estimates.workflow_status IS
  'Workflow state: draft (editable, not sendable) or consolidated (read-only, sendable).';
COMMENT ON COLUMN estimates.consolidated_at IS
  'Timestamp when the estimate was consolidated (locked).';
COMMENT ON COLUMN estimates.consolidated_by IS
  'User who consolidated this estimate.';
