-- Phase 27: Enable text-only recordings for v1.5 multi-modal capture
-- Removes NOT NULL constraint from recordings.storage_path so text-path
-- recordings can be inserted with a transcript but no audio file.
-- Non-destructive: existing rows already have storage_path values.
ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL;
