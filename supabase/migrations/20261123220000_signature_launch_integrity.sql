-- Digital-signature release gate. Apply manually before deploying the callers.
-- No evidence backfill: historical totals/party identities cannot be invented.
-- P0022/P0011 retain the existing locked-document error meanings.

CREATE OR REPLACE FUNCTION public.guard_change_order_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.estimates e WHERE e.id=NEW.estimate_id
    AND e.company_id=NEW.company_id AND e.project_id=NEW.project_id) THEN
    RAISE EXCEPTION 'change_order_parent_scope_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_change_order_scope() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_change_orders_scope ON public.change_orders;
CREATE TRIGGER trg_change_orders_scope BEFORE INSERT OR UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_change_order_scope();

CREATE OR REPLACE FUNCTION public.guard_answered_document_header()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_signed boolean; v_old jsonb; v_new jsonb;
BEGIN
  IF current_setting('app.allow_locked_estimate_write', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'estimates' THEN
    SELECT EXISTS(SELECT 1 FROM public.estimate_signatures WHERE estimate_id=OLD.id) INTO v_signed;
    -- An unsigned base contract must also remain accepted while approved work
    -- or signed change-order evidence depends on it.
    IF NEW.client_response IS DISTINCT FROM 'accepted' AND (
      EXISTS(SELECT 1 FROM public.change_orders WHERE estimate_id=OLD.id AND client_response='accepted') OR
      EXISTS(SELECT 1 FROM public.change_order_signatures s JOIN public.change_orders c ON c.id=s.change_order_id WHERE c.estimate_id=OLD.id)
    ) THEN RAISE EXCEPTION 'contract_has_approved_changes' USING ERRCODE='P0022'; END IF;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.change_order_signatures WHERE change_order_id=OLD.id) INTO v_signed;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.estimate_id IS DISTINCT FROM OLD.estimate_id THEN
      RAISE EXCEPTION 'change_order_parent_immutable' USING ERRCODE='P0011';
    END IF;
    -- Every contract-affecting response shares the estimate lock with signing.
    IF NEW.client_response IS DISTINCT FROM OLD.client_response THEN
      PERFORM 1 FROM public.estimates WHERE id=OLD.estimate_id FOR UPDATE;
    END IF;
  END IF;
  v_old := to_jsonb(OLD) - ARRAY['updated_at','view_count','last_viewed_at','viewed_at','sent_at',
    'share_expires_at','share_password_hash','share_password_set_at','payment_status','paid_at',
    'payment_amount_cents','stripe_payment_intent_id','stripe_checkout_session_id'];
  v_new := to_jsonb(NEW) - ARRAY['updated_at','view_count','last_viewed_at','viewed_at','sent_at',
    'share_expires_at','share_password_hash','share_password_set_at','payment_status','paid_at',
    'payment_amount_cents','stripe_payment_intent_id','stripe_checkout_session_id'];
  IF v_signed THEN
    -- sign_* inserts evidence and then accepts in the SAME transaction. Permit
    -- only that first transition; an existing signed response cannot be undone.
    IF OLD.client_response IS NULL AND NEW.client_response='accepted' THEN
      v_old := v_old - ARRAY['client_response','responded_at','status'];
      v_new := v_new - ARRAY['client_response','responded_at','status'];
    END IF;
  ELSIF OLD.client_response IS NOT NULL THEN
    -- Manual answers may be cleared/revised, but content requires reopening first.
    v_old := v_old - ARRAY['client_response','responded_at','status'];
    v_new := v_new - ARRAY['client_response','responded_at','status'];
  ELSE RETURN NEW;
  END IF;
  IF v_old IS DISTINCT FROM v_new THEN
    IF TG_TABLE_NAME='estimates' THEN RAISE EXCEPTION 'estimate_locked' USING ERRCODE='P0022';
    ELSE RAISE EXCEPTION 'change_order_locked' USING ERRCODE='P0011'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_answered_document_header() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_estimates_guard_answered_header ON public.estimates;
CREATE TRIGGER trg_estimates_guard_answered_header BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.guard_answered_document_header();
DROP TRIGGER IF EXISTS trg_change_orders_guard_answered_header ON public.change_orders;
CREATE TRIGGER trg_change_orders_guard_answered_header BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_answered_document_header();

