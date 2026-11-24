-- Keep WhatsApp session replacement, command claims, and delivery evidence durable.
-- These functions are available only to the server-side service role.

CREATE TABLE public.whatsapp_estimate_session_watermarks (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  requested_at timestamptz NOT NULL,
  session_id uuid NOT NULL,
  sender_user_id uuid,
  PRIMARY KEY (company_id, phone_number)
);

CREATE TABLE public.whatsapp_estimate_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  sender_user_id uuid,
  session_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  command_kind text NOT NULL CHECK (command_kind IN ('send', 'cancel', 'regenerate', 'edit')),
  command_key text NOT NULL,
  attempt_id uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  UNIQUE (company_id, phone_number, message_id, command_key)
);
CREATE INDEX whatsapp_estimate_commands_active_session
  ON public.whatsapp_estimate_commands (session_id, lease_expires_at) WHERE finished_at IS NULL;

CREATE TABLE public.whatsapp_estimate_delivery_channels (
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  command_id uuid REFERENCES public.whatsapp_estimate_commands(id) ON DELETE SET NULL,
  attempt_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  status text NOT NULL CHECK (status IN ('dispatching', 'sent', 'unverified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (estimate_id, channel)
);

ALTER TABLE public.whatsapp_estimate_session_watermarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_estimate_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_estimate_delivery_channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_estimate_session_watermarks,
  public.whatsapp_estimate_commands, public.whatsapp_estimate_delivery_channels TO service_role;

CREATE FUNCTION public.whatsapp_estimate_owner_lock(p_company_id uuid, p_phone_number text)
RETURNS void LANGUAGE sql SET search_path = public, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('whatsapp-estimate:' || p_company_id::text || ':' || p_phone_number, 0));
$$;

CREATE FUNCTION public.whatsapp_estimate_actor_is_authorized(p_company_id uuid, p_phone_number text, p_sender_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT count(*) = 1 AND coalesce(bool_and(a.authorized AND a.company_id = p_company_id
    AND a.user_id IS NOT DISTINCT FROM p_sender_user_id), false)
  FROM public.resolve_whatsapp_sender_authority(p_phone_number) AS a;
$$;

CREATE FUNCTION public.whatsapp_open_estimate_session(
  p_company_id uuid, p_phone_number text, p_sender_user_id uuid, p_project_id uuid, p_estimate_id uuid,
  p_state text, p_requested_at timestamptz, p_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_watermark public.whatsapp_estimate_session_watermarks%ROWTYPE;
  v_session_id uuid;
BEGIN
  PERFORM public.whatsapp_estimate_owner_lock(p_company_id, p_phone_number);
  IF p_requested_at IS NULL OR p_expires_at IS NULL OR p_expires_at <= clock_timestamp()
     OR NOT public.whatsapp_estimate_actor_is_authorized(p_company_id, p_phone_number, p_sender_user_id)
     OR p_state IS NULL OR p_state NOT IN ('awaiting_confirm', 'awaiting_details')
     OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND company_id = p_company_id)
     OR (p_state = 'awaiting_details' AND p_estimate_id IS NOT NULL)
     OR (p_state = 'awaiting_confirm' AND NOT EXISTS (
       SELECT 1 FROM public.estimates WHERE id = p_estimate_id AND company_id = p_company_id
         AND project_id = p_project_id AND is_current AND NOT generation_staged
     )) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_watermark FROM public.whatsapp_estimate_session_watermarks
    WHERE company_id = p_company_id AND phone_number = p_phone_number;
  IF v_watermark.requested_at > p_requested_at THEN
    RETURN false;
  END IF;
  IF v_watermark.requested_at = p_requested_at THEN
    RETURN v_watermark.sender_user_id IS NOT DISTINCT FROM p_sender_user_id
      AND EXISTS (SELECT 1 FROM public.whatsapp_sessions
      WHERE id = v_watermark.session_id AND company_id = p_company_id AND phone_number = p_phone_number
        AND draft_project_id = p_project_id AND draft_estimate_id IS NOT DISTINCT FROM p_estimate_id
        AND state = p_state AND expires_at > clock_timestamp());
  END IF;
  IF v_watermark.session_id IS NULL AND EXISTS (
    SELECT 1 FROM public.whatsapp_sessions WHERE company_id = p_company_id
      AND phone_number = p_phone_number AND created_at > p_requested_at AND expires_at > clock_timestamp()
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.whatsapp_sessions (company_id, phone_number, state, draft_project_id, draft_estimate_id, expires_at)
    VALUES (p_company_id, p_phone_number, p_state, p_project_id, p_estimate_id, p_expires_at)
    RETURNING id INTO v_session_id;
  INSERT INTO public.whatsapp_estimate_session_watermarks (company_id, phone_number, requested_at, session_id, sender_user_id)
    VALUES (p_company_id, p_phone_number, p_requested_at, v_session_id, p_sender_user_id)
    ON CONFLICT (company_id, phone_number) DO UPDATE SET
      requested_at = excluded.requested_at, session_id = excluded.session_id, sender_user_id = excluded.sender_user_id;
  DELETE FROM public.whatsapp_sessions WHERE company_id = p_company_id AND phone_number = p_phone_number
    AND id <> v_session_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.whatsapp_claim_estimate_command(
  p_company_id uuid, p_phone_number text, p_sender_user_id uuid, p_session_id uuid, p_project_id uuid, p_estimate_id uuid,
  p_message_id text, p_command_kind text, p_command_key text, p_attempt_id uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_session public.whatsapp_sessions%ROWTYPE;
  v_estimate public.estimates%ROWTYPE;
  v_command public.whatsapp_estimate_commands%ROWTYPE;
BEGIN
  PERFORM public.whatsapp_estimate_owner_lock(p_company_id, p_phone_number);
  IF NOT public.whatsapp_estimate_actor_is_authorized(p_company_id, p_phone_number, p_sender_user_id) THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  SELECT * INTO v_command FROM public.whatsapp_estimate_commands
    WHERE company_id = p_company_id AND phone_number = p_phone_number
      AND message_id = p_message_id AND command_key = p_command_key FOR UPDATE;
  IF v_command.finished_at IS NOT NULL OR (v_command.id IS NOT NULL AND
    (v_command.session_id <> p_session_id OR v_command.sender_user_id IS DISTINCT FROM p_sender_user_id)) THEN
    RETURN jsonb_build_object('status', 'replayed');
  END IF;

  SELECT * INTO v_session FROM public.whatsapp_sessions
    WHERE company_id = p_company_id AND phone_number = p_phone_number AND expires_at > clock_timestamp()
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_session.id IS DISTINCT FROM p_session_id OR v_session.state IS DISTINCT FROM 'awaiting_confirm'
     OR v_session.draft_project_id IS DISTINCT FROM p_project_id
     OR v_session.draft_estimate_id IS DISTINCT FROM p_estimate_id
     OR EXISTS (SELECT 1 FROM public.whatsapp_estimate_session_watermarks
       WHERE company_id = p_company_id AND phone_number = p_phone_number AND session_id = p_session_id
         AND sender_user_id IS DISTINCT FROM p_sender_user_id) THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  SELECT * INTO v_estimate FROM public.estimates
    WHERE id = p_estimate_id AND company_id = p_company_id AND project_id = p_project_id
      AND is_current AND NOT generation_staged FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND company_id = p_company_id) THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  IF p_command_kind <> 'cancel' AND (v_estimate.client_response IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = p_estimate_id
  )) THEN
    RETURN jsonb_build_object('status', 'answered');
  END IF;
  IF p_command_kind IN ('send', 'regenerate') AND (v_estimate.sent_at IS NOT NULL OR v_estimate.status = 'sent')
     AND NOT (p_command_kind = 'send' AND EXISTS (
       SELECT 1 FROM public.whatsapp_estimate_delivery_channels
         WHERE estimate_id = p_estimate_id AND company_id = p_company_id AND status = 'sent'
     )) THEN
    RETURN jsonb_build_object('status', 'already_sent');
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_estimate_commands WHERE session_id = p_session_id
               AND finished_at IS NULL AND lease_expires_at > clock_timestamp()) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  INSERT INTO public.whatsapp_estimate_commands (
    company_id, phone_number, sender_user_id, session_id, project_id, estimate_id, message_id,
    command_kind, command_key, attempt_id, lease_expires_at
  ) VALUES (
    p_company_id, p_phone_number, p_sender_user_id, p_session_id, p_project_id, p_estimate_id, p_message_id,
    p_command_kind, p_command_key, p_attempt_id, clock_timestamp() + interval '10 minutes'
  ) ON CONFLICT (company_id, phone_number, message_id, command_key) DO UPDATE SET
    attempt_id = excluded.attempt_id, lease_expires_at = excluded.lease_expires_at
    RETURNING * INTO v_command;
  RETURN jsonb_build_object('status', 'claimed', 'command_id', v_command.id);
END;
$$;

CREATE FUNCTION public.whatsapp_require_estimate_command(p_command_id uuid, p_attempt_id uuid, p_kind text)
RETURNS public.whatsapp_estimate_commands LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_command public.whatsapp_estimate_commands%ROWTYPE;
  v_session public.whatsapp_sessions%ROWTYPE;
  v_estimate public.estimates%ROWTYPE;
BEGIN
  SELECT * INTO v_command FROM public.whatsapp_estimate_commands WHERE id = p_command_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'whatsapp_estimate_session_stale';
  END IF;
  PERFORM public.whatsapp_estimate_owner_lock(v_command.company_id, v_command.phone_number);
  IF NOT public.whatsapp_estimate_actor_is_authorized(v_command.company_id, v_command.phone_number, v_command.sender_user_id) THEN
    RAISE EXCEPTION 'whatsapp_estimate_session_stale';
  END IF;
  IF p_kind = 'regenerate' THEN
    -- Match activate_estimate_version's lock order before locking the estimate.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_command.project_id::text, 0));
  END IF;
  SELECT * INTO v_command FROM public.whatsapp_estimate_commands
    WHERE id = p_command_id AND attempt_id = p_attempt_id AND command_kind = p_kind
      AND finished_at IS NULL AND lease_expires_at > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'whatsapp_estimate_session_stale';
  END IF;
  SELECT * INTO v_session FROM public.whatsapp_sessions
    WHERE company_id = v_command.company_id AND phone_number = v_command.phone_number
      AND expires_at > clock_timestamp() ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_session.id IS DISTINCT FROM v_command.session_id OR v_session.state IS DISTINCT FROM 'awaiting_confirm'
     OR v_session.draft_estimate_id IS DISTINCT FROM v_command.estimate_id
     OR v_session.draft_project_id IS DISTINCT FROM v_command.project_id THEN
    RAISE EXCEPTION 'whatsapp_estimate_session_stale';
  END IF;
  SELECT * INTO v_estimate FROM public.estimates WHERE id = v_command.estimate_id
    AND company_id = v_command.company_id AND project_id = v_command.project_id
    AND is_current AND NOT generation_staged FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'whatsapp_estimate_session_stale';
  END IF;
  IF p_kind <> 'cancel' AND (v_estimate.client_response IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = v_estimate.id
  )) THEN
    RAISE EXCEPTION 'whatsapp_estimate_answered';
  END IF;
  IF p_kind = 'regenerate' AND (v_estimate.sent_at IS NOT NULL OR v_estimate.status = 'sent'
       OR v_estimate.total IS NULL OR v_estimate.total <= 0) THEN
    -- A real confirmation version is never treated as a disposable blank.
    RAISE EXCEPTION 'whatsapp_estimate_session_stale';
  END IF;
  IF p_kind = 'send' AND (v_estimate.sent_at IS NOT NULL OR v_estimate.status = 'sent') AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_estimate_delivery_channels
      WHERE estimate_id = v_estimate.id AND company_id = v_command.company_id AND status = 'sent'
  ) THEN
    RAISE EXCEPTION 'whatsapp_estimate_already_sent';
  END IF;
  RETURN v_command;
