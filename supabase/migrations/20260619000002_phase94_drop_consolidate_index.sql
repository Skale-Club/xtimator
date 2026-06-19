-- Phase 94 (INVOICE-01 / D-03): retire the single-draft lock so estimates are always editable.
-- The unique index enforced "one active draft per project" — it blocks the always-editable model.
-- workflow_status / consolidated_* columns are intentionally LEFT DORMANT (still NOT NULL DEFAULT 'draft')
-- so the WhatsApp send flow, MCP read tool, and generate-estimate service keep compiling.
DROP INDEX IF EXISTS one_active_draft_per_project;
