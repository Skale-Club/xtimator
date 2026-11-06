-- supabase/migrations/20261106000001_credit_lots.sql
-- SEED-055 Phase B: credit LOTS with optional expiry.
--
-- Until now a company's credits were one integer (companies.credit_balance)
-- backed by an append-only ledger (credit_ledger). That cannot express
-- "this block of credits expires on date X". This migration introduces
-- credit_lots (one row per grant) and three service-role RPCs that move every
-- grant, debit and expiry THROUGH the lots, while keeping credit_balance as the
-- O(1) cache the rest of the app already reads.
--
-- INVARIANT (maintained by every RPC below, under the company row lock):
--   companies.credit_balance
--     = SUM(credit_lots.remaining WHERE expires_at IS NULL OR expires_at > now())
--       - companies.credit_debt
--
-- credit_debt is the overdraft: a debit larger than the live lots drives the
-- lots to zero and records the shortfall here (same net effect as the old
-- negative balance). The next grant pays the debt down first.
--
-- User-visible behaviour is UNCHANGED by this phase: every lot the app creates
-- in Phase B has expires_at = NULL, so nothing expires yet. The backfill at the
-- bottom turns each existing positive balance into one non-expiring 'adjust'
-- lot (and a negative balance into credit_debt) WITHOUT touching the ledger or
-- the cache, so no balance changes.
--
-- apply_credit_ledger_entry (20260706000002) is deliberately KEPT: the code that
-- is deployed in the window between applying this migration and deploying the
-- new code still calls it. It writes the cache directly and therefore bypasses
-- the lots; the new code stops calling it. Drop it in a later cleanup once no
-- deployed version references it.
--
-- Apply this migration to prod BEFORE pushing the code that calls the new RPCs
-- (migrations are applied by hand; the deploy ships code only).
--
-- Idempotent DDL: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- guarded constraint swaps, CREATE OR REPLACE FUNCTION, guarded backfill.

-- ============================================================
-- 1. CREDIT_LOTS: one row per grant, drained by consume_credits
-- ============================================================
-- source:     where the credits came from (drives consumption order).
-- granted:    the original size of the lot.
-- remaining:  what is left; never negative (overdraft lives in credit_debt).
-- expires_at: NULL = never expires.
-- period_key: billing-period identifier for subscription lots (Phase C).
-- ref_id:     provenance (Stripe session / invoice / payment intent / note).
CREATE TABLE IF NOT EXISTS public.credit_lots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('signup','monthly','topup','adjust')),
  granted     INTEGER NOT NULL CHECK (granted >= 0),
  remaining   INTEGER NOT NULL CHECK (remaining >= 0),
  expires_at  TIMESTAMPTZ,
  period_key  TEXT,
  ref_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_lots_company_expires
  ON public.credit_lots(company_id, expires_at);

-- Tenant-readable, service-role-written. Same company_members subquery pattern
-- as credit_ledger_select (NEVER the legacy companies owner column — the Phase
-- 82 assertion fails the build if any policy references it). ONLY a SELECT
-- policy: no INSERT/UPDATE/DELETE policy exists, the service role bypasses RLS.
ALTER TABLE public.credit_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_lots_select" ON public.credit_lots;
CREATE POLICY "credit_lots_select" ON public.credit_lots FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));

-- Belt and braces (same posture as credit_ledger, 20260821000002): no client
-- role may hold a write privilege, whatever the schema default privileges say.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_lots FROM anon, authenticated;

COMMENT ON TABLE public.credit_lots IS
  'One row per credit grant (signup / monthly / topup / adjust) with remaining balance and optional expiry. companies.credit_balance = SUM(remaining of non-expired lots) - companies.credit_debt. Tenant-readable via company_members; service-role writes only. SEED-055 Phase B.';

-- ============================================================
-- 2. COMPANIES.CREDIT_DEBT: overdraft carried outside the lots
-- ============================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS credit_debt INTEGER NOT NULL DEFAULT 0 CHECK (credit_debt >= 0);

