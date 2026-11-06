-- Additive preparation. Apply only to the verified Xtimator database.
-- UUIDs and application RLS remain stable. Activation is a separate explicit RPC.
SET search_path = public;

-- Never run this application-wide identity cutover against a shared portfolio
-- schema. Fail before any writes if tables outside Xtimator's migrations exist.
DO $$
DECLARE allowed text[] := ARRAY[
  'admin_audit_log','affiliate_commissions','affiliate_payouts','affiliate_referrals','affiliates',
  'agentic_send_confirmations','ai_cost_events','ai_generation_logs','blog_generation_jobs','blog_post_feedback',
  'blog_posts','blog_rss_items','blog_rss_sources','blog_settings','chat_conversations','chat_message_votes',
  'chat_messages','client_message_events','clients','companies','company_invites','company_members','company_price_book',
  'company_whatsapp','credit_ledger','credit_lots','cron_heartbeats','customer_messages','demo_config','estimate_activity',
  'estimate_deliveries','estimate_engagement_events','estimate_items','estimate_photos','estimate_sections',
  'estimate_signatures','estimates','invoices','job_dispatch_ownership','knowledge_entries','legal_pages',
  'notification_preferences','notification_templates','notifications','oauth_access_tokens','oauth_authorization_codes',
  'oauth_clients','oauth_refresh_tokens','photos','pipeline_events','platform_admins','platform_branding',
  'platform_integrations','platform_notification_preferences','price_book_folders','price_book_imports',
  'price_book_item_options','price_research_cache','processed_stripe_events','projects','recordings',
  'storage_url_rewrites','telegram_settings','tour_events','translations','usage_events','whatsapp_authorized_senders',
  'whatsapp_company_configs','whatsapp_conversations','whatsapp_messages','whatsapp_notification_templates',
  'whatsapp_processed_messages','whatsapp_sessions'
];
BEGIN
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','f') AND NOT c.relname=ANY(allowed)
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.deptype='e'))
  THEN RAISE EXCEPTION 'Xtimator auth migration requires an exclusive reviewed application database; unrecognized public tables exist'; END IF;
END $$;

CREATE TABLE public.xtimator_auth_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  instance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT false
);
INSERT INTO public.xtimator_auth_control(singleton) VALUES(true);

CREATE TABLE public.xtimator_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX xtimator_account_verified_phone ON public.xtimator_accounts(phone) WHERE phone_confirmed_at IS NOT NULL;
-- Email is not the account identity. Conflicting legacy addresses require recovery.
CREATE INDEX xtimator_account_email ON public.xtimator_accounts(lower(email));

CREATE TABLE public.xtimator_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.xtimator_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY(issuer, subject)
);
CREATE INDEX xtimator_identity_user ON public.xtimator_identities(user_id);

CREATE TABLE public.xtimator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.xtimator_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  auth_time timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xtimator_session_expiry ON public.xtimator_sessions(expires_at);
CREATE INDEX xtimator_session_user ON public.xtimator_sessions(user_id);

CREATE TABLE public.xtimator_auth_challenges (
  token_hash text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('google', 'recovery', 'email')),
  user_id uuid REFERENCES public.xtimator_accounts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}',
  code_hash text,
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.xtimator_auth_limits (
  key text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
CREATE INDEX xtimator_auth_challenge_expiry ON public.xtimator_auth_challenges(expires_at);

-- Import actual verified auth attributes, never raw_user_meta_data.phone.
INSERT INTO public.xtimator_accounts(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at,disabled_at)
SELECT id,email,email_confirmed_at,
  CASE WHEN phone ~ '^\+?[1-9][0-9]{7,14}$' THEN '+' || ltrim(phone,'+') END,
  CASE WHEN phone ~ '^\+?[1-9][0-9]{7,14}$' THEN phone_confirmed_at END,
  coalesce(raw_user_meta_data,'{}'),coalesce(raw_app_meta_data,'{}'),coalesce(created_at,now()),coalesce(updated_at,now()),
  CASE WHEN (to_jsonb(u)->>'deleted_at') IS NOT NULL OR (to_jsonb(u)->>'banned_until')::timestamptz > now() THEN now() END
FROM auth.users u;

INSERT INTO public.xtimator_identities(issuer,subject,user_id)
SELECT 'https://accounts.google.com', coalesce(identity_data->>'sub',provider_id),user_id
FROM auth.identities WHERE provider='google' AND coalesce(identity_data->>'sub',provider_id) IS NOT NULL;

-- During preparation legacy account creation/profile updates still work. Once
-- activated, GoTrue writes cannot overwrite the owned account or delete it.
CREATE FUNCTION public.xtimator_mirror_legacy_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT active FROM public.xtimator_auth_control WHERE singleton) THEN RETURN NULL; END IF;
  IF TG_OP='DELETE' THEN DELETE FROM public.xtimator_accounts WHERE id=OLD.id; RETURN OLD; END IF;
  INSERT INTO public.xtimator_accounts(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at,disabled_at)
  VALUES(NEW.id,NEW.email,NEW.email_confirmed_at,
    CASE WHEN NEW.phone ~ '^\+?[1-9][0-9]{7,14}$' THEN '+' || ltrim(NEW.phone,'+') END,
    CASE WHEN NEW.phone ~ '^\+?[1-9][0-9]{7,14}$' THEN NEW.phone_confirmed_at END,
    coalesce(NEW.raw_user_meta_data,'{}'),coalesce(NEW.raw_app_meta_data,'{}'),coalesce(NEW.created_at,now()),now(),
    CASE WHEN (to_jsonb(NEW)->>'deleted_at') IS NOT NULL OR (to_jsonb(NEW)->>'banned_until')::timestamptz > now() THEN now() END)
  ON CONFLICT(id) DO UPDATE SET email=excluded.email,email_confirmed_at=excluded.email_confirmed_at,
    phone=excluded.phone,phone_confirmed_at=excluded.phone_confirmed_at,raw_user_meta_data=excluded.raw_user_meta_data,
    raw_app_meta_data=excluded.raw_app_meta_data,updated_at=now(),disabled_at=excluded.disabled_at;
  RETURN NEW;
