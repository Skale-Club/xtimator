-- Phase 50: WhatsApp OTP number verification (SEED-015 Gap 2)
--
-- Adds columns to support a 6-digit code verification flow before activating
-- a number. The flow:
--   1. User submits credentials → row inserted with status='pending' + code
--   2. Server sends code to user's phone via WhatsApp
--   3. User enters code in UI → server validates within 10min TTL, max 3 attempts
--   4. On success: status='active', verified_at set, code/attempts/expires cleared
--   5. On exhaustion (3 fails): row deleted, user must restart

ALTER TABLE company_whatsapp
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS verification_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;

-- Note: status column already exists with CHECK constraint accepting
-- 'pending' | 'verified' | 'active' | 'suspended' (from Phase 40 schema).
-- Pre-Phase-50 rows were created with status='active' directly; existing
-- rows are not migrated — they remain active. Only new connections go
-- through OTP.
