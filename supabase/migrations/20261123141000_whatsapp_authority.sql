-- Separate an explicit phone-only admin grant from a linked account whose FK
-- may later become NULL, and an admin suspension from a verified phone change.
ALTER TABLE public.whatsapp_authorized_senders
  ADD COLUMN admin_phone_only boolean NOT NULL DEFAULT false,
  ADD COLUMN suspension_reason text CHECK (suspension_reason IN ('admin', 'phone_change', 'membership_removed')),
  ADD CONSTRAINT whatsapp_admin_phone_only_requires_admin CHECK (
    NOT admin_phone_only OR (user_id IS NULL AND created_by_admin IS TRUE)
  );

-- Only preserve phone-only grants explicitly recorded by an administrator.
-- A legacy auto-link could attach a user without writing an audit event. Guard
-- against a later account deletion returning those rows to a NULL user_id.
UPDATE public.whatsapp_authorized_senders AS sender
SET admin_phone_only = true,
    verified_at = COALESCE(sender.verified_at, sender.created_at)
WHERE sender.user_id IS NULL AND sender.created_by_admin IS TRUE
  AND EXISTS (
    SELECT 1 FROM (
      SELECT audit.metadata, audit.created_at
      FROM public.admin_audit_log AS audit
      WHERE audit.target_type = 'whatsapp_sender'
        AND audit.target_id = sender.id::text
        AND audit.action = 'whatsapp.sender.save'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) AS last_save
    WHERE last_save.metadata -> 'userId' = 'null'::jsonb
      AND last_save.metadata ->> 'companyId' = sender.company_id::text
      AND last_save.metadata ->> 'phoneLast4' = right(sender.phone_e164, 4)
      AND last_save.created_at >= sender.updated_at
  );

-- Older writes did not record a reason. Treat those suspensions as explicit
-- until reviewed so a previous admin decision cannot be undone automatically.
UPDATE public.whatsapp_authorized_senders
SET suspension_reason = 'admin'
WHERE status = 'suspended';

-- An ambiguous legacy phone remains visible for explicit administrator review.
UPDATE public.whatsapp_authorized_senders
SET status = 'suspended', suspension_reason = 'admin', updated_at = now()
WHERE status = 'active' AND user_id IS NULL AND NOT admin_phone_only;

-- Removals before this trigger was installed could leave a linked phone active.
UPDATE public.whatsapp_authorized_senders AS sender
SET status = 'suspended', suspension_reason = 'membership_removed', updated_at = now()
WHERE sender.status <> 'suspended' AND sender.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.companies AS company
    WHERE company.id = sender.company_id AND company.user_id = sender.user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.company_members AS membership
    WHERE membership.company_id = sender.company_id AND membership.user_id = sender.user_id
  );

-- Release numbers carried by stale linked senders. Only the same account can
-- automatically reactivate one of these after it verifies that phone again.
UPDATE public.whatsapp_authorized_senders AS sender
SET status = 'suspended', suspension_reason = 'phone_change', updated_at = now()
FROM public.xtimator_accounts AS account
WHERE sender.status = 'active' AND sender.user_id = account.id
  AND (account.phone_confirmed_at IS NULL OR account.phone IS DISTINCT FROM sender.phone_e164);

CREATE FUNCTION public.whatsapp_linked_identity_is_current(
  p_company_id uuid, p_user_id uuid, p_phone_e164 text
) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.xtimator_accounts AS account
    WHERE account.id = p_user_id
      AND account.disabled_at IS NULL
      AND account.phone_confirmed_at IS NOT NULL
      AND account.phone = p_phone_e164
  ) AND (
    EXISTS (
      SELECT 1 FROM public.companies AS company
      WHERE company.id = p_company_id AND company.user_id = p_user_id
    ) OR EXISTS (
      SELECT 1 FROM public.company_members AS membership
      WHERE membership.company_id = p_company_id AND membership.user_id = p_user_id
    )
  );