END;
$$;

CREATE FUNCTION public.whatsapp_finish_estimate_command(p_command_id uuid, p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_command public.whatsapp_estimate_commands%ROWTYPE;
BEGIN
  SELECT * INTO v_command FROM public.whatsapp_estimate_commands WHERE id = p_command_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.whatsapp_estimate_owner_lock(v_command.company_id, v_command.phone_number);
  UPDATE public.whatsapp_estimate_commands SET finished_at = clock_timestamp()
    WHERE id = p_command_id AND attempt_id = p_attempt_id AND finished_at IS NULL
    RETURNING * INTO v_command;
  IF FOUND AND v_command.command_kind = 'send' AND EXISTS (
    SELECT 1 FROM public.whatsapp_estimate_delivery_channels
      WHERE estimate_id = v_command.estimate_id AND company_id = v_command.company_id AND status = 'sent'
  ) THEN
    DELETE FROM public.whatsapp_sessions AS previous USING public.whatsapp_sessions AS completed
      WHERE completed.id = v_command.session_id AND completed.company_id = v_command.company_id
        AND completed.phone_number = v_command.phone_number AND completed.draft_estimate_id = v_command.estimate_id
        AND previous.company_id = completed.company_id AND previous.phone_number = completed.phone_number
        AND (previous.created_at, previous.id) <= (completed.created_at, completed.id);
  END IF;
END;
$$;

CREATE FUNCTION public.whatsapp_cancel_estimate_session(p_command_id uuid, p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_command public.whatsapp_estimate_commands%ROWTYPE;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'cancel');
  -- Discard the conversation, preserving recordings, photos, and all versions.
  DELETE FROM public.whatsapp_sessions
    WHERE company_id = v_command.company_id AND phone_number = v_command.phone_number;
  PERFORM public.whatsapp_finish_estimate_command(p_command_id, p_attempt_id);
END;
$$;

CREATE FUNCTION public.whatsapp_prepare_estimate_delivery(
  p_command_id uuid, p_attempt_id uuid, p_client_id uuid, p_share_expires_at timestamptz
) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_command public.whatsapp_estimate_commands%ROWTYPE;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'send');
  PERFORM id FROM public.projects WHERE id = v_command.project_id AND company_id = v_command.company_id
    AND client_id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'whatsapp_estimate_session_stale'; END IF;
  UPDATE public.estimates SET workflow_status = 'consolidated',
    consolidated_at = coalesce(consolidated_at, clock_timestamp()), share_expires_at = p_share_expires_at
    WHERE id = v_command.estimate_id AND company_id = v_command.company_id;
