-- Written while chasing Sentry XTIMATOR-18 ("column completion_started_at does
-- not exist" on every onboarding autosave). On 2026-11-09 it turned out every
-- column already existed in production (attnum 12, applied there as a no-op);
-- the real cause was a nested or() filter the production PostgREST mis-compiles,
-- fixed in lib/actions/onboarding-draft.ts. Kept because it is idempotent and
-- recorded in the ledger of both databases.
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 3;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS client_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS completion_started_at timestamptz;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.onboarding_drafts ADD COLUMN IF NOT EXISTS completed_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
