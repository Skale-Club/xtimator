-- supabase/migrations/20261117000001_change_orders.sql
-- Change orders ("aditivos"): small signed documents attached to an ACCEPTED
-- estimate. The accepted estimate is the contract and never changes; every
-- later change to the work is a change order the client approves and signs on
-- its own. Contract total = accepted estimate + approved change orders.
-- Contract of record: lib/change-orders/types.ts (decision XTM-CONTRACT-CO-01).
--
-- APPLY BY HAND to BOTH databases (Supabase dev AND the Coolify production
-- database) BEFORE the deploy that depends on it; the deploy never runs
-- migrations. This migration only ADDS objects: it changes no row of any
-- existing table. Idempotent (IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR
-- REPLACE), safe to re-run.
--
-- Tables
--   change_orders            header + share token + client answer + totals
--   change_order_items       lines (positive = added work, negative = credit)
--   change_order_signatures  immutable evidence of an online signature
--
-- SQLSTATE registry (P0001-P0009 are taken by save_estimate_atomic /
-- block_signed_estimate_delete / sign_estimate_atomic, see
-- 20260729000002 and 20261116000001; this file claims P0010-P0016):
--   P0010 change_order_signed_undeletable  BEFORE DELETE trigger on change_orders
--   P0011 change_order_locked              save_change_order_atomic: answered or signed
--   P0012 change_order_conflict            save / sign compare-and-set on updated_at
--   P0013 change_order_not_found           save / sign: no such row (sign: id + token)
--   P0014 contract_not_accepted            create / sign: parent estimate is not the
--                                          current, accepted version
--   P0015 change_order_already_responded   sign: answered already or a signature exists
--   P0016 estimate_not_found               create_change_order: no such estimate
--
-- RPCs
--   create_change_order(uuid)                 SECURITY INVOKER, authenticated
--   save_change_order_atomic(uuid, uuid,
--       timestamptz, jsonb, jsonb)            SECURITY INVOKER, authenticated
--   sign_change_order_atomic(uuid, uuid,
--       timestamptz, text, text, text, inet,
--       text, jsonb, numeric, text)           SECURITY DEFINER, service_role ONLY
--   bump_change_order_view(uuid)              SECURITY DEFINER, service_role ONLY
--
-- Evidence retention: a signed change order cannot be deleted (P0010), including
-- through ON DELETE CASCADE from estimates / projects / companies. The trigger
-- honours the SAME escape hatch as trg_estimates_block_signed_delete
-- (20260729000001): `SET LOCAL app.allow_signed_estimate_delete = 'on'`, which
-- public.erase_company_for_compliance() already sets inside its transaction, so
-- GDPR/CCPA erasure of a company keeps working with NO change to that function.
--
-- updated_at is the concurrency token (saves compare-and-set on it, signing
-- re-checks it under the row lock). The BEFORE UPDATE trigger therefore skips
-- the engagement counters (view_count / viewed_at), exactly like
-- 20260825000002 does for estimates: a client merely OPENING the page must not
-- invalidate the owner's in-flight save or the client's own signature.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.change_orders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id       uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  estimate_id      uuid        NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  number           integer     NOT NULL,
  title            text        NOT NULL DEFAULT '',
  reason           text,
  extra_days       integer,
  status           text        NOT NULL DEFAULT 'draft',
  share_token      uuid        NOT NULL DEFAULT gen_random_uuid(),
  sent_at          timestamptz,
  viewed_at        timestamptz,
  view_count       integer     NOT NULL DEFAULT 0,
  responded_at     timestamptz,
  client_response  text,
  tax_rate         numeric(7,4) NOT NULL DEFAULT 0,
  subtotal         numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount       numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL DEFAULT 0,
  currency_code    text        NOT NULL DEFAULT 'USD',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_orders_number_positive CHECK (number > 0),
  CONSTRAINT change_orders_status_check CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  CONSTRAINT change_orders_client_response_check CHECK (client_response IS NULL OR client_response IN ('accepted', 'declined')),
  CONSTRAINT change_orders_extra_days_check CHECK (extra_days IS NULL OR extra_days >= 0),
  CONSTRAINT change_orders_estimate_number_key UNIQUE (estimate_id, number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_change_orders_share_token ON public.change_orders (share_token);
CREATE INDEX IF NOT EXISTS idx_change_orders_estimate_id ON public.change_orders (estimate_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_company_id ON public.change_orders (company_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_project_id ON public.change_orders (project_id);

CREATE TABLE IF NOT EXISTS public.change_order_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id  uuid        NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  description      text        NOT NULL DEFAULT '',
  quantity         numeric(10,3) NOT NULL DEFAULT 1,
  unit             text,
  unit_price       numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL DEFAULT 0,
  taxable          boolean     NOT NULL DEFAULT true,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_order_items_change_order_id ON public.change_order_items (change_order_id);
CREATE INDEX IF NOT EXISTS idx_change_order_items_company_id ON public.change_order_items (company_id);

CREATE TABLE IF NOT EXISTS public.change_order_signatures (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id  uuid        NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signer_name      text        NOT NULL,
  signer_email     text,
  signature_data   text        NOT NULL,
  ip_address       inet,
  user_agent       text,
  signed_content   jsonb       NOT NULL,
  signed_total     numeric(12,2) NOT NULL,
  signed_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_order_signatures_one_per_change_order UNIQUE (change_order_id)
);

CREATE INDEX IF NOT EXISTS idx_change_order_signatures_company_id ON public.change_order_signatures (company_id);

-- ---------------------------------------------------------------------------
-- 2. updated_at (concurrency token) + signed-delete block
-- ---------------------------------------------------------------------------

-- public.set_updated_at() already exists (20260717000005) and is shared by
-- other tables; it is deliberately NOT redefined here.

DROP TRIGGER IF EXISTS trg_change_orders_set_updated_at ON public.change_orders;

CREATE TRIGGER trg_change_orders_set_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW
  WHEN (
    (to_jsonb(OLD) - 'view_count' - 'viewed_at' - 'updated_at')
    IS DISTINCT FROM
    (to_jsonb(NEW) - 'view_count' - 'viewed_at' - 'updated_at')
  )
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.block_signed_change_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Same escape hatch as block_signed_estimate_delete (see header).
  IF current_setting('app.allow_signed_estimate_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.change_order_signatures WHERE change_order_id = OLD.id) THEN
    RAISE EXCEPTION 'change_order_signed_undeletable' USING ERRCODE = 'P0010';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_change_orders_block_signed_delete ON public.change_orders;

CREATE TRIGGER trg_change_orders_block_signed_delete
  BEFORE DELETE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.block_signed_change_order_delete();

-- ---------------------------------------------------------------------------
-- 3. RLS: company members (same predicate as estimates / estimate_items after
--    phase82), RESTRICTIVE owned-session and demo read-only policies, and
--    explicit grants (default privileges grant ALL on new tables).
-- ---------------------------------------------------------------------------

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "change_orders_select" ON public.change_orders;
CREATE POLICY "change_orders_select" ON public.change_orders FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_orders_insert" ON public.change_orders;
CREATE POLICY "change_orders_insert" ON public.change_orders FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_orders_update" ON public.change_orders;
CREATE POLICY "change_orders_update" ON public.change_orders FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_orders_delete" ON public.change_orders;
CREATE POLICY "change_orders_delete" ON public.change_orders FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_order_items_select" ON public.change_order_items;
CREATE POLICY "change_order_items_select" ON public.change_order_items FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_order_items_insert" ON public.change_order_items;
CREATE POLICY "change_order_items_insert" ON public.change_order_items FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_order_items_update" ON public.change_order_items;
CREATE POLICY "change_order_items_update" ON public.change_order_items FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))))
  WITH CHECK ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

