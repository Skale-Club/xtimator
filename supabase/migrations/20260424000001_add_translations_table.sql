-- Phase 12: Translation cache table for i18n system
-- Migration: 20260424000001_add_translations_table.sql

CREATE TABLE translations (
  id BIGSERIAL PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en',
  target_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX translations_source_target_unique
  ON translations (source_text, source_language, target_language);

COMMENT ON TABLE translations IS
  'Cache for AI-translated UI strings. Platform-wide, not tenant-scoped.';

-- RLS: allow anon/authenticated reads; service role handles writes via API route
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translations_public_read"
  ON translations FOR SELECT
  USING (true);
-- Writes are service-role only (no INSERT policy needed — service role bypasses RLS)
