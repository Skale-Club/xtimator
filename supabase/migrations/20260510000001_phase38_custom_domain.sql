-- Phase 38: Custom Domain DB + Settings UI
-- Adds nullable custom_domain column to companies for per-company subdomain routing.
-- NULL = no custom domain configured; all existing behavior unchanged (DOMAIN-05).
-- No DEFAULT clause -- NULL is intentional initial state (same pattern as Phase 24).

ALTER TABLE companies
  ADD COLUMN custom_domain TEXT;

COMMENT ON COLUMN companies.custom_domain IS
  'Custom subdomain for white-label estimate sharing (e.g. estimates.mycompany.com). NULL = use xtimator.com.';

CREATE INDEX IF NOT EXISTS idx_companies_custom_domain
  ON companies(custom_domain)
  WHERE custom_domain IS NOT NULL;
