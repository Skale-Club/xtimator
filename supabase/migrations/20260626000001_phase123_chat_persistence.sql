-- supabase/migrations/20260626000001_phase123_chat_persistence.sql
-- Phase 123 (CHATDB-01/02): web-chat persistence. Two tables mirroring
-- whatsapp_inbox's SHAPE (parent conversation + append-only message log,
-- denormalized company_id on the message) but TENANT-READABLE via company_members
-- (the credit_ledger / phase82 RLS posture) — NOT deny-all. Owner-only: the SELECT
-- policies narrow additionally by user_id = (select auth.uid()) so a second member
-- of the same company cannot read another owner's chat. Service role bypasses RLS
-- for all writes (the lib/queries/chat.ts helpers use the service client).
-- Authored-only: NOT applied to remote here; deploy is owned by CI->GHCR->Coolify
-- (never build/migrate on the VPS). NO secrets.

-- 1. chat_conversations: one row per chat thread (per company, per owner)
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_company_user_updated
  ON public.chat_conversations (company_id, user_id, updated_at DESC);

-- 2. chat_messages: append-only message log. parts jsonb stores the AI SDK
--    UIMessage parts array; attachments jsonb stores multimodal refs.
--    company_id is DENORMALIZED (mirrors whatsapp_messages) for a direct RLS gate.
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  parts           JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages (conversation_id, created_at);

-- 3. RLS — tenant-readable via company_members (mirror credit_ledger / phase82),
--    owner-narrowed by user_id. Service role bypasses RLS for writes.
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select" ON public.chat_conversations FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id IN (SELECT company_members.company_id FROM company_members
                       WHERE company_members.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_members.company_id FROM company_members
                   WHERE company_members.user_id = (SELECT auth.uid()))
    AND conversation_id IN (SELECT chat_conversations.id FROM chat_conversations
                            WHERE chat_conversations.user_id = (SELECT auth.uid()))
  );

COMMENT ON TABLE public.chat_conversations IS
  'Web-chat conversation threads. Tenant-readable via company_members, owner-narrowed by user_id; service-role writes only. Phase 123 (CHATDB-01/02).';
COMMENT ON TABLE public.chat_messages IS
  'Append-only web-chat message log. parts jsonb = AI SDK UIMessage parts; company_id denormalized for a direct RLS gate. Phase 123 (CHATDB-01/02).';
