-- Google sign-in no longer requires a phone (owner decision 2026-11-19).
-- A verified Google email either reaches the account that already confirmed that
-- address or creates a new account. The phone becomes optional, added later from
-- onboarding or settings. Everything else in the function is unchanged.
SET search_path = public;

CREATE OR REPLACE FUNCTION public.xtimator_complete_identity(p_issuer text,p_subject text,p_provider text,p_phone text,p_email text,p_google_subject text,p_name text,p_pending text,p_recovery text,p_current_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid; candidate uuid; pending public.xtimator_auth_challenges; recovery public.xtimator_auth_challenges; k text;
BEGIN
  IF NOT (SELECT active FROM public.xtimator_auth_control WHERE singleton) THEN RAISE EXCEPTION 'auth_not_activated'; END IF;
  IF p_provider NOT IN ('phone','google.com') OR p_subject IS NULL OR p_subject='' THEN RAISE EXCEPTION 'invalid_identity'; END IF;
  IF p_provider='phone' AND (p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$') THEN RAISE EXCEPTION 'invalid_phone'; END IF;
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
  IF uid IS NULL AND p_provider='google.com' THEN
    -- Without a Google-verified email there is nothing to sign in with: the caller asks for a phone.
    IF p_email IS NULL THEN RETURN NULL; END IF;
    -- Google proves ownership of the address. It reaches the one account that already
    -- confirmed it; an ambiguous or unconfirmed match still goes through recovery.
    IF (SELECT count(*) FROM public.xtimator_accounts WHERE lower(email)=lower(p_email)) > 1 THEN RAISE EXCEPTION 'account_recovery_required'; END IF;
    SELECT id INTO uid FROM public.xtimator_accounts WHERE lower(email)=lower(p_email) AND email_confirmed_at IS NOT NULL;
    IF uid IS NULL AND EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE lower(email)=lower(p_email)) THEN RAISE EXCEPTION 'account_recovery_required'; END IF;
    IF uid IS NULL THEN
      INSERT INTO public.xtimator_accounts(email,email_confirmed_at,raw_user_meta_data)
        VALUES(lower(p_email),now(),jsonb_build_object('full_name',p_name)) RETURNING id INTO uid;
    END IF;
  END IF;
  IF uid IS NULL THEN
    IF coalesce(p_email,pending.payload->>'email') IS NOT NULL AND EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE lower(email)=lower(coalesce(p_email,pending.payload->>'email'))) THEN RAISE EXCEPTION 'account_recovery_required'; END IF;
    INSERT INTO public.xtimator_accounts(phone,phone_confirmed_at,email,email_confirmed_at,raw_user_meta_data)
      VALUES(p_phone,now(),coalesce(p_email,pending.payload->>'email'),CASE WHEN coalesce(p_email,pending.payload->>'email') IS NOT NULL THEN now() END,
        jsonb_build_object('full_name',coalesce(p_name,pending.payload->>'name'))) RETURNING id INTO uid;
  END IF;
  IF EXISTS(SELECT 1 FROM public.xtimator_accounts WHERE id=uid AND disabled_at IS NOT NULL) THEN RAISE EXCEPTION 'account_disabled'; END IF;
  IF EXISTS(SELECT 1 FROM public.demo_config WHERE user_id=uid) THEN RAISE EXCEPTION 'account_disabled'; END IF;
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

-- CREATE OR REPLACE keeps the existing grants; restate them so the function stays server-only.
REVOKE ALL ON FUNCTION public.xtimator_complete_identity(text,text,text,text,text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xtimator_complete_identity(text,text,text,text,text,text,text,text,text,uuid) TO service_role;

-- Onboarding gains an optional phone screen for accounts without a verified phone.
ALTER TABLE public.onboarding_drafts DROP CONSTRAINT onboarding_drafts_step_check;
ALTER TABLE public.onboarding_drafts ADD CONSTRAINT onboarding_drafts_step_check
  CHECK (step IN ('language','companyName','phone','industry','location','brandColor','logo'));

NOTIFY pgrst, 'reload schema';
