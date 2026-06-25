import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * CHATDB-01 (static SQL contract): the Phase 123 chat-persistence migration must
 * ship two tables — chat_conversations (parent thread) + chat_messages (append-only
 * log) — created idempotently, with the AI SDK UIMessage `parts` jsonb store and a
 * denormalized company_id on the message (mirroring whatsapp_messages' SHAPE), but
 * TENANT-READABLE via company_members (the credit_ledger / phase82 RLS posture —
 * NOT whatsapp's deny-all) and owner-narrowed by user_id = (select auth.uid())
 * (NEVER companies.user_id).
 *
 * Static-source-read pattern (mirrors tests/unit/billing/credit-ledger-migration.test.ts).
 * Pure file read — runs in CI with no DB and no secrets.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260626000001_phase123_chat_persistence.sql'
)

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

const ROLES = ['user', 'assistant', 'tool', 'system'] as const

describe('CHATDB-01: chat_persistence migration static contract', () => {
  it('creates both chat_conversations and chat_messages tables idempotently', () => {
    const sql = readMigration()
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.chat_conversations/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.chat_messages/)
  })

  it('declares chat_conversations columns (company_id, user_id FK, title, timestamps)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/company_id\s+UUID NOT NULL REFERENCES public\.companies/)
    // Repo convention: user_id references auth.users ON DELETE CASCADE.
    expect(sql).toMatch(/user_id\s+UUID NOT NULL REFERENCES auth\.users/)
    expect(sql).toMatch(/title\s+TEXT/)
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT/)
    expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT/)
  })

  it('declares chat_messages shape (conversation FK, denormalized company_id, parts/attachments jsonb)', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /conversation_id\s+UUID NOT NULL REFERENCES public\.chat_conversations/
    )
    // company_id is DENORMALIZED onto the message (mirrors whatsapp_messages) for a direct RLS gate.
    expect(sql).toMatch(/company_id\s+UUID NOT NULL REFERENCES public\.companies/)
    // parts is the AI SDK UIMessage parts store — NOT NULL jsonb.
    expect(sql).toMatch(/parts\s+JSONB NOT NULL/)
    expect(sql).toMatch(/attachments\s+JSONB/)
  })

  it('constrains role via a CHECK enum (user/assistant/tool/system)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/role\s+TEXT NOT NULL CHECK/)
    for (const v of ROLES) {
      expect(sql, `missing role value: ${v}`).toContain(`'${v}'`)
    }
  })

  it('enables row level security on both tables', () => {
    const sql = readMigration()
    const enables = sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []
    expect(enables.length).toBeGreaterThanOrEqual(2)
  })

  it('gates SELECT via company_members and NEVER companies.user_id', () => {
    const sql = readMigration()
    expect(sql).toMatch(/company_members\.company_id/)
    // Strip line comments so the documenting header note doesn't false-positive —
    // only the DDL body is checked for the forbidden Phase 82 invariant.
    const code = sql.replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/companies\.user_id/)
  })

  it('narrows the conversations SELECT policy to the owner via user_id = (select auth.uid())', () => {
    const sql = readMigration()
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
  })

  it('creates the conversation/created history index on chat_messages', () => {
    const sql = readMigration()
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created/
    )
  })

  it('drops policies before re-creating them (idempotent re-runs)', () => {
    const sql = readMigration()
    expect(sql).toMatch(/DROP POLICY IF EXISTS/)
  })
})
