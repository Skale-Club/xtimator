-- Phase 58: Stripe processed events idempotency table
-- Same pattern as whatsapp_processed_messages — event_id TEXT PRIMARY KEY
-- Deny-all RLS: service role writes only (same as usage_events)
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id  TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies added: deny-all (service role bypasses RLS)