DROP POLICY IF EXISTS "change_order_items_delete" ON public.change_order_items;
CREATE POLICY "change_order_items_delete" ON public.change_order_items FOR DELETE TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- Signatures: members may only READ. The only writer is the SECURITY DEFINER
-- sign_change_order_atomic (service_role), so there is no INSERT/UPDATE/DELETE
-- policy and no such grant for authenticated.
DROP POLICY IF EXISTS "change_order_signatures_select" ON public.change_order_signatures;
CREATE POLICY "change_order_signatures_select" ON public.change_order_signatures FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT company_members.company_id FROM company_members WHERE (company_members.user_id = ( SELECT auth.uid() AS uid )))));

-- RESTRICTIVE owned-session policy (20261105000001 only covered the tables that
-- existed when it ran) and the demo read-only triplets (20260726000001 likewise).
-- Guarded so the file still applies on a database where those helpers are absent.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['change_orders', 'change_order_items', 'change_order_signatures']
  LOOP
    IF to_regprocedure('public.xtimator_session_active()') IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS xtimator_owned_session ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY xtimator_owned_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.xtimator_session_active()) WITH CHECK (public.xtimator_session_active())',
        t
      );
    END IF;

    IF to_regprocedure('public.is_demo_user()') IS NOT NULL
       AND to_regprocedure('public.is_demo_company(uuid)') IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS demo_block_insert ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY demo_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_demo_user())',
        t
      );
      EXECUTE format('DROP POLICY IF EXISTS demo_block_update ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY demo_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_demo_user()) WITH CHECK (NOT public.is_demo_user())',
        t
      );
      EXECUTE format('DROP POLICY IF EXISTS demo_block_delete ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY demo_block_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_demo_user())',
        t
      );

      EXECUTE format('DROP POLICY IF EXISTS demo_company_block_insert ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY demo_company_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_demo_company(company_id))',
        t
      );
      EXECUTE format('DROP POLICY IF EXISTS demo_company_block_update ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY demo_company_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_demo_company(company_id)) WITH CHECK (NOT public.is_demo_company(company_id))',
        t
      );
      EXECUTE format('DROP POLICY IF EXISTS demo_company_block_delete ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY demo_company_block_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_demo_company(company_id))',
        t
      );
    END IF;
  END LOOP;