END $$;
CREATE TRIGGER xtimator_mirror_legacy AFTER INSERT OR UPDATE OR DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.xtimator_mirror_legacy_account();

-- Preserve every original FK definition for operator review/recovery.
CREATE TABLE public.xtimator_auth_legacy_fks(schema_name text,table_name text,constraint_name text,definition text,PRIMARY KEY(schema_name,table_name,constraint_name));
DO $$ DECLARE r record; d text;
BEGIN
  FOR r IN SELECT n.nspname,t.relname,c.conname,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE c.contype='f' AND c.confrelid='auth.users'::regclass AND n.nspname='public'
  LOOP
    INSERT INTO public.xtimator_auth_legacy_fks VALUES(r.nspname,r.relname,r.conname,r.definition);
    d:=replace(r.definition,'REFERENCES auth.users(', 'REFERENCES public.xtimator_accounts(');
    IF d=r.definition THEN RAISE EXCEPTION 'Unexpected legacy FK definition'; END IF;
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',r.nspname,r.relname,r.conname);
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',r.nspname,r.relname,r.conname,d);
  END LOOP;
END $$;

-- Existing reporting/demo functions read the local account with the same UUID.
CREATE TABLE public.xtimator_auth_legacy_functions(signature text PRIMARY KEY,definition text NOT NULL);
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc LIKE '%auth.users%'
  LOOP
    INSERT INTO public.xtimator_auth_legacy_functions VALUES(r.signature,r.definition);
    EXECUTE replace(r.definition,'auth.users','public.xtimator_accounts');
  END LOOP;
END $$;

-- Restrictive companion policies leave all tenant/demo policies in force.
-- Old tokens work during preparation; activation rejects them immediately.
CREATE FUNCTION public.xtimator_session_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN coalesce(auth.jwt()->>'iss','')='xtimator' THEN EXISTS(
    SELECT 1 FROM public.xtimator_sessions s JOIN public.xtimator_accounts a ON a.id=s.user_id
    WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid() AND s.expires_at>now() AND a.disabled_at IS NULL
  ) ELSE NOT (SELECT active FROM public.xtimator_auth_control WHERE singleton) END;
$$;
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
  LOOP
    EXECUTE format('CREATE POLICY xtimator_owned_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.xtimator_session_active()) WITH CHECK (public.xtimator_session_active())',r.relname);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    CREATE POLICY xtimator_owned_session ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.xtimator_session_active()) WITH CHECK (public.xtimator_session_active());
  END IF;
END $$;

