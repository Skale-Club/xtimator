-- Keep existing stable step keys and answers; allow the new final logo screen.
ALTER TABLE public.onboarding_drafts DROP CONSTRAINT onboarding_drafts_step_check;
ALTER TABLE public.onboarding_drafts ADD CONSTRAINT onboarding_drafts_step_check
  CHECK (step IN ('language','companyName','industry','location','brandColor','logo'));
NOTIFY pgrst, 'reload schema';
