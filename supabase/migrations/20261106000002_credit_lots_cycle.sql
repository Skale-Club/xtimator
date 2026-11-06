-- supabase/migrations/20261106000002_credit_lots_cycle.sql
-- SEED-055 Phase C: subscription-cycle grants.
--
-- Phase B introduced credit lots (20261106000001). Phase C makes the 'monthly'
-- lot follow the Stripe billing cycle:
--   * a new monthly lot expires the company's previous monthly lot(s)
--     immediately (use-it-or-lose-it), and
--   * cancellation closes the live monthly lot immediately.
--
-- This migration also removes a window the Phase B design left open. The cache
-- (companies.credit_balance) already EXCLUDES a lapsed lot the moment its
-- expires_at passes, but the matching 'expire' ledger row was only written by
-- the hourly sweep. Between those two instants SUM(ledger deltas) differed from
-- credit_balance. Every RPC that takes the company lock now first sweeps THAT
-- company's own lapsed lots inline (_sweep_company_lots), so after any write the
-- ledger and the cache agree.
--
-- INVARIANT (unchanged, maintained under the company row lock):
--   companies.credit_balance
--     = SUM(credit_lots.remaining WHERE expires_at IS NULL OR expires_at > now())
--       - companies.credit_debt
--
-- Phase B's migration is NOT edited: grant_credit_lot / consume_credits /
-- expire_credit_lots are re-declared here with CREATE OR REPLACE (same
-- signatures), so applying both files in order is idempotent.
--
-- Apply this migration to prod BEFORE pushing the code that calls
-- grant_monthly_lot / close_monthly_lots (migrations are applied by hand; the
-- deploy ships code only).