CREATE FUNCTION public.xtimator_auth_rate_limit(p_key text,p_limit integer,p_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.xtimator_auth_limits WHERE started_at < now()-interval '1 day';
  DELETE FROM public.xtimator_auth_challenges WHERE expires_at < now()-interval '1 day';
  DELETE FROM public.xtimator_sessions WHERE expires_at < now()-interval '1 day';
  INSERT INTO public.xtimator_auth_limits(key) VALUES(p_key) ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN xtimator_auth_limits.started_at < now()-make_interval(secs=>p_seconds) THEN 1 ELSE xtimator_auth_limits.attempts+1 END,
    started_at=CASE WHEN xtimator_auth_limits.started_at < now()-make_interval(secs=>p_seconds) THEN now() ELSE xtimator_auth_limits.started_at END
  RETURNING attempts INTO n;
  RETURN n<=p_limit;
END $$;

-- A wrong recovery/email code commits its attempt count; never RAISE after it.
CREATE FUNCTION public.xtimator_verify_challenge(p_token text,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.xtimator_auth_challenges;
BEGIN
  SELECT * INTO c FROM public.xtimator_auth_challenges WHERE token_hash=p_token FOR UPDATE;
  IF NOT FOUND OR c.kind NOT IN ('recovery','email') OR c.expires_at<=now() OR c.attempts>=5 OR c.verified_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE public.xtimator_auth_challenges SET attempts=attempts+1 WHERE token_hash=p_token;
  IF c.code_hash<>p_code THEN RETURN false; END IF;
  UPDATE public.xtimator_auth_challenges SET verified_at=now() WHERE token_hash=p_token;
  RETURN true;
END $$;

-- Parameters are derived ONLY from server-verified provider claims/challenges.
CREATE FUNCTION public.xtimator_complete_identity(p_issuer text,p_subject text,p_provider text,p_phone text,p_email text,p_google_subject text,p_name text,p_pending text,p_recovery text,p_current_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid; candidate uuid; pending public.xtimator_auth_challenges; recovery public.xtimator_auth_challenges; k text;
BEGIN
  IF NOT (SELECT active FROM public.xtimator_auth_control WHERE singleton) THEN RAISE EXCEPTION 'auth_not_activated'; END IF;
  IF p_provider NOT IN ('phone','google.com') OR p_subject IS NULL OR p_subject='' THEN RAISE EXCEPTION 'invalid_identity'; END IF;
  IF p_provider='phone' AND (p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$') THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  -- One stable global provisioning lock: small auth volume, predictable lock order,
  -- serializes phone/Google/recovery collisions and single-use challenge consumption.
  PERFORM pg_advisory_xact_lock(902114783);
  SELECT user_id INTO uid FROM public.xtimator_identities WHERE issuer=p_issuer AND subject=p_subject;
  IF p_google_subject IS NOT NULL THEN
    SELECT user_id INTO candidate FROM public.xtimator_identities WHERE issuer='https://accounts.google.com' AND subject=p_google_subject;
    IF uid IS NOT NULL AND candidate IS NOT NULL AND uid<>candidate THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    uid:=coalesce(uid,candidate);
  END IF;
  IF p_phone IS NOT NULL THEN
    SELECT id INTO candidate FROM public.xtimator_accounts WHERE phone=p_phone AND phone_confirmed_at IS NOT NULL;
    IF uid IS NOT NULL AND candidate IS NOT NULL AND uid<>candidate THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    uid:=coalesce(uid,candidate);
  END IF;
  IF p_pending IS NOT NULL THEN
    SELECT * INTO pending FROM public.xtimator_auth_challenges WHERE token_hash=p_pending AND kind='google' AND expires_at>now() FOR UPDATE;
    IF NOT FOUND OR p_provider<>'phone' THEN RAISE EXCEPTION 'challenge_expired'; END IF;
    SELECT user_id INTO candidate FROM public.xtimator_identities WHERE issuer=pending.payload->>'issuer' AND subject=pending.payload->>'subject';
    IF pending.user_id IS NOT NULL AND candidate IS NOT NULL AND pending.user_id<>candidate THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    candidate:=coalesce(candidate,pending.user_id);
    IF uid IS NOT NULL AND candidate IS NOT NULL AND uid<>candidate THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    uid:=coalesce(uid,candidate);
  END IF;
  IF p_recovery IS NOT NULL THEN
    SELECT * INTO recovery FROM public.xtimator_auth_challenges WHERE token_hash=p_recovery AND kind='recovery' AND expires_at>now() AND verified_at IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR recovery.user_id IS NULL OR p_provider<>'phone' THEN RAISE EXCEPTION 'challenge_expired'; END IF;
    IF uid IS NOT NULL AND uid<>recovery.user_id THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    uid:=recovery.user_id;
  END IF;
  IF p_current_user IS NOT NULL THEN
    IF uid IS NOT NULL AND uid<>p_current_user THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    uid:=p_current_user;
  END IF;
  IF uid IS NULL AND p_provider='google.com' THEN RETURN NULL; END IF;
  IF uid IS NULL THEN
    -- Do not strand a known email account behind a new phone account.
    IF coalesce(p_email,pending.payload->>'email') IS NOT NULL AND EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE lower(email)=lower(coalesce(p_email,pending.payload->>'email'))) THEN RAISE EXCEPTION 'account_recovery_required'; END IF;
    INSERT INTO public.xtimator_accounts(phone,phone_confirmed_at,email,email_confirmed_at,raw_user_meta_data)
      VALUES(p_phone,now(),coalesce(p_email,pending.payload->>'email'),CASE WHEN coalesce(p_email,pending.payload->>'email') IS NOT NULL THEN now() END,
        jsonb_build_object('full_name',coalesce(p_name,pending.payload->>'name'))) RETURNING id INTO uid;
  END IF;
  IF EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE id=uid AND disabled_at IS NOT NULL) THEN RAISE EXCEPTION 'account_disabled'; END IF;
  IF EXISTS(SELECT 1 FROM public.demo_config WHERE user_id=uid) THEN RAISE EXCEPTION 'account_disabled'; END IF;
  -- A previously linked Firebase phone UID cannot reclaim an old phone after
  -- the owner changed it. Changing login phone requires fresh account proof.
  IF p_provider='phone' AND p_current_user IS NULL AND recovery.user_id IS NULL AND pending.user_id IS NULL
    AND EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE id=uid AND phone_confirmed_at IS NOT NULL AND phone<>p_phone)
  THEN RAISE EXCEPTION 'identity_conflict'; END IF;
  IF p_phone IS NOT NULL THEN
    UPDATE public.xtimator_accounts SET phone=p_phone,phone_confirmed_at=now(),updated_at=now() WHERE id=uid;
  END IF;
  INSERT INTO public.xtimator_identities VALUES(p_issuer,p_subject,uid) ON CONFLICT(issuer,subject) DO NOTHING;
  IF p_google_subject IS NOT NULL THEN
    INSERT INTO public.xtimator_identities VALUES('https://accounts.google.com',p_google_subject,uid) ON CONFLICT(issuer,subject) DO NOTHING;
  END IF;
  IF pending.token_hash IS NOT NULL THEN
    INSERT INTO public.xtimator_identities VALUES(pending.payload->>'issuer',pending.payload->>'subject',uid) ON CONFLICT(issuer,subject) DO NOTHING;
    DELETE FROM public.xtimator_auth_challenges WHERE token_hash=pending.token_hash;
  END IF;
  IF recovery.token_hash IS NOT NULL THEN DELETE FROM public.xtimator_auth_challenges WHERE token_hash=recovery.token_hash; END IF;
  RETURN uid;
END $$;

-- Required PostgREST pre-request hook: also covers existing SECURITY DEFINER
-- RPCs, whose owner can bypass table RLS. Installation is explicit in preflight.
CREATE FUNCTION public.xtimator_check_request() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.jwt()->>'role'='authenticated' AND NOT public.xtimator_session_active() THEN
    RAISE EXCEPTION 'Session is no longer valid' USING ERRCODE='42501';
  END IF;
END $$;

CREATE FUNCTION public.xtimator_activate_owned_auth() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(902114783);
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticator'
    AND rolconfig @> ARRAY['pgrst.db_pre_request=public.xtimator_check_request']) THEN
    RAISE EXCEPTION 'owned_auth_request_hook_required';
  END IF;
  -- Pick up Google accounts created during the preparation window, but never
  -- replace an existing binding belonging to another account.
  IF EXISTS(SELECT 1 FROM auth.identities i JOIN public.xtimator_identities x
    ON x.issuer='https://accounts.google.com' AND x.subject=coalesce(i.identity_data->>'sub',i.provider_id)
    WHERE i.provider='google' AND i.user_id<>x.user_id) THEN RAISE EXCEPTION 'identity_conflict'; END IF;
  INSERT INTO public.xtimator_identities(issuer,subject,user_id)
    SELECT 'https://accounts.google.com',coalesce(identity_data->>'sub',provider_id),user_id FROM auth.identities
    WHERE provider='google' AND coalesce(identity_data->>'sub',provider_id) IS NOT NULL ON CONFLICT DO NOTHING;
  UPDATE public.xtimator_auth_control SET active=true WHERE singleton;
END $$;

CREATE FUNCTION public.xtimator_apply_verified_email(p_token text,p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.xtimator_auth_challenges;
BEGIN
  SELECT * INTO c FROM public.xtimator_auth_challenges WHERE token_hash=p_token AND kind='email'
    AND user_id=p_user_id AND verified_at IS NOT NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(902114783);
  IF EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE lower(email)=lower(c.payload->>'email') AND id<>p_user_id) THEN RETURN false; END IF;
  UPDATE public.xtimator_accounts SET email=c.payload->>'email',email_confirmed_at=now(),updated_at=now() WHERE id=p_user_id AND disabled_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.xtimator_auth_challenges WHERE token_hash=p_token;
  RETURN true;
END $$;

-- All identity data and provisioning operations are server-only, including
-- payloads/hashes. Default PUBLIC execute on SECURITY DEFINER must be revoked.
DO $$ DECLARE t text; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['xtimator_auth_control','xtimator_accounts','xtimator_identities','xtimator_sessions','xtimator_auth_challenges','xtimator_auth_limits','xtimator_auth_legacy_fks','xtimator_auth_legacy_functions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'xtimator_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.xtimator_session_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.xtimator_check_request() TO anon,authenticated;

NOTIFY pgrst, 'reload schema';
