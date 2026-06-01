-- Adds nullable subdomain column to companies for white-label workspace URLs
-- (e.g. "yourco" => yourco.xtimator.com). Collected during create account step two.
-- NULL = no subdomain chosen yet. Distinct from custom_domain, which holds a full
-- custom domain for white-label estimate sharing (e.g. estimates.mycompany.com).
-- Additive and nullable: all existing rows and behavior are unchanged.

ALTER TABLE companies
  ADD COLUMN subdomain TEXT;

COMMENT ON COLUMN companies.subdomain IS
  'White-label workspace subdomain chosen at sign up (e.g. "yourco" => yourco.xtimator.com). NULL = not set. Distinct from custom_domain.';

-- Enforce global, case-insensitive uniqueness for set subdomains, while allowing
-- many NULLs (companies that have not chosen one yet).
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_subdomain_unique
  ON companies (lower(subdomain))
  WHERE subdomain IS NOT NULL;
