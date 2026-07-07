-- Pre-launch audit fix (B2 — auto-top-up charges the card but never credits,
-- with unlimited re-charge risk): add a cooldown timestamp so a single company
-- cannot be charged more than once per hour, regardless of how many credit
-- debits cross the threshold in that window. Combined with the webhook/sync
-- grantCredits fix in lib/billing/auto-topup.ts + the Stripe webhook handler.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_last_charge_attempt_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN companies.auto_topup_last_charge_attempt_at IS
  'Stamped immediately before every off-session auto-top-up charge attempt (success or failure). Enforces a minimum cooldown between attempts so a stuck low-balance company is not re-charged on every credit debit.';