END
$$;

-- Grants. Default privileges hand ALL to anon/authenticated on every new table
-- (Supabase) so each one is reset explicitly, on both platforms.
REVOKE ALL ON public.change_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.change_order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.change_order_signatures FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_order_items TO authenticated;
GRANT SELECT ON public.change_order_signatures TO authenticated;

GRANT ALL ON public.change_orders TO service_role;
GRANT ALL ON public.change_order_items TO service_role;
GRANT ALL ON public.change_order_signatures TO service_role;

-- ---------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------

-- 4a. create_change_order: next number on an accepted, current estimate.
-- SECURITY INVOKER: RLS applies, so only a member of the estimate's company can
-- lock the estimate row and insert. The FOR UPDATE on the estimate serializes
-- concurrent creators, so max(number)+1 never collides.
CREATE OR REPLACE FUNCTION public.create_change_order(p_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id      uuid;
  v_project_id      uuid;
  v_client_response text;
  v_is_current      boolean;
  v_tax_rate        numeric;
  v_currency_code   text;
  v_number          integer;
  v_id              uuid;
BEGIN
  SELECT company_id, project_id, client_response, is_current, tax_rate, currency_code
    INTO v_company_id, v_project_id, v_client_response, v_is_current, v_tax_rate, v_currency_code
    FROM public.estimates
    WHERE id = p_estimate_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = 'P0016';
  END IF;

  IF v_is_current IS NOT TRUE OR v_client_response IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'contract_not_accepted' USING ERRCODE = 'P0014';
  END IF;

  SELECT COALESCE(MAX(number), 0) + 1
    INTO v_number
    FROM public.change_orders
    WHERE estimate_id = p_estimate_id;

  INSERT INTO public.change_orders (
    company_id, project_id, estimate_id, number, tax_rate, currency_code
  ) VALUES (
    v_company_id, v_project_id, p_estimate_id, v_number,
    COALESCE(v_tax_rate, 0), COALESCE(v_currency_code, 'USD')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_change_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_change_order(uuid) TO authenticated, service_role;

-- 4b. save_change_order_atomic: header + items replaced as a whole.
-- Totals are recomputed here exactly like computeChangeOrderTotals in
-- lib/change-orders/types.ts: cents rounding per line with JS Math.round
-- semantics (floor(x * 100 + 0.5) / 100: halves go toward +infinity, which
-- differs from numeric round() only for negative half-cents), tax on the
-- taxable lines at the stored tax_rate (a FRACTION copied from estimates.tax_rate,
-- 0.0625 = 6.25%; no division by 100).
CREATE OR REPLACE FUNCTION public.save_change_order_atomic(
  p_change_order_id uuid,
  p_company_id uuid,
  p_expected_updated_at timestamptz,
  p_header jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_response   text;
  v_locked_updated_at timestamptz;
  v_tax_rate          numeric;
  v_has_signature     boolean;
  v_item              jsonb;
  v_idx               integer := 0;
  v_qty               numeric;
  v_price             numeric;
  v_line              numeric;
  v_taxable           boolean;
  v_subtotal          numeric := 0;
  v_taxable_sum       numeric := 0;
  v_tax               numeric;
  v_total             numeric;
  v_item_id           uuid;
  v_new_updated_at    timestamptz;
BEGIN
  SELECT client_response, updated_at, tax_rate
    INTO v_client_response, v_locked_updated_at, v_tax_rate
    FROM public.change_orders
    WHERE id = p_change_order_id
      AND company_id = p_company_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_order_not_found' USING ERRCODE = 'P0013';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.change_order_signatures WHERE change_order_id = p_change_order_id
  ) INTO v_has_signature;

  IF v_has_signature OR v_client_response IS NOT NULL THEN
    RAISE EXCEPTION 'change_order_locked' USING ERRCODE = 'P0011';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_locked_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'change_order_conflict' USING ERRCODE = 'P0012';
  END IF;

  DELETE FROM public.change_order_items WHERE change_order_id = p_change_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_taxable := COALESCE((v_item->>'taxable')::boolean, true);
    v_line := floor(v_qty * v_price * 100 + 0.5) / 100;
    v_subtotal := v_subtotal + v_line;
    IF v_taxable THEN
      v_taxable_sum := v_taxable_sum + v_line;
    END IF;

    -- Keep a client-supplied id only when it is a real uuid; anything else
    -- (temp ids from the editor) gets a fresh one.
    v_item_id := CASE
      WHEN (v_item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (v_item->>'id')::uuid
      ELSE gen_random_uuid()
    END;

    INSERT INTO public.change_order_items (
      id, change_order_id, company_id, description, quantity, unit, unit_price, total, taxable, sort_order
    ) VALUES (
      v_item_id, p_change_order_id, p_company_id,
      COALESCE(v_item->>'description', ''), v_qty, v_item->>'unit', v_price, v_line, v_taxable,
      COALESCE((v_item->>'sort_order')::integer, v_idx)
    );

    v_idx := v_idx + 1;
  END LOOP;

  v_subtotal := floor(v_subtotal * 100 + 0.5) / 100;
  v_tax := floor((v_taxable_sum * COALESCE(v_tax_rate, 0)) * 100 + 0.5) / 100;
  v_total := floor((v_subtotal + v_tax) * 100 + 0.5) / 100;

  -- updated_at is set explicitly: the BEFORE UPDATE trigger only fires when a
  -- header column changed, and a save that edits ONLY lines (same totals, same
  -- header) must still move the version token the client signs against.
  UPDATE public.change_orders
  SET
    title      = COALESCE(p_header->>'title', ''),
    reason     = p_header->>'reason',
    extra_days = (p_header->>'extra_days')::integer,
    subtotal   = v_subtotal,
    tax_amount = v_tax,
    total      = v_total,
    updated_at = GREATEST(clock_timestamp(), v_locked_updated_at + interval '1 microsecond')
  WHERE id = p_change_order_id
  RETURNING updated_at INTO v_new_updated_at;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'subtotal', v_subtotal,
    'tax_amount', v_tax,
    'total', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_change_order_atomic(uuid, uuid, timestamptz, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_change_order_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated, service_role;

-- 4c. sign_change_order_atomic: public online signature, mirrors
-- sign_estimate_atomic. SECURITY DEFINER, service_role only: the caller has no
-- Supabase session (public share link).
CREATE OR REPLACE FUNCTION public.sign_change_order_atomic(
  p_change_order_id uuid,
  p_share_token uuid,
  p_expected_updated_at timestamptz,
  p_signer_name text,
  p_signer_email text,
  p_signature_data text,
  p_ip_address inet,
  p_user_agent text,
  p_signed_content jsonb,
  p_signed_total numeric,
  p_snapshot_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id        uuid;
  v_project_id        uuid;
  v_estimate_id       uuid;
  v_number            integer;
  v_title             text;
  v_client_response   text;
  v_locked_updated_at timestamptz;
  v_has_signature     boolean;
  v_est_response      text;
  v_est_current       boolean;
  v_est_total         numeric;
  v_est_number        text;
  v_est_seq           integer;
  v_est_version       integer;
  v_base_total        numeric;
  v_approved_total    numeric;
  v_contract_total    numeric;
  v_client_name       text;
BEGIN
  -- Row lock by id AND share_token together (a token mismatch behaves exactly
  -- like a missing row, never leaking that the id exists).
  SELECT company_id, project_id, estimate_id, number, title, client_response, updated_at
    INTO v_company_id, v_project_id, v_estimate_id, v_number, v_title, v_client_response, v_locked_updated_at
    FROM public.change_orders
    WHERE id = p_change_order_id
      AND share_token = p_share_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_order_not_found' USING ERRCODE = 'P0013';
  END IF;

  -- The parent must still be the current, accepted estimate. FOR SHARE keeps a
  -- concurrent "clear the acceptance" from landing between this check and the
  -- project total write below.
  SELECT client_response, is_current, total, estimate_number, estimate_seq, version
    INTO v_est_response, v_est_current, v_est_total, v_est_number, v_est_seq, v_est_version
    FROM public.estimates
    WHERE id = v_estimate_id
    FOR SHARE;

  IF NOT FOUND OR v_est_current IS NOT TRUE OR v_est_response IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'contract_not_accepted' USING ERRCODE = 'P0014';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.change_order_signatures WHERE change_order_id = p_change_order_id
  ) INTO v_has_signature;

  IF v_client_response IS NOT NULL OR v_has_signature THEN
    RAISE EXCEPTION 'change_order_already_responded' USING ERRCODE = 'P0015';
  END IF;

  -- Torn-snapshot guard: the client must sign the exact content the route
  -- snapshotted, so the version it observed must still be the live one.
  IF v_locked_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'change_order_conflict' USING ERRCODE = 'P0012';
  END IF;

  INSERT INTO public.change_order_signatures (
    change_order_id, company_id, signer_name, signer_email, signature_data,
    ip_address, user_agent, signed_content, signed_total
  ) VALUES (
    p_change_order_id, v_company_id, p_signer_name, p_signer_email, p_signature_data,
    p_ip_address, p_user_agent, p_signed_content, p_signed_total
  );

  UPDATE public.change_orders
  SET client_response = 'accepted', responded_at = now(), status = 'accepted'
  WHERE id = p_change_order_id;

  -- Contract total = accepted estimate base (its latest signed total when it was
  -- signed online, else the live total) + every accepted change order, this one
  -- included (it was just flipped to accepted above).
  SELECT COALESCE(
           (SELECT es.signed_total FROM public.estimate_signatures es
             WHERE es.estimate_id = v_estimate_id AND es.signed_total IS NOT NULL
             ORDER BY es.signed_at DESC LIMIT 1),
           v_est_total,
           0)
    INTO v_base_total;

  SELECT COALESCE(SUM(total), 0)
    INTO v_approved_total
    FROM public.change_orders
    WHERE estimate_id = v_estimate_id
      AND client_response = 'accepted';

  v_contract_total := v_base_total + v_approved_total;

  UPDATE public.projects SET total = v_contract_total WHERE id = v_project_id;

  INSERT INTO public.estimate_activity (project_id, company_id, estimate_id, event_type, metadata)
  VALUES (
    v_project_id, v_company_id, v_estimate_id, 'change_order_signed',
    jsonb_build_object(
      'change_order_id', p_change_order_id,
      'number', v_number,
      'total', p_signed_total,
      'signer_name', p_signer_name,
      'snapshot_sha256', p_snapshot_sha256
    )
  );

  SELECT c.name
    INTO v_client_name
    FROM public.projects p
    LEFT JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = v_project_id;

  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'company_id', v_company_id,
    'estimate_id', v_estimate_id,
    'estimate_number', COALESCE(
      v_est_number,
      CASE WHEN v_est_seq IS NOT NULL AND v_est_seq > 0 THEN lpad(v_est_seq::text, 4, '0') ELSE v_est_version::text END
    ),
    'number', v_number,
    'title', v_title,
    'total', p_signed_total,
    'contract_total', v_contract_total,
    'client_name', v_client_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sign_change_order_atomic(
  uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sign_change_order_atomic(
  uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text
) TO service_role;

-- 4d. bump_change_order_view: engagement counter that never restamps updated_at
-- (see trg_change_orders_set_updated_at's WHEN clause).
CREATE OR REPLACE FUNCTION public.bump_change_order_view(p_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.change_orders
  SET view_count = COALESCE(view_count, 0) + 1,
      viewed_at = COALESCE(viewed_at, now())
  WHERE share_token = p_token;
$$;

REVOKE ALL ON FUNCTION public.bump_change_order_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_change_order_view(uuid) TO service_role;

COMMENT ON TABLE public.change_orders IS
  'Change orders (aditivos) on an accepted estimate. updated_at is the concurrency token; view counters are excluded from its trigger. Signed rows are undeletable (P0010).';
COMMENT ON FUNCTION public.sign_change_order_atomic IS
  'Atomic public signature of a change order. Row lock by (id, share_token); P0013 not found, P0014 parent not the current accepted estimate, P0015 already responded, P0012 stale content version. Inserts the signature + snapshot, accepts the change order, sets projects.total to the contract total, logs change_order_signed. SECURITY DEFINER, service_role only.';
