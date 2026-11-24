-- Durable acceptance precedes HTTP 200. Service-role only; no browser access.
CREATE TABLE public.whatsapp_webhook_inbox (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','complete')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.whatsapp_webhook_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_webhook_inbox FROM anon, authenticated;
GRANT ALL ON public.whatsapp_webhook_inbox TO service_role;
CREATE INDEX whatsapp_webhook_inbox_pending ON public.whatsapp_webhook_inbox(next_attempt_at)
  WHERE state <> 'complete';

CREATE TABLE public.whatsapp_ingress_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_phone text NOT NULL,
  sender_user_id uuid,
  dispatch_route jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','complete','revoked')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  payload_cleared_at timestamptz
);
ALTER TABLE public.whatsapp_ingress_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_ingress_batches FROM anon, authenticated;
GRANT ALL ON public.whatsapp_ingress_batches TO service_role;
CREATE UNIQUE INDEX whatsapp_ingress_one_live_batch
  ON public.whatsapp_ingress_batches(company_id, owner_phone)
  WHERE state IN ('pending','processing');

CREATE TABLE public.whatsapp_ingress_messages (
  id text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_phone text NOT NULL,
  sender_user_id uuid,
  message jsonb NOT NULL,
  batch_id uuid REFERENCES public.whatsapp_ingress_batches(id),
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_ingress_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_ingress_messages FROM anon, authenticated;
GRANT ALL ON public.whatsapp_ingress_messages TO service_role;
CREATE INDEX whatsapp_ingress_unbatched
  ON public.whatsapp_ingress_messages(company_id, owner_phone, received_at) WHERE batch_id IS NULL;

CREATE FUNCTION public.claim_whatsapp_webhook(p_id text, p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payload jsonb;
BEGIN
  UPDATE public.whatsapp_webhook_inbox SET state='processing', lease_token=p_lease_token,
    lease_until=now()+interval '2 minutes', attempts=attempts+1
  WHERE id=p_id AND next_attempt_at<=now()
    AND (state='pending' OR (state='processing' AND lease_until<now()))
  RETURNING payload INTO v_payload;
  RETURN v_payload;
END $$;

-- One row-locked phone batch. Rows are never deleted during a claim. A crash or
-- queue error leaves the SAME immutable batch/message identity for recovery.
CREATE FUNCTION public.claim_whatsapp_ingress_batch(
  p_company_id uuid, p_owner_phone text, p_lease_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_batch public.whatsapp_ingress_batches;
  v_last timestamptz;
  v_user uuid;
  v_next_actor_at timestamptz;
  v_next_actor_id text;
  v_messages jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_owner_phone, 0));
  SELECT * INTO v_batch FROM public.whatsapp_ingress_batches
    WHERE company_id=p_company_id AND owner_phone=p_owner_phone AND state IN ('pending','processing')
    FOR UPDATE;
  IF FOUND THEN
    IF v_batch.next_attempt_at>now() OR (v_batch.state='processing' AND v_batch.lease_until>=now()) THEN
      RETURN NULL;
    END IF;
  ELSE
    SELECT max(received_at) INTO v_last FROM public.whatsapp_ingress_messages
      WHERE company_id=p_company_id AND owner_phone=p_owner_phone AND batch_id IS NULL;
    IF v_last IS NULL OR v_last>now()-interval '5 seconds' THEN RETURN NULL; END IF;
    SELECT sender_user_id INTO v_user FROM public.whatsapp_ingress_messages
      WHERE company_id=p_company_id AND owner_phone=p_owner_phone AND batch_id IS NULL
        AND received_at<=v_last
      ORDER BY received_at, id LIMIT 1;
    -- Keep the oldest contiguous actor partition. A revoked sender's rows
    -- cannot make a newer authorized sender's messages fail the same batch.
    SELECT received_at,id INTO v_next_actor_at,v_next_actor_id
      FROM public.whatsapp_ingress_messages
      WHERE company_id=p_company_id AND owner_phone=p_owner_phone AND batch_id IS NULL
        AND received_at<=v_last AND sender_user_id IS DISTINCT FROM v_user
      ORDER BY received_at,id LIMIT 1;
    INSERT INTO public.whatsapp_ingress_batches(company_id,owner_phone,sender_user_id)
      VALUES (p_company_id,p_owner_phone,v_user) RETURNING * INTO v_batch;
    UPDATE public.whatsapp_ingress_messages SET batch_id=v_batch.id
      WHERE id IN (SELECT id FROM public.whatsapp_ingress_messages
        WHERE company_id=p_company_id AND owner_phone=p_owner_phone AND batch_id IS NULL
          AND received_at<=v_last AND sender_user_id IS NOT DISTINCT FROM v_user
          AND (v_next_actor_at IS NULL OR (received_at,id)<(v_next_actor_at,v_next_actor_id))
        ORDER BY received_at,id LIMIT 25);
  END IF;
  UPDATE public.whatsapp_ingress_batches SET state='processing', lease_token=p_lease_token,
    lease_until=now()+interval '2 minutes', attempts=attempts+1 WHERE id=v_batch.id;
  SELECT jsonb_agg(jsonb_build_object('message',message,'senderUserId',sender_user_id) ORDER BY received_at,id)
    INTO v_messages FROM public.whatsapp_ingress_messages WHERE batch_id=v_batch.id;
  RETURN jsonb_build_object('id',v_batch.id,'companyId',p_company_id,
    'ownerPhone',p_owner_phone,'senderUserId',v_batch.sender_user_id,
    'route',v_batch.dispatch_route,'entries',v_messages);
END $$;

-- Recovery enumerates both orphaned messages and previously claimed batches.
CREATE FUNCTION public.due_whatsapp_ingress_phones(p_limit integer DEFAULT 100)
RETURNS TABLE(company_id uuid, owner_phone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT q.company_id,q.owner_phone FROM (
    SELECT m.company_id,m.owner_phone FROM public.whatsapp_ingress_messages m
      WHERE m.batch_id IS NULL GROUP BY m.company_id,m.owner_phone
      HAVING max(m.received_at)<=now()-interval '5 seconds'
    UNION
    SELECT b.company_id,b.owner_phone FROM public.whatsapp_ingress_batches b
      WHERE b.next_attempt_at<=now() AND (b.state='pending' OR (b.state='processing' AND b.lease_until<now()))
  ) q ORDER BY q.company_id,q.owner_phone LIMIT greatest(1,least(p_limit,1000));
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_webhook(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_whatsapp_ingress_batch(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.due_whatsapp_ingress_phones(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_webhook(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_ingress_batch(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.due_whatsapp_ingress_phones(integer) TO service_role;
