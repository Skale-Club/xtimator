-- Seed a charge's cumulative watermark from reversals recorded by the previous
-- implementation. Old payloads used refund:<refund id>; newer ones used the
-- charge id when Charge.refunds was absent. Never debit those credits again.
DROP FUNCTION IF EXISTS public.reverse_stripe_credits(uuid,text,integer);
CREATE OR REPLACE FUNCTION public.reverse_stripe_credits(
  p_company_id uuid,p_charge_id text,p_target_credits integer,p_refund_ids text[] DEFAULT '{}'::text[]
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r stripe_credit_reversals; delta integer; legacy integer;
BEGIN
  IF p_target_credits<0 THEN RAISE EXCEPTION 'Invalid reversal'; END IF;
  PERFORM id FROM companies WHERE id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  SELECT coalesce(-sum(delta_credits),0)::integer INTO legacy FROM credit_ledger
    WHERE company_id=p_company_id AND delta_credits<0 AND (
      idempotency_key='refund:'||p_charge_id OR
      idempotency_key IN(SELECT 'refund:'||id FROM unnest(coalesce(p_refund_ids,'{}'::text[])) id)
    );
  INSERT INTO stripe_credit_reversals(charge_id,company_id,reversed_credits)
    VALUES(p_charge_id,p_company_id,legacy) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM stripe_credit_reversals WHERE charge_id=p_charge_id FOR UPDATE;
  IF r.company_id<>p_company_id THEN RAISE EXCEPTION 'Charge ownership mismatch'; END IF;
  delta:=greatest(0,p_target_credits-r.reversed_credits);
  IF delta>0 THEN
    PERFORM consume_credits(p_company_id,delta,NULL,p_charge_id,NULL,NULL,
      'reversal:'||p_charge_id||':'||p_target_credits,'adjust');
    UPDATE stripe_credit_reversals SET reversed_credits=p_target_credits WHERE charge_id=p_charge_id;
  END IF;
  RETURN delta;
END $$;
REVOKE ALL ON FUNCTION public.reverse_stripe_credits(uuid,text,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_stripe_credits(uuid,text,integer,text[]) TO service_role;
NOTIFY pgrst,'reload schema';