END;
$$;

CREATE FUNCTION public.whatsapp_claim_estimate_delivery_channel(
  p_command_id uuid, p_attempt_id uuid, p_client_id uuid, p_channel text
) RETURNS text LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_command public.whatsapp_estimate_commands%ROWTYPE;
  v_status text;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'send');
  PERFORM id FROM public.projects WHERE id = v_command.project_id AND company_id = v_command.company_id
    AND client_id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'whatsapp_estimate_session_stale'; END IF;
  INSERT INTO public.whatsapp_estimate_delivery_channels (estimate_id, company_id, command_id, attempt_id, channel, status)
    VALUES (v_command.estimate_id, v_command.company_id, p_command_id, p_attempt_id, p_channel, 'dispatching')
    ON CONFLICT (estimate_id, channel) DO NOTHING;
  IF FOUND THEN RETURN 'claimed'; END IF;
  SELECT status INTO v_status FROM public.whatsapp_estimate_delivery_channels
    WHERE estimate_id = v_command.estimate_id AND company_id = v_command.company_id AND channel = p_channel;
  RETURN v_status;
END;
$$;

CREATE FUNCTION public.whatsapp_record_estimate_delivery_channel(
  p_command_id uuid, p_attempt_id uuid, p_channel text, p_client_id uuid,
  p_recipient_email text, p_recipient_phone text, p_provider_message_id text,
  p_sent boolean, p_error text
) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_command public.whatsapp_estimate_commands%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- The channel's durable reservation is the authority once dispatch starts.
  -- Record its result even if the session expires or is replaced during IO.
  SELECT * INTO v_command FROM public.whatsapp_estimate_commands WHERE id = p_command_id;
  PERFORM id FROM public.estimates WHERE id = v_command.estimate_id AND company_id = v_command.company_id FOR UPDATE;
  UPDATE public.whatsapp_estimate_delivery_channels SET status = CASE WHEN p_sent THEN 'sent' ELSE 'unverified' END
    WHERE estimate_id = v_command.estimate_id AND company_id = v_command.company_id
      AND command_id = p_command_id AND attempt_id = p_attempt_id AND channel = p_channel AND status = 'dispatching';
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.estimate_deliveries (estimate_id, company_id, channel, format, recipient_email, recipient_phone,
    provider, provider_message_id, status, error_message, sent_at)
    VALUES (v_command.estimate_id, v_command.company_id, p_channel, 'online_link', p_recipient_email, p_recipient_phone,
      CASE WHEN p_channel = 'email' THEN 'resend' ELSE 'twilio' END, p_provider_message_id,
      CASE WHEN p_sent THEN 'sent' ELSE 'failed' END, p_error, CASE WHEN p_sent THEN v_now ELSE NULL END);
  IF p_sent THEN
    UPDATE public.estimates SET sent_at = coalesce(sent_at, v_now),
      status = CASE WHEN status = 'draft' AND client_response IS NULL THEN 'sent' ELSE status END
      WHERE id = v_command.estimate_id AND company_id = v_command.company_id;
    UPDATE public.projects SET status = 'sent'
      WHERE id = v_command.project_id AND company_id = v_command.company_id
        AND status IN ('draft', 'estimate_ready') AND EXISTS (
          SELECT 1 FROM public.estimates WHERE id = v_command.estimate_id AND is_current AND client_response IS NULL
        );
    UPDATE public.clients SET preferred_language = (
      SELECT language FROM public.estimates WHERE id = v_command.estimate_id AND company_id = v_command.company_id
    ) WHERE id = p_client_id AND company_id = v_command.company_id AND preferred_language IS NULL;
    INSERT INTO public.estimate_activity (project_id, company_id, estimate_id, event_type, metadata)
      VALUES (v_command.project_id, v_command.company_id, v_command.estimate_id, 'estimate_sent',
        jsonb_build_object('channel', p_channel, 'via', 'whatsapp-bot'));
  END IF;
