-- Add owner_phone to company_whatsapp for platform-managed inbound routing.
-- The platform has ONE WhatsApp Business number (Xtimator's).
-- When an owner sends a message to that number, we route by their sender phone
-- to identify the company. owner_phone stores that E.164 number.

ALTER TABLE company_whatsapp
  ADD COLUMN IF NOT EXISTS owner_phone TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Unique index so one phone can only belong to one company.
CREATE UNIQUE INDEX IF NOT EXISTS company_whatsapp_owner_phone_unique
  ON company_whatsapp (owner_phone)
  WHERE owner_phone IS NOT NULL;
