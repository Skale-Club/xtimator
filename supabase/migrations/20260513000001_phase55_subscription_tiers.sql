-- supabase/migrations/20260513000001_phase55_subscription_tiers.sql
-- Phase 55: Schema + Tier Definitions
-- Adds subscription tier columns to companies and creates usage_events table.
-- Applied via: bunx supabase db push --db-url $DATABASE_URL

-- ============================================================
-- 1. COMPANIES: subscription tier columns
-- ============================================================

-- tier: NOT NULL with DEFAULT fills all existing rows as 'free' atomically (Postgres 11+).
-- CHECK constraint ensures valid tier strings (TEXT+CHECK pattern, D-07/D-08 — no Postgres enum).
ALTER TABLE companies
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'trial', 'pro', 'business'));

-- Nullable datetime/text columns: no DEFAULT needed. NULL = not set / not applicable.
ALTER TABLE companies ADD COLUMN tier_trial_ends_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE companies ADD COLUMN tier_renews_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN tier_cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.tier IS
  'Subscription tier: free | trial | pro | business. Defaults to free for all existing companies.';
COMMENT ON COLUMN companies.tier_trial_ends_at IS
  'Trial expiry. NULL = not on trial / already converted. Set on new company INSERT only (application layer).';
COMMENT ON COLUMN companies.stripe_customer_id IS
  'Stripe Customer ID (cus_xxx). Set by Stripe webhook on first checkout.';
COMMENT ON COLUMN companies.stripe_subscription_id IS
  'Stripe Subscription ID (sub_xxx). Set by Stripe webhook on checkout.session.completed.';
COMMENT ON COLUMN companies.tier_renews_at IS
  'Next billing date for active subscriptions. Set by Stripe webhook.';
COMMENT ON COLUMN companies.tier_cancelled_at IS
  'When subscription was cancelled. NULL = not cancelled.';

-- ============================================================
-- 2. USAGE_EVENTS: rolling audit log of AI operations
-- ============================================================

CREATE TABLE usage_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL
    CHECK (event_type IN ('estimate_generated', 'photo_analyzed', 'audio_transcribed')),
  units        NUMERIC,        -- e.g. audio minutes, photo count
  metadata     JSONB,          -- arbitrary context (project_id, estimate_id, idempotency_key)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS policies = deny-all for anon/authenticated. Service role bypasses RLS.
-- Consistent with Phase 40 pattern: company_whatsapp, whatsapp_sessions, whatsapp_processed_messages.
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Quota query index: "how many estimates this month for company X?"
CREATE INDEX usage_events_company_created
  ON usage_events(company_id, created_at DESC);

COMMENT ON TABLE usage_events IS
  'Rolling audit log of AI operations per company. Service-role writes only. Enables quota enforcement and billing analytics.';