END;
$$;

CREATE FUNCTION public.whatsapp_activate_regenerated_estimate(
  p_command_id uuid, p_attempt_id uuid, p_estimate_id uuid, p_project_update jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_command public.whatsapp_estimate_commands%ROWTYPE;
  v_result jsonb;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'regenerate');
  v_result := public.activate_estimate_version(
    v_command.company_id, v_command.project_id, p_estimate_id, v_command.estimate_id, p_project_update
  );
  UPDATE public.whatsapp_sessions SET draft_estimate_id = p_estimate_id
    WHERE id = v_command.session_id AND company_id = v_command.company_id AND phone_number = v_command.phone_number;
  PERFORM public.whatsapp_finish_estimate_command(p_command_id, p_attempt_id);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.whatsapp_update_estimate_header(p_command_id uuid, p_attempt_id uuid, p_patch jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_command public.whatsapp_estimate_commands%ROWTYPE;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'edit');
  UPDATE public.estimates SET
    timeline = CASE WHEN p_patch ? 'timeline' THEN p_patch->>'timeline' ELSE timeline END,
    payment_terms = CASE WHEN p_patch ? 'payment_terms' THEN p_patch->>'payment_terms' ELSE payment_terms END,
    summary = CASE WHEN p_patch ? 'summary' THEN p_patch->>'summary' ELSE summary END
    WHERE id = v_command.estimate_id AND company_id = v_command.company_id;
  PERFORM public.whatsapp_finish_estimate_command(p_command_id, p_attempt_id);
