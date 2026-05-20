-- Estimate Deliveries: Email (Resend) and SMS (Twilio)
-- Platform API keys are stored in platform_integrations (encrypted, service role only).
-- Per-company flags control which channels the business owner can use.

-- 1. Companies: opt-in flags for each channel
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_delivery_enabled   BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. estimate_deliveries: one row per send attempt
CREATE TABLE IF NOT EXISTS estimate_deliveries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id         UUID        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel             TEXT        NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient_email     TEXT,
  recipient_phone     TEXT,
  subject             TEXT,                          -- email only
  provider            TEXT        NOT NULL CHECK (provider IN ('resend', 'twilio')),
  provider_message_id TEXT,                          -- Resend message ID or Twilio SID
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE estimate_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_deliveries_select" ON estimate_deliveries FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "estimate_deliveries_insert" ON estimate_deliveries FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- Status updates are done server-side via service role (webhooks from Resend/Twilio).
-- No authenticated UPDATE policy needed.