CREATE OR REPLACE FUNCTION public.guard_change_order_item_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_company uuid; v_response text;
BEGIN
  IF current_setting('app.allow_locked_estimate_write',true)='on' THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_id := CASE WHEN TG_OP='DELETE' THEN OLD.change_order_id ELSE NEW.change_order_id END;
  IF TG_OP='UPDATE' AND (NEW.change_order_id IS DISTINCT FROM OLD.change_order_id OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION 'change_order_item_parent_immutable' USING ERRCODE='P0011';
  END IF;
  SELECT company_id,client_response INTO v_company,v_response FROM public.change_orders WHERE id=v_id FOR UPDATE;
  -- Parent already gone during cascade: its signed-delete guard owns retention.
  IF NOT FOUND AND TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_order_not_found' USING ERRCODE='P0013'; END IF;
  IF TG_OP<>'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'change_order_item_company_mismatch' USING ERRCODE='42501';
  END IF;
  IF v_response IS NOT NULL OR EXISTS(SELECT 1 FROM public.change_order_signatures WHERE change_order_id=v_id) THEN
    RAISE EXCEPTION 'change_order_locked' USING ERRCODE='P0011';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_change_order_item_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_change_order_items_guard ON public.change_order_items;
CREATE TRIGGER trg_change_order_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_change_order_item_write();

CREATE OR REPLACE FUNCTION public.stamp_change_order_item_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.change_orders SET updated_at=clock_timestamp()
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.change_order_id ELSE NEW.change_order_id END;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.stamp_change_order_item_version() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_change_order_items_version ON public.change_order_items;
CREATE TRIGGER trg_change_order_items_version AFTER INSERT OR UPDATE OR DELETE ON public.change_order_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_change_order_item_version();

CREATE OR REPLACE FUNCTION public.set_change_order_content_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.updated_at:=GREATEST(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_change_order_content_updated_at() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_change_orders_set_updated_at ON public.change_orders;
CREATE TRIGGER trg_change_orders_set_updated_at BEFORE UPDATE ON public.change_orders FOR EACH ROW
  WHEN ((to_jsonb(OLD)-ARRAY['view_count','viewed_at','updated_at']) IS DISTINCT FROM
        (to_jsonb(NEW)-ARRAY['view_count','viewed_at','updated_at']))
  EXECUTE FUNCTION public.set_change_order_content_updated_at();

CREATE OR REPLACE FUNCTION public.get_change_order_signing_contract(p_change_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.change_orders%ROWTYPE; e public.estimates%ROWTYPE; v_base numeric; v_sum numeric; v_rows jsonb;
BEGIN
  SELECT * INTO c FROM public.change_orders WHERE id=p_change_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_order_not_found' USING ERRCODE='P0013'; END IF;
  SELECT * INTO e FROM public.estimates WHERE id=c.estimate_id;
  IF NOT FOUND OR e.is_current IS NOT TRUE OR e.client_response IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'contract_not_accepted' USING ERRCODE='P0014';
  END IF;
  SELECT COALESCE((SELECT signed_total FROM public.estimate_signatures WHERE estimate_id=e.id
    ORDER BY signed_at DESC LIMIT 1),e.total,0) INTO v_base;
  SELECT COALESCE(SUM(total),0),COALESCE(jsonb_agg(jsonb_build_array(id,total,updated_at) ORDER BY id),'[]'::jsonb)
    INTO v_sum,v_rows FROM public.change_orders
    WHERE estimate_id=e.id AND id<>c.id AND client_response='accepted';
  RETURN jsonb_build_object('before',round(v_base+v_sum,2),'after',round(v_base+v_sum+c.total,2),
    'revision',md5(jsonb_build_object('estimate',e.id,'base',v_base,'version',e.updated_at,'approved',v_rows)::text));
END $$;
REVOKE ALL ON FUNCTION public.get_change_order_signing_contract(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_change_order_signing_contract(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sign_change_order_atomic(
  p_change_order_id uuid,p_share_token uuid,p_expected_updated_at timestamptz,
  p_signer_name text,p_signer_email text,p_signature_data text,p_ip_address inet,p_user_agent text,
  p_signed_content jsonb,p_signed_total numeric,p_snapshot_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.change_orders%ROWTYPE; e public.estimates%ROWTYPE; v_contract jsonb; v_name text; v_total numeric;
BEGIN
  SELECT * INTO c FROM public.change_orders WHERE id=p_change_order_id AND share_token=p_share_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_order_not_found' USING ERRCODE='P0013'; END IF;
  -- Lock order: change order -> estimate -> project. All response writers use
  -- this estimate serialization point before reading/recalculating the contract.
  SELECT * INTO e FROM public.estimates WHERE id=c.estimate_id FOR UPDATE;
  IF NOT FOUND OR e.is_current IS NOT TRUE OR e.client_response IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'contract_not_accepted' USING ERRCODE='P0014';
  END IF;
  IF c.client_response IS NOT NULL OR EXISTS(SELECT 1 FROM public.change_order_signatures WHERE change_order_id=c.id) THEN
    RAISE EXCEPTION 'change_order_already_responded' USING ERRCODE='P0015';
  END IF;
  IF c.status='draft' OR c.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'change_order_conflict' USING ERRCODE='P0012';
  END IF;
  v_contract:=public.get_change_order_signing_contract(c.id);
  IF p_signed_content->'contract' IS DISTINCT FROM v_contract OR p_signed_total IS DISTINCT FROM c.total THEN
    RAISE EXCEPTION 'contract_updated' USING ERRCODE='P0012';
  END IF;
  INSERT INTO public.change_order_signatures(change_order_id,company_id,signer_name,signer_email,signature_data,
    ip_address,user_agent,signed_content,signed_total,snapshot_sha256)
  VALUES(c.id,c.company_id,p_signer_name,p_signer_email,p_signature_data,p_ip_address,p_user_agent,p_signed_content,p_signed_total,p_snapshot_sha256);
  UPDATE public.change_orders SET client_response='accepted',responded_at=clock_timestamp(),status='accepted' WHERE id=c.id;
  v_total:=(v_contract->>'after')::numeric;
  UPDATE public.projects SET total=v_total WHERE id=c.project_id;
  INSERT INTO public.estimate_activity(project_id,company_id,estimate_id,event_type,metadata)
  VALUES(c.project_id,c.company_id,c.estimate_id,'change_order_signed',jsonb_build_object(
    'change_order_id',c.id,'number',c.number,'total',p_signed_total,'signer_name',p_signer_name,'snapshot_sha256',p_snapshot_sha256));
  SELECT cl.name INTO v_name FROM public.projects p LEFT JOIN public.clients cl ON cl.id=p.client_id WHERE p.id=c.project_id;
  RETURN jsonb_build_object('project_id',c.project_id,'company_id',c.company_id,'estimate_id',c.estimate_id,
    'estimate_number',COALESCE(e.estimate_number,CASE WHEN e.estimate_seq>0 THEN lpad(e.estimate_seq::text,4,'0') ELSE e.version::text END),
    'number',c.number,'title',c.title,'total',p_signed_total,'contract_total',v_total,'client_name',v_name);
END $$;
REVOKE ALL ON FUNCTION public.sign_change_order_atomic(uuid,uuid,timestamptz,text,text,text,inet,text,jsonb,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sign_change_order_atomic(uuid,uuid,timestamptz,text,text,text,inet,text,jsonb,numeric,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_estimate_response_atomic(
  p_estimate_id uuid,p_company_id uuid,p_expected_updated_at timestamptz,p_response text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e public.estimates%ROWTYPE; v_at timestamptz; v_version timestamptz;
BEGIN
  IF p_response IS NOT NULL AND p_response NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'invalid_response' USING ERRCODE='22023'; END IF;
  SELECT * INTO e FROM public.estimates WHERE id=p_estimate_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found' USING ERRCODE='P0004'; END IF;
  IF e.is_current IS NOT TRUE THEN RAISE EXCEPTION 'estimate_not_current' USING ERRCODE='P0003'; END IF;
  IF EXISTS(SELECT 1 FROM public.estimate_signatures WHERE estimate_id=e.id) THEN
    RAISE EXCEPTION 'estimate_locked' USING ERRCODE='P0022';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND e.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'estimate_conflict' USING ERRCODE='P0002';
  END IF;
  IF e.client_response IS NOT DISTINCT FROM p_response THEN
    RETURN jsonb_build_object('project_id',e.project_id,'client_response',e.client_response,'responded_at',e.responded_at,'updated_at',e.updated_at);
  END IF;
  v_at:=CASE WHEN p_response IS NULL THEN NULL ELSE clock_timestamp() END;
  UPDATE public.estimates SET client_response=p_response,responded_at=v_at WHERE id=e.id RETURNING updated_at INTO v_version;
  UPDATE public.projects SET status=COALESCE(p_response,CASE WHEN e.sent_at IS NULL THEN 'estimate_ready' ELSE 'sent' END) WHERE id=e.project_id;
  INSERT INTO public.estimate_activity(project_id,company_id,estimate_id,event_type,metadata)
  VALUES(e.project_id,e.company_id,e.id,CASE WHEN p_response IS NULL THEN 'estimate_response_cleared' ELSE 'estimate_'||p_response END,'{"source":"manual"}');
  RETURN jsonb_build_object('project_id',e.project_id,'client_response',p_response,'responded_at',v_at,'updated_at',v_version);
END $$;
REVOKE ALL ON FUNCTION public.record_estimate_response_atomic(uuid,uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_estimate_response_atomic(uuid,uuid,timestamptz,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_change_order_response_atomic(
  p_change_order_id uuid,p_company_id uuid,p_expected_updated_at timestamptz,p_response text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE c public.change_orders%ROWTYPE; e public.estimates%ROWTYPE; v_at timestamptz; v_version timestamptz; v_base numeric; v_sum numeric;
BEGIN
  IF p_response IS NOT NULL AND p_response NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'invalid_response' USING ERRCODE='22023'; END IF;
  SELECT * INTO c FROM public.change_orders WHERE id=p_change_order_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_order_not_found' USING ERRCODE='P0013'; END IF;
  SELECT * INTO e FROM public.estimates WHERE id=c.estimate_id FOR UPDATE;
  IF NOT FOUND OR (p_response='accepted' AND (e.is_current IS NOT TRUE OR e.client_response IS DISTINCT FROM 'accepted')) THEN
    RAISE EXCEPTION 'contract_not_accepted' USING ERRCODE='P0014';
  END IF;
  IF EXISTS(SELECT 1 FROM public.change_order_signatures WHERE change_order_id=c.id) THEN
    RAISE EXCEPTION 'change_order_locked' USING ERRCODE='P0011';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND c.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'change_order_conflict' USING ERRCODE='P0012';
  END IF;
  IF c.client_response IS NOT DISTINCT FROM p_response THEN
    RETURN jsonb_build_object('project_id',c.project_id,'client_response',c.client_response,'responded_at',c.responded_at,'updated_at',c.updated_at);
  END IF;
  v_at:=CASE WHEN p_response IS NULL THEN NULL ELSE clock_timestamp() END;
  UPDATE public.change_orders SET client_response=p_response,responded_at=v_at,
    status=COALESCE(p_response,CASE WHEN c.sent_at IS NULL THEN 'draft' ELSE 'sent' END)
    WHERE id=c.id RETURNING updated_at INTO v_version;
  SELECT COALESCE((SELECT signed_total FROM public.estimate_signatures WHERE estimate_id=e.id ORDER BY signed_at DESC LIMIT 1),e.total,0) INTO v_base;
  SELECT COALESCE(SUM(total),0) INTO v_sum FROM public.change_orders WHERE estimate_id=e.id AND client_response='accepted';
  UPDATE public.projects SET total=v_base+v_sum WHERE id=c.project_id;
  INSERT INTO public.estimate_activity(project_id,company_id,estimate_id,event_type,metadata)
  VALUES(c.project_id,c.company_id,c.estimate_id,CASE WHEN p_response IS NULL THEN 'change_order_response_cleared' ELSE 'change_order_'||p_response END,
    jsonb_build_object('change_order_id',c.id,'number',c.number,'total',c.total,'source','manual'));
  RETURN jsonb_build_object('project_id',c.project_id,'client_response',p_response,'responded_at',v_at,'updated_at',v_version);
END $$;
REVOKE ALL ON FUNCTION public.record_change_order_response_atomic(uuid,uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_change_order_response_atomic(uuid,uuid,timestamptz,text) TO authenticated,service_role;
