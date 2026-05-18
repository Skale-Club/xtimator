-- ============================================================================
-- projects.input_mode — track which capture modality the project uses
-- ============================================================================
-- Phase 31 (Wizard Modality Selection) introduced the audio/text/photos choice
-- step and the createProjectAction inserts `input_mode` accordingly. The column
-- was added to TypeScript types and the action code but the migration was
-- never written, so every project-creation request to production fails with:
--   PGRST204: Could not find the 'input_mode' column of 'projects' in the schema cache
--
-- Nullable for backward compat with pre-Phase-31 projects (where modality was
-- always 'audio' implicit). CHECK constraint enforces the small enum.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS input_mode TEXT NULL
    CHECK (input_mode IS NULL OR input_mode IN ('audio', 'text', 'photos'));
