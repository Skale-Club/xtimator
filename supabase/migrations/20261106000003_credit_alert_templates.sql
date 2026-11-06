-- ============================================================================
-- Credit alert notification templates (SEED-055 Phase E)
--
-- Phase E moved the billing model to credits (lot-based balance, "Buy credits"
-- for Pro and "Subscribe to Pro" for Free/Trial), and rewrote the in-app copy
-- for `quota.80pct` and `quota.exhausted` in lib/notifications/copy.ts. The
-- in-app copy is resolved from `notification_templates` FIRST, and those two
-- rows still hold the Phase-172 "monthly AI quota" wording seeded by
-- 20260721000001_phase172_notification_templates.sql, so users would keep
-- seeing the old text. This migration brings the two rows in line.
--
-- The new bodies interpolate {{creditCta}} ("Buy credits" / "Subscribe to Pro"),
-- which notifyLowCreditBalance passes through copyContext.
--
-- Safe to re-run: each UPDATE only matches a row that STILL holds the old
-- Phase-172 default title AND body, so (a) a second run is a no-op and (b) a
-- row an admin has edited in the template editor is left untouched.
--
-- Single quotes are doubled for SQL ('' inside a string literal).
-- Mirrored verbatim in lib/notifications/template-seed.ts (drift test:
-- tests/unit/notifications/template-seed-completeness.test.ts).
-- Per project convention, applied to prod MANUALLY. NO secrets.
-- ============================================================================

UPDATE public.notification_templates
SET title      = 'You''re out of credits',
    body       = '{{creditCta}} to keep creating estimates.',
    variables  = '["creditCta"]'::jsonb,
    updated_at = now()
WHERE scope = 'tenant'
  AND event_type = 'quota.exhausted'
  AND channel = 'in_app'
  AND title = 'Monthly quota exhausted'
  AND body = 'You have used all included AI credits this month. Upgrade or wait until reset.';

UPDATE public.notification_templates
SET title      = 'You''re running low on credits',
    body       = '{{creditCta}} so you don''t run out in the middle of an estimate.',
    variables  = '["creditCta"]'::jsonb,
    updated_at = now()
WHERE scope = 'tenant'
  AND event_type = 'quota.80pct'
  AND channel = 'in_app'
  AND title = 'Approaching monthly limit'
  AND body = 'You have used {{quotaPercent}}% of your monthly AI quota.';
