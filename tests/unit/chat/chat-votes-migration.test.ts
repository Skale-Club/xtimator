import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static SQL contract for the chat votes + client_id migration (AI-chatbot
 * parity follow-up to the bubble activation). Mirrors the Phase-123
 * chat-persistence static test: pure file read, no DB, no secrets.
 *
 * Contract:
 *   - chat_messages gains a nullable client_id TEXT (idempotent ADD COLUMN)
 *     so history reloads keep the live session's UIMessage ids.
 *   - chat_message_votes: one row per (conversation, message, user), message_id
 *     TEXT (client ids are not uuids), company_id denormalized, RLS enabled
 *     with an owner-narrowed tenant SELECT policy (service-role writes only).
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260710000001_chat_votes_client_id.sql',
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

describe('chat votes + client_id migration static contract', () => {
  it('adds chat_messages.client_id idempotently, with a conversation-scoped index', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ALTER TABLE public\.chat_messages\s+ADD COLUMN IF NOT EXISTS client_id TEXT/)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_client/)
  })

  it('creates chat_message_votes idempotently with the vote-shape columns', () => {
    const sql = readMigration()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.chat_message_votes/)
    expect(sql).toMatch(/conversation_id UUID NOT NULL REFERENCES public\.chat_conversations\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/company_id\s+UUID NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/user_id\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/message_id\s+TEXT NOT NULL/)
    expect(sql).toMatch(/is_upvoted\s+BOOLEAN NOT NULL/)
    expect(sql).toMatch(/UNIQUE \(conversation_id, message_id, user_id\)/)
  })

  it('enables RLS with an owner-narrowed tenant SELECT policy', () => {
    const sql = readMigration()
    expect(sql).toMatch(/ALTER TABLE public\.chat_message_votes ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/CREATE POLICY "chat_message_votes_select" ON public\.chat_message_votes FOR SELECT TO authenticated/)
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
    expect(sql).toMatch(/company_members/)
    // Service-role writes only: no INSERT/UPDATE/DELETE policies.
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/)
  })
})