-- ============================================================
-- 3. CREDIT_LEDGER: new reason ('expire'), new op ('chat'), lot provenance
-- ============================================================
-- Postgres auto-names the inline column CHECKs credit_ledger_reason_check /
-- credit_ledger_operation_type_check. Look the real names up rather than
-- trusting that, drop whatever CHECK mentions the column, and re-add a named
-- one. Re-running the migration is a no-op the second time (the guard below
-- sees the widened constraint already in place).
DO $do$
DECLARE
  v_name TEXT;
BEGIN
  -- reason
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_ledger'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%reason%'
      AND pg_get_constraintdef(oid) ILIKE '%expire%'
  ) THEN
    FOR v_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.credit_ledger'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%reason%'
    LOOP
      EXECUTE format('ALTER TABLE public.credit_ledger DROP CONSTRAINT %I', v_name);
    END LOOP;
    ALTER TABLE public.credit_ledger
      ADD CONSTRAINT credit_ledger_reason_check
      CHECK (reason IN ('grant','debit','topup','adjust','expire'));
  END IF;

  -- operation_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_ledger'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
      AND pg_get_constraintdef(oid) ILIKE '%chat%'
  ) THEN
    FOR v_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.credit_ledger'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.credit_ledger DROP CONSTRAINT %I', v_name);
    END LOOP;
    ALTER TABLE public.credit_ledger
      ADD CONSTRAINT credit_ledger_operation_type_check
      CHECK (operation_type IS NULL OR operation_type IN ('estimate','photo_batch','audio_minutes','price_research','chat'));
  END IF;
END $do$;

-- lot_id: the lot a grant created / an expiry zeroed. NULL for debits (a debit
-- may drain several lots — see lot_split) and for legacy rows.
-- lot_split: on a debit, JSON array of {"lot_id": uuid, "credits": n} per lot
-- drained, plus {"debt": n} when part of the debit went to credit_debt.
ALTER TABLE public.credit_ledger
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES public.credit_lots(id) ON DELETE SET NULL;
ALTER TABLE public.credit_ledger
  ADD COLUMN IF NOT EXISTS lot_split JSONB;

-- ============================================================
-- 4. grant_credit_lot: create a lot + ledger row + cache refresh (atomic)
-- ============================================================
-- Idempotent on (company_id, idempotency_key) exactly like
-- apply_credit_ledger_entry: a fast-path SELECT, with the unique_violation
-- handler as the real correctness backstop. All mutations happen inside ONE
-- BEGIN..EXCEPTION sub-block, so a lost idempotency race rolls the lot insert,
-- the debt paydown and the cache write back automatically (nothing to undo by
-- hand). The company row lock is taken BEFORE the sub-block and is held to the
-- end of the transaction, serializing concurrent callers for the same company.
--
-- Pays down credit_debt first: lot.remaining = granted - min(granted, debt).
-- The ledger row still records delta = +p_credits (the full grant), which keeps
-- SUM(delta_credits) equal to credit_balance.
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
    -- Lost an idempotency race the fast path missed. The sub-block's lot
    -- insert / debt paydown / cache write were rolled back automatically;
    -- report the winner's row.
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
  'Atomic, idempotent credit grant: locks the company row, pays down credit_debt first, inserts a credit_lots row, writes the credit_ledger row (delta = +credits, lot_id) and recomputes companies.credit_balance from the lots invariant. Service-role only. SEED-055 Phase B.';

