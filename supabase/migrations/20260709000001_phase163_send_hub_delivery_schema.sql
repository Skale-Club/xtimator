-- Phase 163 (SENDHUB-03): widen estimate_deliveries for the format-first Send hub.
--
-- Three coordinated widenings, all dormant-first:
--   1. NEW nullable `format` column       -- which format the owner sent (independent of transport channel)
--   2. WIDEN channel CHECK               -- add copy | open | download | manual alongside email | sms | whatsapp
--   3. WIDEN provider CHECK              -- add 'client' for non-network actions (copy/open/download/manual)
--
-- Contracts:
--   - Existing rows keep working:      pre-Phase-163 rows have format = NULL  ->  read as legacy/unknown.
--   - No data-migration script.        The dormant-first pattern (Phase 129 / 161 precedent) means the
--                                      column is added; the CHECK is widened; no backfill.
--   - Permanent-nullable format.       The CHECK explicitly accepts NULL. Do NOT tighten the column
--                                      to non-nullable later -- pre-Phase-163 rows would violate. If a
--                                      future phase needs to distinguish "unknown" from "explicit
--                                      online_link", treat NULL semantically as "unknown", never as an
--                                      implicit online_link.
--
-- CHECK-widening pattern mirrors 20260526000005_phase81_whatsapp_delivery_channel.sql exactly:
-- DROP CONSTRAINT IF EXISTS ...; ADD CONSTRAINT ... CHECK (...);

-- 1. NEW column: which FORMAT the owner sent (independent of transport channel).
ALTER TABLE estimate_deliveries
  ADD COLUMN IF NOT EXISTS format TEXT
  CHECK (format IN ('online_link', 'pdf', 'plain_text') OR format IS NULL);

COMMENT ON COLUMN estimate_deliveries.format IS
  'Phase 163 (SENDHUB-03). Send-hub format choice: online_link | pdf | plain_text. NULL = legacy/pre-Phase-163 row (dormant-first, permanent-nullable).';

-- 2. WIDEN channel enum: add copy | open | download | manual alongside email | sms | whatsapp.
ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check;
ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'copy', 'open', 'download', 'manual'));

-- 3. WIDEN provider enum: add 'client' for copy/open/download/manual actions
--    that don't go through a network provider. Sentinel value (not NULL) so the
--    provider NOT NULL constraint from the base migration stays honoured -- no
--    schema DDL beyond the CHECK swap.
ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check;
ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_provider_check
  CHECK (provider IN ('resend', 'twilio', 'meta', 'client'));
