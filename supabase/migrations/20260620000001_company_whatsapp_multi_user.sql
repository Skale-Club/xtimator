-- Migration: WhatsApp multi-user support
-- Adds user_id to company_whatsapp so N users per company each own their own
-- owner_phone and independent conversation history.
-- Also adds owner_phone to whatsapp_conversations for per-user thread scoping.

-- ──────────────────────────────────────────────────────────────────────────────
-- Step A: Add user_id column to company_whatsapp
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE company_whatsapp
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step B: Drop the old single-company UNIQUE constraint
-- (Supabase default name for UNIQUE(company_id) is company_whatsapp_company_id_key)
-- This allows multiple rows per company (one per user).
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE company_whatsapp
  DROP CONSTRAINT IF EXISTS company_whatsapp_company_id_key;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step C: Add composite UNIQUE (company_id, user_id) for per-user rows
-- Partial index so the constraint only fires when user_id is set.
-- Legacy rows (user_id IS NULL) get their own partial index below.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS company_whatsapp_company_user_unique
  ON company_whatsapp (company_id, user_id)
  WHERE user_id IS NOT NULL;

-- Backward-compat: keep the single-company uniqueness for NULL user_id rows.
CREATE UNIQUE INDEX IF NOT EXISTS company_whatsapp_company_no_user_unique
  ON company_whatsapp (company_id)
  WHERE user_id IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step D: Backfill existing rows with user_id from company_members
-- Picks the earliest member (created_at ASC) to represent the company owner.
-- Safe to run multiple times (WHERE user_id IS NULL guard).
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE company_whatsapp cw
SET user_id = cm.user_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, user_id
  FROM company_members
  ORDER BY company_id, created_at ASC
) cm
WHERE cw.company_id = cm.company_id
  AND cw.user_id IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step E: Add owner_phone column to whatsapp_conversations
-- Tracks which owner's WhatsApp number this conversation belongs to.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS owner_phone TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step F: Update UNIQUE constraint on whatsapp_conversations
-- Old: UNIQUE(company_id, contact_phone) — one thread per company+contact.
-- New: one thread per company+owner+contact (3-column key) when owner is known.
-- Legacy rows (owner_phone IS NULL) keep the old 2-column uniqueness.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_company_id_contact_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_owner_contact_unique
  ON whatsapp_conversations (company_id, owner_phone, contact_phone)
  WHERE owner_phone IS NOT NULL;

-- Preserve old UNIQUE for NULL owner_phone rows (backward compat)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_legacy_unique
  ON whatsapp_conversations (company_id, contact_phone)
  WHERE owner_phone IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step G: Performance index for inbox listing by owner
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS whatsapp_conversations_owner_last_msg_idx
  ON whatsapp_conversations (company_id, owner_phone, last_message_at DESC NULLS LAST);
