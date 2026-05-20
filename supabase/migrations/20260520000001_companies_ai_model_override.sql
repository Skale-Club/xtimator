-- ============================================================================
-- companies.ai_model_override — per-tenant AI model pin (Phase 74-era feature)
-- ============================================================================
-- Code in lib/ai/index.ts + app/admin/companies/* references this column to
-- override the platform-default AI model for specific tenants (routed via
-- OpenRouter). Column was added to TypeScript types and queries but the
-- migration was never written. Every read on /admin/companies fails silently
-- with "column does not exist" → "No companies found" empty state, hiding
-- the actual tenant list.
--
-- Nullable so existing tenants (no override = use platform default) work
-- unchanged. Format: free-form text like 'anthropic/claude-sonnet-4' or
-- 'openrouter/google/gemini-2.5-flash' — validated at application layer
-- since the OpenRouter model catalog changes faster than CHECK constraints.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_model_override TEXT NULL;

CREATE INDEX IF NOT EXISTS companies_ai_model_override_idx
  ON public.companies(ai_model_override)
  WHERE ai_model_override IS NOT NULL;
