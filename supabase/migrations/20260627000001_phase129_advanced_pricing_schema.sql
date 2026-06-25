-- supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql
-- Phase 129 (TAX-01): land all v4.11 advanced-pricing columns DORMANT.
-- Defaults preserve current behavior byte-for-byte (ENG-02). Nothing reads
-- these until Phases 130-132. Authored-only — committed and carried by
-- CI->GHCR->Coolify; NOT applied on the VPS (never `supabase db push`).
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP/ADD named CHECKs.

-- estimate_items: per-item taxability, line discount, cost/markup (dormant — no derived price yet).
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS taxable      BOOLEAN       NOT NULL DEFAULT true;
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS tax_category TEXT;                 -- nullable; CHECK below
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS discount     NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS cost         NUMERIC(12,2);          -- nullable
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS markup_pct   NUMERIC(7,4);           -- nullable

ALTER TABLE estimate_items DROP CONSTRAINT IF EXISTS estimate_items_tax_category_check;
ALTER TABLE estimate_items
  ADD CONSTRAINT estimate_items_tax_category_check
  CHECK (tax_category IS NULL OR tax_category IN ('labor', 'materials', 'other'));

-- estimates: deposit + balance. GLOBAL discount REUSES the EXISTING discount_type/
-- discount_value/discount_amount columns (initial_schema; engine already writes them) —
-- this migration adds NO new estimates.discount column (Research Open Q1).
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_type  TEXT          NOT NULL DEFAULT 'none';
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(12,2);              -- nullable
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS balance_due   NUMERIC(12,2);              -- nullable

ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_deposit_type_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_deposit_type_check
  CHECK (deposit_type IN ('none', 'percent', 'amount'));

-- companies: per-category tax rule. NULL = flat default_tax_rate path (retrocompat).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_config JSONB;                         -- nullable

COMMENT ON COLUMN companies.tax_config IS
  'Per-category tax rule (v4.11). NULL = use flat default_tax_rate (retrocompat). Read by the engine starting Phase 130.';
