-- supabase/migrations/20260722000001_phase179_whatsapp_template_body_text.sql
-- Phase 179 Plan 03 (TMPLCOMP-02/03/04/05): adds body_text to
-- whatsapp_notification_templates — the composer's literal body string with
-- {{n}} tokens already in position (Plan 179-01's validateComposerTemplate /
-- buildBodyComponent input). Without this column submitTemplateToMeta had
-- nothing real to validate/submit and sent Meta components: [] (a stub).
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS). NOT applied to
-- remote directly — migrations are applied manually per project convention
-- (see supabase/migrations/20260721000005_...). Apply to prod BEFORE Plan
-- 179-04's UI is used against real data — verify via:
--   select column_name from information_schema.columns
--   where table_name = 'whatsapp_notification_templates' and column_name = 'body_text';

BEGIN;

ALTER TABLE public.whatsapp_notification_templates
  ADD COLUMN IF NOT EXISTS body_text text;

COMMENT ON COLUMN public.whatsapp_notification_templates.body_text IS
  'Composer literal body template with {{n}} tokens already in position (Phase 179). NULL for templates registered manually (403 scope fallback) without ever going through the composer.';

COMMENT ON COLUMN public.whatsapp_notification_templates.variables_schema IS
  'Ordered ComposerParam[] ([{label, example}]) driving body_text {{n}} positions, Meta example.body_text, and the Phase 174 expectedVariableCount guard (Phase 179). Written ONLY as a byproduct of a real Meta submission/resubmission, never edited independently. Default [].';

COMMENT ON COLUMN public.whatsapp_notification_templates.status IS
  'draft|pending|approved|rejected|paused|disabled|flagged|in_appeal|locked|archived|limit_exceeded|deleted (Phase 179 widened Meta event vocabulary). No CHECK constraint — service-role-only writes via mapMetaEventToStatus().';

COMMIT;
