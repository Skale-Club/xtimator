-- Phase 40: WhatsApp Webhook Infrastructure
-- Applied via: bunx supabase db push --db-url {DATABASE_URL}

-- 1. company_whatsapp: links a phone number to a company
CREATE TABLE IF NOT EXISTS company_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,        -- E.164 format: +15551234567
  phone_number_id TEXT NOT NULL,            -- Meta Phone Number ID
  waba_id TEXT NOT NULL,                    -- Meta WABA ID
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'active', 'suspended')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_whatsapp ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- 2. whatsapp_sessions: multi-turn conversation state
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'awaiting_input'
    CHECK (state IN ('awaiting_input', 'awaiting_confirm', 'awaiting_edit')),
  draft_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  draft_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- 3. whatsapp_processed_messages: deduplication store
CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
  message_id TEXT PRIMARY KEY,             -- wamid.* from Meta
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- 4. pg_cron: purge processed messages older than 48 hours
-- Idempotent: DO $do$ guard prevents duplicate cron job on re-run
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'purge-whatsapp-processed-messages'
  ) THEN
    PERFORM cron.schedule(
      'purge-whatsapp-processed-messages',
      '0 */6 * * *',
      $$DELETE FROM whatsapp_processed_messages WHERE processed_at < NOW() - INTERVAL '48 hours'$$
    );
  END IF;
END $do$;
