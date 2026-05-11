-- Phase 52: Per-estimate language selection (SEED-016)
--
-- Adds language columns at three levels:
--   1. estimates.language — REQUIRED, default 'en'. Stores the language the
--      estimate was generated in. Immutable once written (frontend treats it
--      as a property of the version).
--   2. clients.preferred_language — NULLABLE. Auto-learned: after the FIRST
--      successful send, this is set to that estimate's language. Future
--      estimates default to this preference via the cascade resolver.
--   3. companies.default_estimate_language — NULLABLE. Company-level override
--      for the cascade. Null means "fall through to user's app language, then
--      'en'".
--
-- Cascade priority (resolved at generation time):
--   estimate override > client.preferred_language > company.default_estimate_language
--   > user app language (if non-EN explicit choice) > 'en'
--
-- English-first principle: schema defaults to 'en' on estimates, nullables on
-- clients/companies. The system NEVER auto-detects from browser locale —
-- non-English requires deliberate opt-in.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'pt', 'es'));

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS preferred_language TEXT
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'pt', 'es'));

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_estimate_language TEXT
  CHECK (default_estimate_language IS NULL OR default_estimate_language IN ('en', 'pt', 'es'));
