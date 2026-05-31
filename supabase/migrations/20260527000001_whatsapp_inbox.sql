-- WhatsApp Inbox: persistent conversation + message log
--
-- Powers the /whatsapp inbox screen (view conversations, reply, send estimates).
-- Until now inbound WhatsApp content was ephemeral (recordings/photos + a 30-min
-- session); there was no message thread to show or reply to. These two tables log
-- every inbound + outbound message grouped by (company_id, contact_phone).
--
-- Service-role only (no RLS policies) — same pattern as company_whatsapp /
-- whatsapp_sessions / whatsapp_processed_messages. The app reads/writes via the
-- service client in server actions/queries scoped to the validated active company
-- (getActiveCompanyId()), never via the authenticated/anon client.

-- 1. whatsapp_conversations: one row per (company, contact phone) thread
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,                       -- E.164, the other party
  contact_name TEXT,                                 -- best-known display name
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_inbound_at TIMESTAMPTZ,                        -- drives the Meta 24h reply window
  unread_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_company_last
  ON whatsapp_conversations (company_id, last_message_at DESC NULLS LAST);

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- 2. whatsapp_messages: append-only message log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  msg_type TEXT NOT NULL DEFAULT 'text'
    CHECK (msg_type IN ('text', 'image', 'audio', 'document', 'system')),
  body TEXT,
  media_url TEXT,
  wa_message_id TEXT,                                 -- Meta wamid (nullable)
  status TEXT CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_created
  ON whatsapp_messages (conversation_id, created_at);

-- Idempotency guard for inbound logging on webhook retries
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_wamid
  ON whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.