-- ============================================================
-- 1. _sweep_company_lots: expire ONE company's lapsed lots (internal)
-- ============================================================
-- PRECONDITION: the caller already holds the company row lock (it is only ever
-- called from inside the RPCs below, right after their lock UPDATE). For every
-- lot of the company with expires_at <= now() and remaining > 0: zero it and
-- write an 'expire' ledger row (delta = -remaining, key expire:{lot_id}); then
-- refresh the cache. A swept lot has remaining = 0 and is skipped next time, so
-- the unique expire:{lot_id} key can never collide. Returns the lots expired.
CREATE OR REPLACE FUNCTION public._sweep_company_lots(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_lot RECORD;
  v_debt INTEGER;
  v_live_sum BIGINT;
  v_new_balance INTEGER;
  v_count INTEGER := 0;
BEGIN
  SELECT c.credit_debt INTO v_debt
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_lot IN
    SELECT l.id, l.remaining
    FROM public.credit_lots l
    WHERE l.company_id = p_company_id
      AND l.expires_at <= now()
      AND l.remaining > 0
    ORDER BY l.expires_at ASC, l.created_at ASC
  LOOP
    UPDATE public.credit_lots AS l
    SET remaining = 0
    WHERE l.id = v_lot.id;

    SELECT COALESCE(SUM(l.remaining), 0) INTO v_live_sum
    FROM public.credit_lots l
    WHERE l.company_id = p_company_id
      AND (l.expires_at IS NULL OR l.expires_at > now());
    v_new_balance := v_live_sum - v_debt;

    UPDATE public.companies AS c
    SET credit_balance = v_new_balance
    WHERE c.id = p_company_id;

    INSERT INTO public.credit_ledger (
      company_id, delta_credits, reason, operation_type, ref_id,
      real_cost_usd, markup, balance_after, idempotency_key, lot_id
    ) VALUES (
      p_company_id, -v_lot.remaining, 'expire', NULL, NULL,
      NULL, NULL, v_new_balance, 'expire:' || v_lot.id::text, v_lot.id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sweep_company_lots FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._sweep_company_lots IS
  'Internal helper: expires ONE company''s lapsed credit lots (expire ledger row per lot, remaining zeroed, cache refreshed). The caller MUST already hold the company row lock. Not callable by client roles. SEED-055 Phase C.';

-- ============================================================
-- 2. grant_credit_lot: now sweeps the company's lapsed lots first
-- ============================================================
-- Identical to the Phase B function except for the PERFORM
-- _sweep_company_lots(...) immediately after the company row lock.
CREATE OR REPLACE FUNCTION public.grant_credit_lot(
  p_company_id UUID,
  p_source TEXT,
  p_credits INTEGER,
  p_expires_at TIMESTAMPTZ,
  p_period_key TEXT,
  p_ref_id TEXT,
  p_idempotency_key TEXT,
  p_reason TEXT
)
RETURNS TABLE(balance_after INTEGER, applied BOOLEAN, lot_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_existing_balance INTEGER;
  v_existing_lot UUID;
  v_debt INTEGER;
  v_paydown INTEGER;
  v_new_debt INTEGER;
  v_lot_id UUID;
  v_live_sum BIGINT;
  v_new_balance INTEGER;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'grant_credit_lot: p_credits must be positive (got %)', p_credits;
  END IF;
  IF p_reason NOT IN ('grant','topup','adjust') THEN
    RAISE EXCEPTION 'grant_credit_lot: invalid reason %', p_reason;
  END IF;

  -- Fast-path idempotency check (the unique_violation handler below is the
  -- actual backstop).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT cl.balance_after, cl.lot_id INTO v_existing_balance, v_existing_lot
    FROM public.credit_ledger cl
    WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_balance, false, v_existing_lot;
      RETURN;
    END IF;
  END IF;

  -- Row lock for the rest of the transaction.
  UPDATE public.companies AS c
  SET credit_debt = c.credit_debt
  WHERE c.id = p_company_id
  RETURNING c.credit_debt INTO v_debt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_credit_lot: company % not found', p_company_id;
  END IF;

  -- Close the lapsed-lot window: ledger and cache agree from here on.
  PERFORM public._sweep_company_lots(p_company_id);

  BEGIN
    v_paydown := LEAST(p_credits, v_debt);
    v_new_debt := v_debt - v_paydown;

    INSERT INTO public.credit_lots (
      company_id, source, granted, remaining, expires_at, period_key, ref_id
    ) VALUES (
      p_company_id, p_source, p_credits, p_credits - v_paydown, p_expires_at, p_period_key, p_ref_id
    ) RETURNING id INTO v_lot_id;

    SELECT COALESCE(SUM(l.remaining), 0) INTO v_live_sum
    FROM public.credit_lots l
    WHERE l.company_id = p_company_id
      AND (l.expires_at IS NULL OR l.expires_at > now());
    v_new_balance := v_live_sum - v_new_debt;

    UPDATE public.companies AS c
    SET credit_debt = v_new_debt, credit_balance = v_new_balance
    WHERE c.id = p_company_id;

    INSERT INTO public.credit_ledger (
      company_id, delta_credits, reason, operation_type, ref_id,
      real_cost_usd, markup, balance_after, idempotency_key, lot_id
    ) VALUES (
      p_company_id, p_credits, p_reason, NULL, p_ref_id,
      NULL, NULL, v_new_balance, p_idempotency_key, v_lot_id
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT cl.balance_after, cl.lot_id INTO v_existing_balance, v_existing_lot
    FROM public.credit_ledger cl
    WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
    LIMIT 1;

    RETURN QUERY SELECT v_existing_balance, false, v_existing_lot;
    RETURN;
  END;

  RETURN QUERY SELECT v_new_balance, true, v_lot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_credit_lot FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.grant_credit_lot IS
  'Atomic, idempotent credit grant: locks the company row, sweeps the company''s lapsed lots, pays down credit_debt first, inserts a credit_lots row, writes the credit_ledger row (delta = +credits, lot_id) and recomputes companies.credit_balance from the lots invariant. Service-role only. SEED-055 Phases B+C.';

-- ============================================================
-- 3. consume_credits: now sweeps the company's lapsed lots first
-- ============================================================
-- Identical to the Phase B function except for the PERFORM
-- _sweep_company_lots(...) immediately after the company row lock.
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_company_id UUID,
  p_credits INTEGER,
  p_operation_type TEXT,
  p_ref_id TEXT,
  p_real_cost_usd NUMERIC,
  p_markup NUMERIC,
  p_idempotency_key TEXT,
  p_reason TEXT DEFAULT 'debit'
)
RETURNS TABLE(balance_after INTEGER, applied BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_existing_balance INTEGER;
  v_debt INTEGER;
  v_new_debt INTEGER;
  v_needed INTEGER;
  v_take INTEGER;
  v_split JSONB := '[]'::jsonb;
  v_live_sum BIGINT;
  v_new_balance INTEGER;
  v_lot RECORD;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'consume_credits: p_credits must be positive (got %)', p_credits;
  END IF;
  IF p_reason NOT IN ('debit','adjust') THEN
    RAISE EXCEPTION 'consume_credits: invalid reason %', p_reason;
  END IF;

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

  -- Row lock for the rest of the transaction.
  UPDATE public.companies AS c
  SET credit_debt = c.credit_debt
  WHERE c.id = p_company_id
  RETURNING c.credit_debt INTO v_debt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consume_credits: company % not found', p_company_id;
  END IF;

  -- Close the lapsed-lot window: ledger and cache agree from here on.
  PERFORM public._sweep_company_lots(p_company_id);

  BEGIN
    v_needed := p_credits;

    FOR v_lot IN
      SELECT l.id, l.remaining
      FROM public.credit_lots l
      WHERE l.company_id = p_company_id
        AND l.remaining > 0
        AND (l.expires_at IS NULL OR l.expires_at > now())
      ORDER BY
        CASE l.source WHEN 'monthly' THEN 0 WHEN 'signup' THEN 1 ELSE 2 END,
        l.expires_at ASC NULLS LAST,
        l.created_at ASC
    LOOP
      EXIT WHEN v_needed <= 0;
      v_take := LEAST(v_lot.remaining, v_needed);
      UPDATE public.credit_lots AS l
      SET remaining = l.remaining - v_take
      WHERE l.id = v_lot.id;
      v_split := v_split || jsonb_build_array(jsonb_build_object('lot_id', v_lot.id, 'credits', v_take));
      v_needed := v_needed - v_take;
    END LOOP;

    v_new_debt := v_debt;
    IF v_needed > 0 THEN
      -- Shortfall: the live lots are exhausted; the rest is overdraft.
      v_new_debt := v_debt + v_needed;
      v_split := v_split || jsonb_build_array(jsonb_build_object('debt', v_needed));
    END IF;

    SELECT COALESCE(SUM(l.remaining), 0) INTO v_live_sum
    FROM public.credit_lots l
    WHERE l.company_id = p_company_id
      AND (l.expires_at IS NULL OR l.expires_at > now());
    v_new_balance := v_live_sum - v_new_debt;

    UPDATE public.companies AS c
    SET credit_debt = v_new_debt, credit_balance = v_new_balance
    WHERE c.id = p_company_id;

    INSERT INTO public.credit_ledger (
      company_id, delta_credits, reason, operation_type, ref_id,
      real_cost_usd, markup, balance_after, idempotency_key, lot_id, lot_split
    ) VALUES (
      p_company_id, -p_credits, p_reason, p_operation_type, p_ref_id,
      p_real_cost_usd, p_markup, v_new_balance, p_idempotency_key, NULL, v_split
    );
  EXCEPTION WHEN unique_violation THEN
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

REVOKE EXECUTE ON FUNCTION public.consume_credits FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.consume_credits IS
  'Atomic, idempotent credit debit: locks the company row, sweeps the company''s lapsed lots, drains live lots (monthly, then signup, then the rest by soonest expiry), adds any shortfall to credit_debt, writes ONE credit_ledger row (delta = -credits, lot_split JSON) and recomputes companies.credit_balance. Service-role only. SEED-055 Phases B+C.';

-- ============================================================
-- 4. expire_credit_lots: hourly sweep, now built on the shared helper
-- ============================================================
-- Same contract as Phase B (returns the number of lots expired, one company
-- locked at a time); the per-lot work lives in _sweep_company_lots.
CREATE OR REPLACE FUNCTION public.expire_credit_lots()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company UUID;
  v_debt INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR v_company IN
    SELECT DISTINCT l.company_id
    FROM public.credit_lots l
    WHERE l.expires_at <= now() AND l.remaining > 0
  LOOP
    -- Per-company row lock (released when the transaction ends).
    UPDATE public.companies AS c
    SET credit_debt = c.credit_debt
    WHERE c.id = v_company
    RETURNING c.credit_debt INTO v_debt;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Sweeps under the lock, so a concurrent consume cannot be missed.
    v_count := v_count + public._sweep_company_lots(v_company);
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_credit_lots FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.expire_credit_lots IS
  'Sweeps credit lots past expires_at: per company, under a row lock, writes an expire ledger row (delta = -remaining), zeroes remaining and recomputes companies.credit_balance (via _sweep_company_lots). Returns the number of lots expired. Service-role only. SEED-055 Phases B+C.';

-- ============================================================
-- 5. grant_monthly_lot: the subscription-cycle grant
-- ============================================================
-- Grants the company's MONTHLY lot for one window (p_period_key = window start
-- 'YYYY-MM-DD'; p_expires_at = window end). Idempotent on p_idempotency_key
-- (convention: grant:{companyId}:{periodKey}).
--
-- Under the company lock:
--   1. if the key already exists -> no-op. This check comes BEFORE any
--      expiry, so a redelivered webhook / re-run cron can never expire the lot
--      it already granted.
--   2. otherwise every live 'monthly' lot of the company whose period_key is
--      NOT this window's is expired now (use-it-or-lose-it), swept (expire
--      ledger rows), and the new lot is granted exactly like grant_credit_lot
--      (debt paydown first, ledger reason 'grant', cache recomputed).
-- Everything after the lock runs in one BEGIN..EXCEPTION sub-block so the
-- unique_violation backstop rolls the expiry back together with the grant.
CREATE OR REPLACE FUNCTION public.grant_monthly_lot(
  p_company_id UUID,
  p_credits INTEGER,
  p_period_key TEXT,
  p_expires_at TIMESTAMPTZ,
  p_ref_id TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE(balance_after INTEGER, applied BOOLEAN, lot_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_existing_balance INTEGER;
  v_existing_lot UUID;
  v_debt INTEGER;
  v_paydown INTEGER;
  v_new_debt INTEGER;
  v_lot_id UUID;
  v_live_sum BIGINT;
  v_new_balance INTEGER;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'grant_monthly_lot: p_credits must be positive (got %)', p_credits;
  END IF;
  IF p_period_key IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'grant_monthly_lot: p_period_key and p_idempotency_key are required';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'grant_monthly_lot: p_expires_at must be in the future (got %)', p_expires_at;
  END IF;

  -- Fast-path idempotency check.
  SELECT cl.balance_after, cl.lot_id INTO v_existing_balance, v_existing_lot
  FROM public.credit_ledger cl
  WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_balance, false, v_existing_lot;
    RETURN;
  END IF;

  -- Row lock for the rest of the transaction.
  UPDATE public.companies AS c
  SET credit_debt = c.credit_debt
  WHERE c.id = p_company_id
  RETURNING c.credit_debt INTO v_debt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_monthly_lot: company % not found', p_company_id;
  END IF;

  -- Re-check under the lock: a concurrent call for the same window may have
  -- committed between the fast path and the lock. Must happen BEFORE the
  -- supersede below, which would otherwise expire the lot that call granted.
  SELECT cl.balance_after, cl.lot_id INTO v_existing_balance, v_existing_lot
  FROM public.credit_ledger cl
  WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_balance, false, v_existing_lot;
    RETURN;
  END IF;

  BEGIN
    -- Use-it-or-lose-it: the previous window's live monthly lot(s) end now.
    UPDATE public.credit_lots AS l
    SET expires_at = now()
    WHERE l.company_id = p_company_id
      AND l.source = 'monthly'
      AND (l.expires_at IS NULL OR l.expires_at > now())
      AND l.period_key IS DISTINCT FROM p_period_key;

    -- Write the expire rows for them (and any other lapsed lot).
    PERFORM public._sweep_company_lots(p_company_id);

    v_paydown := LEAST(p_credits, v_debt);
    v_new_debt := v_debt - v_paydown;

    INSERT INTO public.credit_lots (
      company_id, source, granted, remaining, expires_at, period_key, ref_id
    ) VALUES (
      p_company_id, 'monthly', p_credits, p_credits - v_paydown, p_expires_at, p_period_key, p_ref_id
    ) RETURNING id INTO v_lot_id;

    SELECT COALESCE(SUM(l.remaining), 0) INTO v_live_sum
    FROM public.credit_lots l
    WHERE l.company_id = p_company_id
      AND (l.expires_at IS NULL OR l.expires_at > now());
    v_new_balance := v_live_sum - v_new_debt;

    UPDATE public.companies AS c
    SET credit_debt = v_new_debt, credit_balance = v_new_balance
    WHERE c.id = p_company_id;

    INSERT INTO public.credit_ledger (
      company_id, delta_credits, reason, operation_type, ref_id,
      real_cost_usd, markup, balance_after, idempotency_key, lot_id
    ) VALUES (
      p_company_id, p_credits, 'grant', NULL, p_ref_id,
      NULL, NULL, v_new_balance, p_idempotency_key, v_lot_id
    );
  EXCEPTION WHEN unique_violation THEN
    -- Lost an idempotency race the checks above missed: the sub-block
    -- (supersede, sweep, lot, cache, ledger) rolled back automatically.
    SELECT cl.balance_after, cl.lot_id INTO v_existing_balance, v_existing_lot
    FROM public.credit_ledger cl
    WHERE cl.company_id = p_company_id AND cl.idempotency_key = p_idempotency_key
    LIMIT 1;

    RETURN QUERY SELECT v_existing_balance, false, v_existing_lot;
    RETURN;
  END;

  RETURN QUERY SELECT v_new_balance, true, v_lot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_monthly_lot FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.grant_monthly_lot IS
  'Idempotent subscription-cycle grant: under the company lock, no-ops if the key exists; otherwise expires the company''s live monthly lots of any other period (use-it-or-lose-it), sweeps them into expire ledger rows, then grants the new monthly lot (debt paydown first, ledger reason grant) and recomputes companies.credit_balance. Service-role only. SEED-055 Phase C.';

-- ============================================================
-- 6. close_monthly_lots: cancellation / non-payment
-- ============================================================
-- Expires every live 'monthly' lot of the company NOW and sweeps them into
-- expire ledger rows. Idempotent by nature: a second call finds no live monthly
-- lot and expires nothing. p_ref_id is provenance for the server log only.
CREATE OR REPLACE FUNCTION public.close_monthly_lots(
  p_company_id UUID,
  p_ref_id TEXT
)
RETURNS TABLE(balance_after INTEGER, expired INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_debt INTEGER;
  v_expired INTEGER;
  v_live_sum BIGINT;
  v_new_balance INTEGER;
BEGIN
  -- Row lock for the rest of the transaction.
  UPDATE public.companies AS c
  SET credit_debt = c.credit_debt
  WHERE c.id = p_company_id
  RETURNING c.credit_debt INTO v_debt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'close_monthly_lots: company % not found', p_company_id;
  END IF;

  UPDATE public.credit_lots AS l
  SET expires_at = now()
  WHERE l.company_id = p_company_id
    AND l.source = 'monthly'
    AND (l.expires_at IS NULL OR l.expires_at > now());

  v_expired := public._sweep_company_lots(p_company_id);

  SELECT COALESCE(SUM(l.remaining), 0) INTO v_live_sum
  FROM public.credit_lots l
  WHERE l.company_id = p_company_id
    AND (l.expires_at IS NULL OR l.expires_at > now());
  v_new_balance := v_live_sum - v_debt;

  UPDATE public.companies AS c
  SET credit_balance = v_new_balance
  WHERE c.id = p_company_id;

  IF v_expired > 0 THEN
    RAISE LOG 'close_monthly_lots: company % expired % lot(s), ref %', p_company_id, v_expired, p_ref_id;
  END IF;

  RETURN QUERY SELECT v_new_balance, v_expired;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_monthly_lots FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.close_monthly_lots IS
  'Expires every live monthly credit lot of a company immediately (cancellation / unpaid subscription), writes the expire ledger rows and recomputes companies.credit_balance under the company lock. Idempotent: a second call expires nothing. Service-role only. SEED-055 Phase C.';