$$;
REVOKE ALL ON FUNCTION public.whatsapp_linked_identity_is_current(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_linked_identity_is_current(uuid, uuid, text) TO service_role;

-- One statement sees sender, configuration, account, and membership in the
-- same snapshot. Surface up to two active rows so ambiguity fails closed.
CREATE FUNCTION public.resolve_whatsapp_sender_authority(p_phone_e164 text)
RETURNS TABLE (company_id uuid, user_id uuid, phone_e164 text, authorized boolean)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT sender.company_id, sender.user_id, sender.phone_e164,
    COALESCE(config.status = 'active', false) AND sender.suspension_reason IS NULL AND (
      (sender.user_id IS NULL AND sender.admin_phone_only) OR
      (sender.user_id IS NOT NULL AND public.whatsapp_linked_identity_is_current(
        sender.company_id, sender.user_id, sender.phone_e164
      ))
    ) AS authorized
  FROM public.whatsapp_authorized_senders AS sender
  LEFT JOIN public.whatsapp_company_configs AS config
    ON config.id = sender.config_id AND config.company_id = sender.company_id
  WHERE sender.phone_e164 = p_phone_e164 AND sender.status = 'active'
  LIMIT 2;
$$;
REVOKE ALL ON FUNCTION public.resolve_whatsapp_sender_authority(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_sender_authority(text) TO service_role;

-- A role edit leaves authority intact. Deleting or moving the membership and
-- revoking its linked sender records happen in the same database transaction.
CREATE FUNCTION public.revoke_whatsapp_sender_on_membership_loss() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id AND OLD.company_id = NEW.company_id THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companies AS company
    WHERE company.id = OLD.company_id AND company.user_id = OLD.user_id
  ) THEN
    UPDATE public.whatsapp_authorized_senders
    SET status = 'suspended', suspension_reason = 'membership_removed', updated_at = now()
    WHERE company_id = OLD.company_id AND user_id = OLD.user_id
      AND suspension_reason IS DISTINCT FROM 'admin';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_whatsapp_sender_on_membership_loss() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER revoke_whatsapp_sender_on_membership_loss
AFTER DELETE OR UPDATE OF user_id, company_id ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.revoke_whatsapp_sender_on_membership_loss();

-- Guard against races with membership removal at activation. Give an FK
-- unlink a suspension instead of leaving an active but unusable phone claimed.
CREATE FUNCTION public.guard_whatsapp_sender_authority_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL AND NOT NEW.admin_phone_only THEN
    NEW.status := 'suspended';
    NEW.suspension_reason := CASE WHEN OLD.suspension_reason = 'admin' THEN 'admin' ELSE 'membership_removed' END;
    NEW.updated_at := now();
  END IF;

  IF NEW.status = 'suspended' THEN
    NEW.suspension_reason := COALESCE(NEW.suspension_reason, 'admin');
    RETURN NEW;
  END IF;

  IF NEW.suspension_reason IS NOT NULL THEN
    RAISE EXCEPTION 'A suspended WhatsApp sender must be reviewed before activation' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'active' AND NEW.user_id IS NULL AND NOT NEW.admin_phone_only THEN
    RAISE EXCEPTION 'An unlinked WhatsApp sender requires explicit admin approval' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'active' AND NEW.user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.companies AS company
      WHERE company.id = NEW.company_id AND company.user_id = NEW.user_id
    ) THEN
      PERFORM 1 FROM public.company_members AS membership
      WHERE membership.company_id = NEW.company_id AND membership.user_id = NEW.user_id
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'WhatsApp sender is no longer a member of this company' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NOT public.whatsapp_linked_identity_is_current(NEW.company_id, NEW.user_id, NEW.phone_e164) THEN
      RAISE EXCEPTION 'WhatsApp sender requires the verified phone of an enabled account' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_whatsapp_sender_authority_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_whatsapp_sender_authority_write
BEFORE INSERT OR UPDATE OF status, user_id, company_id, phone_e164, admin_phone_only, suspension_reason
ON public.whatsapp_authorized_senders
FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_sender_authority_write();

-- Store no message content or phone number. A crash/transport failure after a
-- claim is an unknown provider outcome and must not issue another send.
CREATE TABLE public.notification_channel_send_claims (
  event_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'rejected', 'needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, channel)
);
ALTER TABLE public.notification_channel_send_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_channel_send_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channel_send_claims TO service_role;
COMMENT ON TABLE public.notification_channel_send_claims IS
  'Notification delivery idempotency. An old sending row or a needs_review row represents an uncertain provider outcome and requires review before any resend.';
