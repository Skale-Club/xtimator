-- Phase 148: Demo Estimate Quota
-- Adds demo_estimate_quota column to companies table.
-- NULL = no quota (existing companies and paid subscribers).
-- INTEGER value = max estimates allowed (set to 3 for admin-created demo companies).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS demo_estimate_quota INTEGER DEFAULT NULL;

COMMENT ON COLUMN companies.demo_estimate_quota IS
  'Demo estimate cap. NULL = unlimited. 3 = street-sales demo account. Bypassed for paid tiers.';
