-- Migration: Xphere CRM sync state on companies
-- Records the three mirrored Xphere entity IDs + last-sync timestamp + last error.
-- companies.id is the Xphere external_id (idempotency key); no new unique constraint needed.

-- ──────────────────────────────────────────────────────────────────────────────
-- Add xphere_* sync-state columns to companies
-- All five are nullable with no DEFAULT (additive company-column pattern, see
-- Phase 24 / Phase 38). The Inngest sync job persists the three entity IDs +
-- xphere_synced_at on success and stores xphere_sync_error on failure.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS xphere_account_id TEXT,
  ADD COLUMN IF NOT EXISTS xphere_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS xphere_opportunity_id TEXT,
  ADD COLUMN IF NOT EXISTS xphere_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS xphere_sync_error TEXT;
