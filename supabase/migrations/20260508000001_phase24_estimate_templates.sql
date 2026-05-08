-- Phase 24: Estimate Template Engine + Settings Page
-- Adds 4 nullable TEXT columns to companies for per-company plain-text estimate templates.
-- NULL = use app default (resolved at render time in lib/utils/estimate-template.ts, not here).
-- D-01: No DEFAULT clause on any column — NULL is the intended initial state for all companies.
-- D-05: No backfill needed; existing companies stay NULL and get defaults at render time.

ALTER TABLE companies
  ADD COLUMN estimate_template_greeting  TEXT,
  ADD COLUMN estimate_template_opener    TEXT,
  ADD COLUMN estimate_template_closer    TEXT,
  ADD COLUMN estimate_template_signature TEXT;

COMMENT ON COLUMN companies.estimate_template_greeting IS
  'Plain-text estimate greeting line. NULL = use app default.';
COMMENT ON COLUMN companies.estimate_template_opener IS
  'Plain-text estimate opening paragraph. NULL = use app default.';
COMMENT ON COLUMN companies.estimate_template_closer IS
  'Plain-text estimate closing paragraph. NULL = use app default.';
COMMENT ON COLUMN companies.estimate_template_signature IS
  'Plain-text estimate signature block. NULL = use app default.';
