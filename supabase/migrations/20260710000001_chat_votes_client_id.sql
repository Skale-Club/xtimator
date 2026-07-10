-- supabase/migrations/20260710000001_chat_votes_client_id.sql
-- Chat bubble follow-up (Vercel AI Chatbot parity): message votes + stable ids.
--
-- 1. chat_messages.client_id — the AI SDK UIMessage id the CLIENT generated for
--    the message. Persisting it lets history reloads seed useChat with the SAME
--    ids the live session used, so per-message state keyed by id (votes,
--    edit/regenerate truncation) survives a reload. Nullable: rows persisted
--    before this migration keep using their DB uuid as the UIMessage id.
-- 2. chat_message_votes — one 👍/👎 per (conversation, message, user), keyed by
--    the UIMessage id (TEXT — client ids are not uuids). Same RLS posture as
--    chat_messages: tenant-readable via company_members, owner-narrowed by
--    user_id; all writes go through the service client.
--
-- Authored-only: NOT applied to remote here; deploy is owned by CI->GHCR->Coolify
-- (never build/migrate on the VPS). NO secrets.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_client
  ON public.chat_messages (conversation_id, client_id);

CREATE TABLE IF NOT EXISTS public.chat_message_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id      TEXT NOT NULL,
  is_upvoted      BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_votes_conversation
  ON public.chat_message_votes (conversation_id, user_id);

ALTER TABLE public.chat_message_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_message_votes_select" ON public.chat_message_votes;
CREATE POLICY "chat_message_votes_select" ON public.chat_message_votes FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND company_id IN (SELECT company_members.company_id FROM company_members
                       WHERE company_members.user_id = (SELECT auth.uid()))
  );

COMMENT ON COLUMN public.chat_messages.client_id IS
  'AI SDK UIMessage id generated client-side; lets history reloads keep the live session''s message ids (votes, edit/regenerate truncation).';
COMMENT ON TABLE public.chat_message_votes IS
  'Per-owner thumbs up/down on assistant chat messages, keyed by UIMessage id. Service-role writes only.';
