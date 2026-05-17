-- Phase 70: Stripe Connect — customer payments on estimates (CONNECT-01)
--
-- Adds Connect-account state to companies and per-estimate payment tracking
-- to estimates. RLS is unchanged: the existing company-scoped policies on both
-- tables already cover these new columns (policies grant on the row, not on
-- individual columns), so tenants stay isolated automatically.
--
-- Backfill notes:
--   - `estimates.payment_status` has DEFAULT 'unpaid', which Postgres applies
--     to every existing row when the column is added — no explicit UPDATE
--     needed and no downtime window.
--   - All other new columns are NULLable and default NULL, so they're invisible
--     to companies that never connect Stripe (graceful degrade — Phase 70 hard
--     constraint).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS stripe_account_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_status       TEXT
    CHECK (stripe_connect_status IS NULL OR stripe_connect_status IN ('pending','active','disconnected')),
  ADD COLUMN IF NOT EXISTS stripe_connected_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_account_email        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_display_name TEXT;

-- Partial index supports the webhook handler (Plan 70-04), which looks up the
-- company by `stripe_account_id` when receiving Connect events. WHERE clause
-- keeps the index small — most rows are NULL until the tenant connects.
CREATE INDEX IF NOT EXISTS idx_companies_stripe_account_id
  ON companies(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS payment_status             TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','refunded')),
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT,
  ADD COLUMN IF NOT EXISTS paid_at                    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_amount_cents       INTEGER;

-- Supports webhook reconciliation lookups by session id when the metadata
-- shortcut is unavailable (e.g. testing the route end-to-end via Stripe CLI).
CREATE INDEX IF NOT EXISTS idx_estimates_stripe_checkout_session_id
  ON estimates(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
