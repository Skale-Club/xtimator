-- Phase 81: WhatsApp outbound delivery channel
-- Extends estimate_deliveries.channel CHECK to include 'whatsapp' and
-- estimate_deliveries.provider CHECK to include 'meta'.
-- Mirrors the DROP + ADD CONSTRAINT pattern from
-- 20260511000003_phase53_pdf_attachment.sql.
--
-- NOTE: Plan 81-01 prescribed filename 20260526000001_phase81_... but that
-- timestamp collides with existing 20260526000001_phase82_rls_company_members.sql
-- already on this branch. Bumped to 20260526000005 (next free 20260526 slot)
-- per Rule 3 (blocking issue auto-fix). Filename is the only deviation from the
-- plan; SQL body and constraint values are verbatim from the plan.

ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check;

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp'));

ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check;

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_provider_check
  CHECK (provider IN ('resend', 'twilio', 'meta'));