END;
$$;

CREATE FUNCTION public.whatsapp_set_estimate_client(
  p_command_id uuid, p_attempt_id uuid, p_name text, p_phone text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_command public.whatsapp_estimate_commands%ROWTYPE;
  v_client_id uuid;
  v_is_new boolean;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'edit');
  IF coalesce(btrim(p_name), '') = '' OR p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_whatsapp_estimate_contact';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp-estimate-client:' || v_command.company_id || ':' || p_phone, 0));
  IF (SELECT count(*) FROM public.clients WHERE company_id = v_command.company_id AND phone = p_phone) > 1 THEN
    RAISE EXCEPTION 'ambiguous_whatsapp_estimate_contact';
  END IF;
  SELECT id INTO v_client_id FROM public.clients WHERE company_id = v_command.company_id AND phone = p_phone;
  v_is_new := NOT FOUND;
  IF v_is_new THEN
    INSERT INTO public.clients (company_id, name, phone) VALUES (v_command.company_id, p_name, p_phone)
      RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients SET name = p_name WHERE id = v_client_id AND company_id = v_command.company_id;
  END IF;
  UPDATE public.projects SET client_id = v_client_id WHERE id = v_command.project_id AND company_id = v_command.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'whatsapp_estimate_session_stale'; END IF;
  PERFORM public.whatsapp_finish_estimate_command(p_command_id, p_attempt_id);
  RETURN jsonb_build_object('client_id', v_client_id, 'is_new', v_is_new);
END;
$$;

CREATE FUNCTION public.whatsapp_commit_estimate_item_edit(
  p_command_id uuid, p_attempt_id uuid, p_expected_updated_at timestamptz, p_operation text,
  p_section_id uuid, p_item jsonb, p_totals jsonb, p_sections jsonb, p_items jsonb
) RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_command public.whatsapp_estimate_commands%ROWTYPE;
  v_item_id uuid := (p_item->>'id')::uuid;
  v_count integer;
