-- Payment recovery and atomic reservations. Apply to development, then production
-- before deploying the corresponding application. All RPCs are service-role only.
ALTER TABLE public.processed_stripe_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id text, p_account_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.processed_stripe_events; token uuid := gen_random_uuid();
BEGIN
  INSERT INTO processed_stripe_events(event_id,status,stripe_account_id)
    VALUES(p_event_id,'pending',p_account_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM processed_stripe_events WHERE event_id=p_event_id FOR UPDATE;
  IF r.status='completed' THEN RETURN jsonb_build_object('state','completed'); END IF;
  IF r.lease_until>now() THEN RETURN jsonb_build_object('state','busy'); END IF;
  UPDATE processed_stripe_events SET status='processing',lease_token=token,
    lease_until=now()+interval '10 minutes',updated_at=now(),attempts=attempts+1
    WHERE event_id=p_event_id;
  RETURN jsonb_build_object('state','acquired','token',token);
END $$;

CREATE OR REPLACE FUNCTION public.finish_stripe_event(p_event_id text,p_token uuid,p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE processed_stripe_events SET status=CASE WHEN p_success THEN 'completed' ELSE 'pending' END,
    lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE event_id=p_event_id AND lease_token=p_token;
  RETURN FOUND;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_operations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN('credit_purchase','subscription_checkout')),
  request_key text NOT NULL,
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','checkout','completed','failed')),
  stripe_object_id text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,kind,request_key)
);
ALTER TABLE public.billing_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_operations FROM anon,authenticated;
GRANT ALL ON public.billing_operations TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS billing_one_pending_subscription_checkout
  ON public.billing_operations(company_id) WHERE kind='subscription_checkout' AND status IN('pending','checkout');
CREATE UNIQUE INDEX IF NOT EXISTS billing_one_pending_credit_purchase
  ON public.billing_operations(company_id) WHERE kind='credit_purchase' AND status IN('pending','checkout');
CREATE INDEX IF NOT EXISTS stripe_events_pending_recovery
  ON public.processed_stripe_events(updated_at) WHERE status<>'completed';

