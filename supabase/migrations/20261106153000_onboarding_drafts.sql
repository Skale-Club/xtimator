-- User-scoped onboarding progress, before a company exists. No recovery sends.
CREATE TABLE public.onboarding_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.xtimator_accounts(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'first' CHECK (mode IN ('first','add')),
  schema_version integer NOT NULL DEFAULT 3,
  step text NOT NULL DEFAULT 'language' CHECK (step IN ('language','companyName','industry','location','brandColor')),
  "values" jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("values")='object' AND octet_length("values"::text)<=65536),
  client_id uuid,
  client_sequence bigint NOT NULL DEFAULT 0 CHECK (client_sequence>=0),
  revision integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completion_started_at timestamptz,
  completed_at timestamptz,
  completed_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX onboarding_drafts_one_active ON public.onboarding_drafts(user_id,mode) WHERE completed_at IS NULL;
CREATE INDEX onboarding_drafts_abandoned ON public.onboarding_drafts(last_activity_at) WHERE completed_at IS NULL;

CREATE FUNCTION public.touch_onboarding_draft() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.last_activity_at=clock_timestamp();
  NEW.revision=OLD.revision+1;
  RETURN NEW;
END $$;
CREATE TRIGGER onboarding_drafts_touch BEFORE UPDATE ON public.onboarding_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_onboarding_draft();

ALTER TABLE public.onboarding_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.onboarding_drafts TO authenticated;
GRANT ALL ON public.onboarding_drafts TO service_role;
CREATE POLICY onboarding_drafts_read ON public.onboarding_drafts FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY onboarding_drafts_insert ON public.onboarding_drafts FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND NOT public.is_demo_user());
CREATE POLICY onboarding_drafts_update ON public.onboarding_drafts FOR UPDATE TO authenticated USING (user_id=auth.uid() AND NOT public.is_demo_user()) WITH CHECK (user_id=auth.uid() AND NOT public.is_demo_user());
COMMENT ON TABLE public.onboarding_drafts IS 'Incomplete setup progress. Future recovery can join verified account contacts; no outreach is triggered by this table.';
NOTIFY pgrst, 'reload schema';