BEGIN
  v_command := public.whatsapp_require_estimate_command(p_command_id, p_attempt_id, 'edit');
  IF p_expected_updated_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.estimates WHERE id = v_command.estimate_id AND updated_at = p_expected_updated_at
  ) THEN
    RAISE EXCEPTION 'whatsapp_estimate_changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estimate_sections WHERE id = p_section_id
    AND estimate_id = v_command.estimate_id AND company_id = v_command.company_id) THEN
    RAISE EXCEPTION 'whatsapp_estimate_changed';
  END IF;

  IF p_operation = 'add' THEN
    INSERT INTO public.estimate_items (id, section_id, company_id, description, quantity, unit,
      unit_price, total, sort_order, price_source)
      VALUES (v_item_id, p_section_id, v_command.company_id, p_item->>'description',
        (p_item->>'quantity')::numeric, NULL, (p_item->>'unit_price')::numeric, 0,
        (p_item->>'sort_order')::integer, NULL);
  ELSIF p_operation = 'update' THEN
    UPDATE public.estimate_items SET description = p_item->>'description', quantity = (p_item->>'quantity')::numeric,
      markup_pct = (p_item->>'markup_pct')::numeric,
      price_source = CASE WHEN (p_item->>'manual_price')::boolean THEN NULL ELSE price_source END
      WHERE id = v_item_id AND section_id = p_section_id AND company_id = v_command.company_id;
  ELSIF p_operation = 'remove' THEN
    DELETE FROM public.estimate_items WHERE id = v_item_id AND section_id = p_section_id AND company_id = v_command.company_id;
  ELSE
    RAISE EXCEPTION 'invalid_whatsapp_estimate_item_operation';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'whatsapp_estimate_changed'; END IF;

  UPDATE public.estimate_items AS i SET unit_price = payload.unit_price, total = payload.total
    FROM jsonb_to_recordset(p_items) AS payload(id uuid, unit_price numeric, total numeric), public.estimate_sections AS s
    WHERE i.id = payload.id AND i.company_id = v_command.company_id AND s.id = i.section_id
      AND s.company_id = v_command.company_id AND s.estimate_id = v_command.estimate_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(p_items) OR v_count <> (
    SELECT count(*) FROM public.estimate_items i JOIN public.estimate_sections s ON s.id = i.section_id
      WHERE s.estimate_id = v_command.estimate_id
  ) THEN RAISE EXCEPTION 'whatsapp_estimate_changed'; END IF;

  UPDATE public.estimate_sections AS s SET subtotal = payload.subtotal
    FROM jsonb_to_recordset(p_sections) AS payload(id uuid, subtotal numeric)
    WHERE s.id = payload.id AND s.company_id = v_command.company_id AND s.estimate_id = v_command.estimate_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(p_sections) OR v_count <> (
    SELECT count(*) FROM public.estimate_sections WHERE estimate_id = v_command.estimate_id
  ) THEN RAISE EXCEPTION 'whatsapp_estimate_changed'; END IF;

  UPDATE public.estimates SET subtotal = (p_totals->>'subtotal')::numeric,
    discount_amount = (p_totals->>'discount_amount')::numeric, tax_amount = (p_totals->>'tax_amount')::numeric,
    total = (p_totals->>'total')::numeric, balance_due = (p_totals->>'balance_due')::numeric
    WHERE id = v_command.estimate_id AND company_id = v_command.company_id;
  UPDATE public.projects SET total = (p_totals->>'total')::numeric
    WHERE id = v_command.project_id AND company_id = v_command.company_id;
  PERFORM public.whatsapp_finish_estimate_command(p_command_id, p_attempt_id);
END;
$$;
DO $$
DECLARE v_function record;
BEGIN
  FOR v_function IN
    SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'whatsapp_estimate_owner_lock', 'whatsapp_estimate_actor_is_authorized',
        'whatsapp_open_estimate_session', 'whatsapp_claim_estimate_command',
        'whatsapp_require_estimate_command', 'whatsapp_finish_estimate_command', 'whatsapp_cancel_estimate_session',
        'whatsapp_prepare_estimate_delivery', 'whatsapp_claim_estimate_delivery_channel',
        'whatsapp_record_estimate_delivery_channel', 'whatsapp_activate_regenerated_estimate',
        'whatsapp_update_estimate_header', 'whatsapp_set_estimate_client', 'whatsapp_commit_estimate_item_edit'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function.signature);
  END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';
