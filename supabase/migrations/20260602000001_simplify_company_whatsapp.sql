-- Simplify company_whatsapp: move to platform-managed model.
-- Drops per-company Meta credentials; delivery_format + id + company_id + created_at are kept.
-- send-estimate.ts still reads delivery_format via service client.

ALTER TABLE company_whatsapp
  DROP COLUMN IF EXISTS phone_number,
  DROP COLUMN IF EXISTS phone_number_id,
  DROP COLUMN IF EXISTS waba_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verification_code,
  DROP COLUMN IF EXISTS verification_attempts,
  DROP COLUMN IF EXISTS verification_expires_at;
