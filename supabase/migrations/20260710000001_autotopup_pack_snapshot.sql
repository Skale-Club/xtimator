-- Data-integrity fix: auto-top-up pack snapshot. companies.auto_topup_pack_index
-- is an index into billing_config.topUpPacks — if an admin reorders or reprices
-- packs, an opted-in company gets charged a different amount/credits than it
-- authorized. These nullable snapshot columns capture the exact price + credits
-- the tenant agreed to at save time. Both nullable, NO backfill — legacy rows
-- (null snapshot) fall back to the index lookup, same retrocompat posture as
-- 20260705000002_phase153_auto_topup_columns.sql.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_pack_price_cents INTEGER DEFAULT NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_pack_credits INTEGER DEFAULT NULL;

COMMENT ON COLUMN companies.auto_topup_pack_price_cents IS
  'Snapshot of the top-up pack price (integer cents) captured when auto-top-up was configured. NULL = legacy row; charge falls back to billing_config.topUpPacks[auto_topup_pack_index].';
COMMENT ON COLUMN companies.auto_topup_pack_credits IS
  'Snapshot of the top-up pack credit grant captured when auto-top-up was configured. NULL = legacy row; grant falls back to billing_config.topUpPacks[auto_topup_pack_index].';