-- ============================================================
-- 5. consume_credits: debit by draining lots (atomic, idempotent)
-- ============================================================
-- Drain order over LIVE lots (remaining > 0 and not expired):
--   1. source = 'monthly'
--   2. source = 'signup'
--   3. everything else (topup, adjust) by expires_at ASC NULLS LAST,
--      then created_at ASC (soonest expiry first, oldest first on ties).
-- Any shortfall is added to credit_debt. ONE ledger row is written
-- (delta = -p_credits) whose lot_split records the per-lot split.
--
-- p_reason defaults to 'debit' (a metered AI operation). Admin corrections and
-- refund clawbacks pass 'adjust' so the ledger keeps its original reason; the
-- drain logic is identical.
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
    -- Lost an idempotency race: the sub-block (lot drains, debt, cache, ledger)
    -- rolled back automatically. Report the winner's balance.
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
  'Atomic, idempotent credit debit: locks the company row, drains live lots (monthly, then signup, then the rest by soonest expiry), adds any shortfall to credit_debt, writes ONE credit_ledger row (delta = -credits, lot_split JSON) and recomputes companies.credit_balance. Service-role only. SEED-055 Phase B.';

-- ============================================================
-- 6. expire_credit_lots: sweep lapsed lots (hourly cron)
-- ============================================================
-- For every lot with expires_at <= now() and remaining > 0: write an 'expire'
-- ledger row (delta = -remaining, lot_id, key expire:{lot_id}), zero the lot and
-- refresh the company cache. Locks one company at a time. Returns the number of
-- lots expired. Safe to re-run: a swept lot has remaining = 0 and is skipped.
CREATE OR REPLACE FUNCTION public.expire_credit_lots()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company UUID;
  v_lot RECORD;
  v_debt INTEGER;
  v_live_sum BIGINT;
  v_new_balance INTEGER;
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

    -- Re-select under the lock so a concurrent consume cannot be missed.
    FOR v_lot IN
      SELECT l.id, l.remaining
      FROM public.credit_lots l
      WHERE l.company_id = v_company
        AND l.expires_at <= now()
        AND l.remaining > 0
      ORDER BY l.expires_at ASC, l.created_at ASC
    LOOP
      UPDATE public.credit_lots AS l
      SET remaining = 0
      WHERE l.id = v_lot.id;

      SELECT COALESCE(SUM(l.remaining), 0) INTO v_live_sum
      FROM public.credit_lots l
      WHERE l.company_id = v_company
        AND (l.expires_at IS NULL OR l.expires_at > now());
      v_new_balance := v_live_sum - v_debt;

      UPDATE public.companies AS c
      SET credit_balance = v_new_balance
      WHERE c.id = v_company;

      INSERT INTO public.credit_ledger (
        company_id, delta_credits, reason, operation_type, ref_id,
        real_cost_usd, markup, balance_after, idempotency_key, lot_id
      ) VALUES (
        v_company, -v_lot.remaining, 'expire', NULL, NULL,
        NULL, NULL, v_new_balance, 'expire:' || v_lot.id::text, v_lot.id
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_credit_lots FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.expire_credit_lots IS
  'Sweeps credit lots past expires_at: writes an expire ledger row (delta = -remaining), zeroes remaining and recomputes companies.credit_balance per company under a row lock. Returns the number of lots expired. Service-role only. SEED-055 Phase B.';

-- ============================================================
-- 7. BACKFILL: existing balances become lots (no ledger rows, no balance change)
-- ============================================================
-- Only companies that have NO lots yet, so re-running is a no-op. A positive
-- balance becomes one non-expiring 'adjust' lot (replaced at cutover, SEED-055
-- D7); a negative balance becomes credit_debt. The cache is left as it is: it
-- already equals lots - debt by construction.
INSERT INTO public.credit_lots (company_id, source, granted, remaining, expires_at, ref_id)
SELECT c.id, 'adjust', c.credit_balance, c.credit_balance, NULL, 'backfill-seed055'
FROM public.companies c
WHERE c.credit_balance > 0
  AND NOT EXISTS (SELECT 1 FROM public.credit_lots l WHERE l.company_id = c.id);

UPDATE public.companies c
SET credit_debt = -c.credit_balance
WHERE c.credit_balance < 0
  AND c.credit_debt = 0
  AND NOT EXISTS (SELECT 1 FROM public.credit_lots l WHERE l.company_id = c.id);