CREATE OR REPLACE FUNCTION public.reserve_billing_operation(p_company_id uuid,p_kind text,p_request_key text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.billing_operations;
BEGIN
  PERFORM id FROM companies WHERE id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  IF p_kind IN('subscription_checkout','credit_purchase') THEN
    SELECT * INTO r FROM billing_operations WHERE company_id=p_company_id AND kind=p_kind
      AND status IN('pending','checkout') ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF FOUND THEN RETURN to_jsonb(r); END IF;
  END IF;
  INSERT INTO billing_operations(company_id,kind,request_key,request)
    VALUES(p_company_id,p_kind,p_request_key,p_request) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT r FROM billing_operations WHERE company_id=p_company_id AND kind=p_kind AND request_key=p_request_key;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.claim_billing_operation(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE token uuid := gen_random_uuid();
BEGIN
  UPDATE billing_operations SET lease_token=token,lease_until=now()+interval '10 minutes',updated_at=now()
    WHERE id=p_id AND status IN('pending','checkout') AND (lease_until IS NULL OR lease_until<now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN token;
END $$;

-- Cumulative charge reversals converge under duplicates, missing refund lists
-- and out-of-order snapshots. consume_credits and the watermark commit together.
CREATE TABLE IF NOT EXISTS public.stripe_credit_reversals(
  charge_id text PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),
  reversed_credits integer NOT NULL DEFAULT 0 CHECK(reversed_credits>=0)
);
ALTER TABLE public.stripe_credit_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_credit_reversals FROM anon,authenticated;
GRANT ALL ON public.stripe_credit_reversals TO service_role;
CREATE OR REPLACE FUNCTION public.reverse_stripe_credits(p_company_id uuid,p_charge_id text,p_target_credits integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r stripe_credit_reversals; delta integer;
BEGIN
  IF p_target_credits<0 THEN RAISE EXCEPTION 'Invalid reversal'; END IF;
  INSERT INTO stripe_credit_reversals(charge_id,company_id) VALUES(p_charge_id,p_company_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM stripe_credit_reversals WHERE charge_id=p_charge_id FOR UPDATE;
  IF r.company_id<>p_company_id THEN RAISE EXCEPTION 'Charge ownership mismatch'; END IF;
  delta := greatest(0,p_target_credits-r.reversed_credits);
  IF delta>0 THEN
    PERFORM consume_credits(p_company_id,delta,NULL,p_charge_id,NULL,NULL,
      'reversal:'||p_charge_id||':'||p_target_credits,'adjust');
    UPDATE stripe_credit_reversals SET reversed_credits=p_target_credits WHERE charge_id=p_charge_id;
  END IF;
  RETURN delta;
END $$;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_issue_request jsonb;

CREATE OR REPLACE FUNCTION public.record_invoice_refund(p_company_id uuid,p_invoice_id uuid,p_refunded_cents integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_refunded_cents<0 THEN RAISE EXCEPTION 'Invalid refund'; END IF;
  UPDATE invoices SET refunded_cents=greatest(refunded_cents,p_refunded_cents),
    refunded_at=now(),updated_at=now() WHERE id=p_invoice_id AND company_id=p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
END $$;

-- The estimate row serializes every invoice kind. Recalculate amounts against
-- current reservations and approved change orders while holding that lock.
CREATE OR REPLACE FUNCTION public.reserve_connect_invoice(p_row jsonb,p_deposit_cents integer,p_expected_total_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e estimates; r invoices; factor integer; contract integer; billed integer; expected integer;
  co_total integer; separate_total integer; has_deposit boolean; k text:=p_row->>'kind';
BEGIN
  SELECT * INTO STRICT e FROM estimates WHERE id=(p_row->>'estimate_id')::uuid FOR UPDATE;
  IF e.company_id<>(p_row->>'company_id')::uuid OR e.is_current IS NOT TRUE THEN RAISE EXCEPTION 'Invalid contract'; END IF;
  factor:=CASE WHEN upper(coalesce(e.currency_code,'USD'))='JPY' THEN 1 ELSE 100 END;
  IF round(e.total*factor)::integer<>p_expected_total_cents THEN RAISE EXCEPTION 'Contract changed, please retry' USING ERRCODE='40001'; END IF;
  SELECT * INTO r FROM invoices WHERE estimate_id=e.id AND status='draft' AND kind=k
    AND change_order_id IS NOT DISTINCT FROM (p_row->>'change_order_id')::uuid ORDER BY created_at LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(r); END IF;
  IF EXISTS(SELECT 1 FROM invoices WHERE estimate_id=e.id AND status NOT IN('void','uncollectible')
    AND (kind=k AND change_order_id IS NOT DISTINCT FROM (p_row->>'change_order_id')::uuid OR k='full')) THEN
    RAISE EXCEPTION 'An invoice already exists for this contract';
  END IF;
  SELECT coalesce(sum(round(total*factor)),0)::integer INTO co_total FROM change_orders
    WHERE estimate_id=e.id AND client_response='accepted' AND e.client_response='accepted';
  contract:=p_expected_total_cents+co_total;
  SELECT coalesce(sum(amount_cents),0)::integer,bool_or(kind='deposit') INTO billed,has_deposit
    FROM invoices WHERE estimate_id=e.id AND status NOT IN('void','uncollectible');
  SELECT coalesce(sum(round(co.total*factor)),0)::integer INTO separate_total FROM change_orders co
    WHERE co.estimate_id=e.id AND co.client_response='accepted' AND e.client_response='accepted'
      AND EXISTS(SELECT 1 FROM invoices i WHERE i.change_order_id=co.id AND i.status NOT IN('void','uncollectible'));
  expected:=CASE k WHEN 'full' THEN contract WHEN 'deposit' THEN p_deposit_cents
    WHEN 'balance' THEN CASE WHEN coalesce(has_deposit,false) THEN contract-billed ELSE contract-p_deposit_cents-separate_total END
    WHEN 'change_order' THEN (SELECT round(total*factor)::integer FROM change_orders
      WHERE id=(p_row->>'change_order_id')::uuid AND estimate_id=e.id AND client_response='accepted' AND e.client_response='accepted') END;
  IF expected IS NULL OR expected<=0 OR expected<>(p_row->>'amount_cents')::integer OR billed+expected>contract THEN
    RAISE EXCEPTION 'Contract invoicing changed, please retry' USING ERRCODE='40001';
  END IF;
  INSERT INTO invoices(id,estimate_id,company_id,kind,change_order_id,amount_cents,currency_code,project_name,description,status,stripe_account_id,stripe_issue_request)
    VALUES((p_row->>'id')::uuid,e.id,e.company_id,k,(p_row->>'change_order_id')::uuid,expected,
      p_row->>'currency_code',p_row->>'project_name',p_row->>'description','draft',p_row->>'stripe_account_id',p_row->'stripe_issue_request')
    RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text,text),public.finish_stripe_event(text,uuid,boolean),
  public.reserve_billing_operation(uuid,text,text,jsonb),public.claim_billing_operation(uuid),
  public.reverse_stripe_credits(uuid,text,integer),public.reserve_connect_invoice(jsonb,integer,integer),public.record_invoice_refund(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text,text),public.finish_stripe_event(text,uuid,boolean),
  public.reserve_billing_operation(uuid,text,text,jsonb),public.claim_billing_operation(uuid),
  public.reverse_stripe_credits(uuid,text,integer),public.reserve_connect_invoice(jsonb,integer,integer),public.record_invoice_refund(uuid,uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
