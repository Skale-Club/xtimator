-- Track whether the WhatsApp welcome message has been delivered to an owner.
-- The welcome now fires on the owner's FIRST inbound WhatsApp message (proof they
-- have WhatsApp), not proactively on phone-link. welcome_sent_at is stamped at that
-- moment. It resets to NULL when owner_phone changes so a new number is welcomed
-- on its first contact.
ALTER TABLE company_whatsapp
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;

COMMENT ON COLUMN company_whatsapp.welcome_sent_at IS
  'Timestamp of the WhatsApp welcome message delivery, set on the owner''s first inbound contact. NULL = not yet welcomed. Reset to NULL when owner_phone changes.';
