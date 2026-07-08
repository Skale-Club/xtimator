-- Phase 161 (PRESENT-01/02/03): per-estimate presentation + pricing-override
-- settings, dormant-first. Mirrors 20260627000001_phase129_advanced_pricing_schema.sql's
-- exact idiom (companies.tax_config) and 20260708000001_phase160_public_url_contract.sql's
-- same-day sequencing.
--
-- Authored-only -- carried by CI->GHCR->Coolify; NOT applied on the VPS
-- (never `supabase db push` from a dev machine). Idempotent (ADD COLUMN IF
-- NOT EXISTS).
--
-- NOT a calculation column: Tax/Discount/Deposit CALCULATION inputs already
-- exist as typed columns on `estimates` (deposit_type/deposit_value, tax_rate,
-- discount_type/discount_value -- Phase 129) and are read directly by
-- computeEstimateTotals (lib/estimate/compute-totals.ts). This column stores
-- ONLY: (a) section-visibility flags, and (b) the estimate-scoped OVERRIDE
-- *state* (Default/Custom/Off for tax; enabled/disabled flags for
-- discount/deposit) that the Phase 161 resolver (lib/estimate/presentation-settings.ts)
-- turns into the exact inputs computeEstimateTotals already accepts. The
-- engine itself is never modified (GUARD-03).

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS presentation_settings JSONB;

COMMENT ON COLUMN estimates.presentation_settings IS
  'Per-estimate document presentation + pricing-override settings (PRESENT-01..05). NULL = show everything, use company defaults (retrocompat). Read EXCLUSIVELY through lib/estimate/presentation-settings.ts -- never by ad hoc field != null checks (see PITFALLS.md #1, settings-drift). Section-visibility flags here are presentation-only and never reach lib/estimate/compute-totals.ts; tax/discount/deposit OVERRIDE STATE here resolves to inputs the existing engine already accepts.';
