-- Pre-launch audit fix (B3 — credit ledger debit/grant is read-modify-write in
-- JS, not atomic): recordCreditDebit / grantCredits (lib/billing/credit-ledger.ts)
-- previously did SELECT credit_balance -> compute in JS -> INSERT ledger row ->
-- UPDATE credit_balance, with no lock. Two concurrent operations on the same
-- company (e.g. a generate-estimate debit racing a photo-analysis debit) could
-- both read the same starting balance, so one debit's effect on the cached
-- balance is silently lost (the ledger itself stays correct, but the O(1) cache
-- companies.credit_balance drifts — and reconcileBalance() is never called from
-- any production code path, so the drift is permanent).
--
-- This function makes the whole read-modify-write a single atomic statement:
-- the UPDATE takes a row lock on the company for the duration of the call, so
-- concurrent callers serialize instead of racing. The idempotency check also
-- moves inside the same locked section, closing the check-then-insert gap that
-- existed between the JS SELECT and INSERT.

CREATE OR REPLACE FUNCTION public.apply_credit_ledger_entry(
  p_company_id UUID,
  p_delta_credits INTEGER,
  p_reason TEXT,
  p_operation_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL,
  p_real_cost_usd NUMERIC DEFAULT NULL,
  p_markup NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE(balance_after INTEGER, applied BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Fast-path idempotency check. Not fully race-proof on its own (see the
  -- unique_violation handler below, which is the actual correctness backstop).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT cl.balance_after INTO v_existing_balance
    FROM public.credit_ledger cl
    WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_balance, false;
      RETURN;
    END IF;
  END IF;

  -- Atomic delta application: this UPDATE both computes the new balance from
  -- the CURRENT row value (never a stale JS-side read) and takes a row lock
  -- held until this function's transaction ends, serializing any concurrent
  -- caller targeting the same company_id.
  UPDATE public.companies
  SET credit_balance = credit_balance + p_delta_credits
  WHERE id = p_company_id
  RETURNING credit_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_credit_ledger_entry: company % not found', p_company_id;
  END IF;

  BEGIN
    INSERT INTO public.credit_ledger (
      company_id, delta_credits, reason, operation_type, ref_id,
      real_cost_usd, markup, balance_after, idempotency_key
    ) VALUES (
      p_company_id, p_delta_credits, p_reason, p_operation_type, p_ref_id,
      p_real_cost_usd, p_markup, v_new_balance, p_idempotency_key
    );
  EXCEPTION WHEN unique_violation THEN
    -- Lost an idempotency race that the fast-path SELECT above missed (another
    -- concurrent call with the SAME key inserted between our SELECT and this
    -- INSERT). Undo our own balance mutation and report the winner's balance —
    -- the caller's operation was already applied once, this call is a no-op.
    UPDATE public.companies
    SET credit_balance = credit_balance - p_delta_credits
    WHERE id = p_company_id;

    SELECT cl.balance_after INTO v_existing_balance
    FROM public.credit_ledger cl
    WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
    LIMIT 1;

    RETURN QUERY SELECT v_existing_balance, false;
    RETURN;
  END;

  RETURN QUERY SELECT v_new_balance, true;
END;
$$;

-- Service-role only — every existing caller (recordCreditDebit, grantCredits)
-- already runs on requireServiceClient(). No tenant-facing surface should ever
-- invoke this directly (it bypasses the credit gate / entitlement checks).
REVOKE EXECUTE ON FUNCTION public.apply_credit_ledger_entry FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.apply_credit_ledger_entry IS
  'Atomic credit ledger write: locks the company row, applies delta_credits to companies.credit_balance, and inserts the corresponding credit_ledger row in one transaction. Replaces the prior read-modify-write JS pattern in lib/billing/credit-ledger.ts. Service-role only.';
