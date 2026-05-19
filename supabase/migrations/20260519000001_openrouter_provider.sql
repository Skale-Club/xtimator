-- 260519-or1: OpenRouter provider + per-company AI model override.
--
-- When set, `companies.ai_model_override` means "always use OpenRouter
-- with this specific model id for this tenant, regardless of the
-- platform-wide selected_ai_provider." NULL = follow the global selection.
--
-- The OpenRouter API key itself lives in platform_integrations under
-- provider='openrouter' and is created via the admin UI — no migration
-- needed for that (platform_integrations.provider is free-text PK).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_model_override TEXT NULL;

COMMENT ON COLUMN companies.ai_model_override IS
  'When non-null, this company uses OpenRouter with this specific model id (e.g. "anthropic/claude-3.5-sonnet"), overriding the platform-wide active provider. NULL = follow global selection.';
