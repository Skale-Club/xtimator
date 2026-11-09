-- Production's onboarding_drafts was created from an earlier draft of
-- 20261106153000_onboarding_drafts.sql and lacks completion_started_at, so every
-- autosave failed with 42703 (Sentry XTIMATOR-18). Additive and idempotent:
-- adds whatever the current code reads or writes and is missing, touches no data.
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 3;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS client_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS completion_started_at timestamptz;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS completed_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
