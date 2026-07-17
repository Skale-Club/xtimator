-- Phase 165 Plan 01 (SAVE-01/02) — v4.19 audit § B (B1/B2/B3): saveEstimate is
-- today a non-transactional sequence of separate PostgREST calls (header
-- UPDATE incl. totals + updated_at commits FIRST, then per-section/per-item
-- upserts, then per-section orphan item deletes, then the estimate-level
-- orphan section delete, then the project total UPDATE). A failure at any
-- later step leaves header totals != items (B1), and because the failed call
-- already committed the new updated_at, the NEXT save from the SAME session
-- fails the client's `.eq('updated_at', expectedUpdatedAt)` optimistic-
-- concurrency check and returns a FALSE "changed elsewhere" conflict whose
-- only exit discards the user's edits (B2 — session poisoning). There is also
-- no server-side is_current guard, and no updated_at trigger, so a stale open
-- tab can silently write to an orphaned superseded version (B3, closed by the
-- companion 20260717000005 trigger migration).
--
-- This function makes the WHOLE write set — header compare-and-set, all
-- section/item upserts, both orphan-delete passes, and the project total —
-- ONE atomic Postgres transaction (plpgsql body = one implicit transaction;
-- any RAISE rolls back everything). GUARD-03 is preserved: this function does
-- ZERO business math (only casts jsonb -> typed columns) — computeEstimateTotals
-- in lib/actions/estimate.ts remains the SOLE authority for subtotal/tax/
-- discount/total; this function only PERSISTS the already-computed values.
--
-- SECURITY INVOKER (not DEFINER): the caller is the authenticated end user via
-- supabase.rpc(...), so ordinary RLS policies on estimates/estimate_sections/
-- estimate_items/projects apply exactly as they do for direct table access
-- today — tenant isolation is enforced by RLS, not by this function. This is
-- why the function ends with a GRANT (not the REVOKE the credit-ledger
-- template — 20260706000002 — ends with): that template is SECURITY DEFINER
-- and service-role-only; a REVOKE here would make this function unreachable
-- from the one place that's supposed to call it.

CREATE OR REPLACE FUNCTION public.save_estimate_atomic(
  p_estimate_id uuid,
  p_company_id uuid,
  p_expected_updated_at timestamptz,
  p_header jsonb,
  p_sections jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sent_at            timestamptz;
  v_client_response     text;
  v_is_current          boolean;
  v_project_id          uuid;
  v_previous_total      numeric;
  v_locked_updated_at   timestamptz;
  v_has_signature       boolean;
  v_new_updated_at      timestamptz;
  v_project_total       numeric;
  v_section             jsonb;
  v_item                jsonb;
  v_section_id          uuid;
  v_item_id             uuid;
  v_section_is_new      boolean;
  v_item_idx            integer;
  v_item_sort_order     integer;
  v_incoming_section_ids uuid[] := '{}';
  v_incoming_item_ids    uuid[];
  v_id_map               jsonb := '{}'::jsonb;
BEGIN
  -- Step 1: row lock + snapshot. FOR UPDATE serializes concurrent saves on
  -- this estimate (a second caller blocks here until the first's transaction
  -- commits or rolls back, then re-reads the LATEST committed row via
  -- EvalPlanQual) — so v_locked_updated_at below is always the locked
  -- snapshot's value, never a stale read racing a concurrent writer.
  SELECT sent_at, client_response, is_current, project_id, total, updated_at
    INTO v_sent_at, v_client_response, v_is_current, v_project_id, v_previous_total, v_locked_updated_at
    FROM public.estimates
    WHERE id = p_estimate_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = 'P0004';
  END IF;

  -- Step 2: freeze-on-send/sign guard (TRUST-02 semantics, now enforced
  -- INSIDE the transaction instead of via a separate pre-UPDATE SELECT that
  -- races the write it's guarding). Signed-but-unresponded window: an
  -- estimate_signatures row can exist even when sent_at/client_response are
  -- still both null (app/api/estimates/[id]/sign/route.ts inserts the
  -- signature before calling respondToEstimate and swallows a respond
  -- failure) — so the signature-existence check is required in ADDITION to
  -- the sent_at/client_response check, not redundant with it.
  SELECT EXISTS(
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = p_estimate_id
  ) INTO v_has_signature;

  IF v_has_signature OR v_sent_at IS NOT NULL OR v_client_response IS NOT NULL THEN
    RAISE EXCEPTION 'estimate_locked' USING ERRCODE = 'P0001';
  END IF;

  -- Step 3: server-side is_current guard (new — closes B3: previously only
  -- the client's stale editor state stood between a superseded version and a
  -- silent write).
  IF v_is_current IS NOT TRUE THEN
    RAISE EXCEPTION 'estimate_not_current' USING ERRCODE = 'P0003';
  END IF;

  -- Step 4: optimistic-concurrency compare-and-set. p_expected_updated_at is
  -- NULL for non-editor callers (skips the check, matching today's
  -- back-compat `if (estimateData.expectedUpdatedAt)` branch). Compares
  -- against v_locked_updated_at — the value read INSIDE this transaction's
  -- row lock (step 1), not a separately-fetched value that could already be
  -- stale by the time this statement runs.
  IF p_expected_updated_at IS NOT NULL AND v_locked_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'estimate_conflict' USING ERRCODE = 'P0002';
  END IF;

  -- Step 5: header UPDATE. updated_at is DELIBERATELY OMITTED — the
  -- trg_estimates_set_updated_at trigger (20260717000005) owns it, firing on
  -- this exact UPDATE. presentation_settings uses the jsonb `->` accessor
  -- (not `->>`) so a JSON null value round-trips correctly.
  UPDATE public.estimates
  SET
    summary             = p_header->>'summary',
    notes                = p_header->>'notes',
    timeline             = p_header->>'timeline',
    payment_terms        = p_header->>'payment_terms',
    warranty_terms       = p_header->>'warranty_terms',
    discount_type        = p_header->>'discount_type',
    discount_value       = (p_header->>'discount_value')::numeric,
    discount_amount      = (p_header->>'discount_amount')::numeric,
    estimate_date        = (p_header->>'estimate_date')::date,
    estimate_number      = p_header->>'estimate_number',
    tax_rate             = (p_header->>'tax_rate')::numeric,
    tax_amount           = (p_header->>'tax_amount')::numeric,
    subtotal             = (p_header->>'subtotal')::numeric,
    total                = (p_header->>'total')::numeric,
    deposit_type         = COALESCE(p_header->>'deposit_type', 'none'),
    deposit_value        = (p_header->>'deposit_value')::numeric,
    balance_due          = (p_header->>'balance_due')::numeric,
    presentation_settings = p_header->'presentation_settings'
  WHERE id = p_estimate_id
  RETURNING updated_at INTO v_new_updated_at;

  -- Step 6: section/item upsert + orphan deletes, in payload array order.
  -- Reproduces the CURRENT JS semantics exactly: for a NEW section (temp- id)
  -- every one of its items is unconditionally INSERTed (mirrors
  -- lib/actions/estimate.ts's "Insert items for new section" branch, which
  -- never checks isNewItem on an item belonging to a brand-new section); for
  -- an EXISTING section, each item is checked individually (temp- -> INSERT,
  -- real id -> UPDATE).
  --
  -- sort_order asymmetry (load-bearing, verified against the current JS
  -- byte-for-byte): a NEW section's items are inserted with sort_order = the
  -- item's POSITIONAL INDEX in the payload array (`section.items.map((item,
  -- idx) => ({ ..., sort_order: idx }))` — the client-sent item.sort_order is
  -- IGNORED for a brand-new section's items). An EXISTING section's items
  -- (whether newly inserted into it or updated) use the client-supplied
  -- item.sort_order verbatim. v_item_idx reproduces the array-index counter.
  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    v_section_is_new := (v_section->>'id') LIKE 'temp-%';
    v_item_idx := 0;

    IF v_section_is_new THEN
      INSERT INTO public.estimate_sections (estimate_id, company_id, title, sort_order, subtotal)
      VALUES (
        p_estimate_id, p_company_id, v_section->>'title',
        (v_section->>'sort_order')::integer, (v_section->>'subtotal')::numeric
      )
      RETURNING id INTO v_section_id;

      v_id_map := v_id_map || jsonb_build_object(v_section->>'id', v_section_id::text);
    ELSE
      v_section_id := (v_section->>'id')::uuid;

      UPDATE public.estimate_sections
      SET title = v_section->>'title',
          sort_order = (v_section->>'sort_order')::integer,
          subtotal = (v_section->>'subtotal')::numeric
      WHERE id = v_section_id;
    END IF;

    v_incoming_section_ids := v_incoming_section_ids || v_section_id;
    v_incoming_item_ids := '{}';

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'items', '[]'::jsonb))
    LOOP
      -- sort_order asymmetry (see comment above the outer loop): a brand-new
      -- section's items get the positional array index; an existing
      -- section's items (new or updated) get the client-supplied value.
      v_item_sort_order := CASE
        WHEN v_section_is_new THEN v_item_idx
        ELSE (v_item->>'sort_order')::integer
      END;

      IF v_section_is_new OR (v_item->>'id') LIKE 'temp-%' THEN
        INSERT INTO public.estimate_items (
          section_id, company_id, description, quantity, unit, unit_price, total,
          sort_order, price_source, taxable, tax_category, discount, cost, markup_pct
        ) VALUES (
          v_section_id, p_company_id, v_item->>'description', (v_item->>'quantity')::numeric,
          v_item->>'unit', (v_item->>'unit_price')::numeric, (v_item->>'total')::numeric,
          v_item_sort_order, v_item->>'price_source',
          COALESCE((v_item->>'taxable')::boolean, true), v_item->>'tax_category',
          COALESCE((v_item->>'discount')::numeric, 0), (v_item->>'cost')::numeric,
          (v_item->>'markup_pct')::numeric
        )
        RETURNING id INTO v_item_id;

        v_id_map := v_id_map || jsonb_build_object(v_item->>'id', v_item_id::text);
      ELSE
        v_item_id := (v_item->>'id')::uuid;

        UPDATE public.estimate_items
        SET description  = v_item->>'description',
            quantity      = (v_item->>'quantity')::numeric,
            unit          = v_item->>'unit',
            unit_price    = (v_item->>'unit_price')::numeric,
            total         = (v_item->>'total')::numeric,
            sort_order    = v_item_sort_order,
            price_source  = v_item->>'price_source',
            taxable       = COALESCE((v_item->>'taxable')::boolean, true),
            tax_category  = v_item->>'tax_category',
            discount      = COALESCE((v_item->>'discount')::numeric, 0),
            cost          = (v_item->>'cost')::numeric,
            markup_pct    = (v_item->>'markup_pct')::numeric
        WHERE id = v_item_id;
      END IF;

      v_incoming_item_ids := v_incoming_item_ids || v_item_id;
      v_item_idx := v_item_idx + 1;
    END LOOP;

    -- Per-section orphan item delete. `<> ALL(array)` (NOT `NOT IN (...)`) is
    -- load-bearing: an empty v_incoming_item_ids ('{}') makes `id <> ALL('{}')`
    -- evaluate to TRUE for every row (deletes everything left in the
    -- section), exactly reproducing today's JS behavior when a kept section
    -- is emptied of all items. A `NOT IN ('{}')`-style empty-list comparison
    -- would instead evaluate to NULL/false for every row and silently
    -- SUPPRESS the delete (Opus nit #6).
    DELETE FROM public.estimate_items
    WHERE section_id = v_section_id
      AND id <> ALL(v_incoming_item_ids);
  END LOOP;

  -- Estimate-level orphan section delete (items cascade via FK ON DELETE
  -- CASCADE — no separate item cleanup needed here). Same `<> ALL(array)`
  -- empty-list discipline as above: an estimate saved with zero sections
  -- deletes every existing section.
  DELETE FROM public.estimate_sections
  WHERE estimate_id = p_estimate_id
    AND id <> ALL(v_incoming_section_ids);

  -- Step 7: project total (persist-only — v_project_total is the SAME
  -- already-computed p_header->>'total' the header UPDATE just wrote, not a
  -- recomputation).
  v_project_total := (p_header->>'total')::numeric;

  IF v_project_id IS NOT NULL THEN
    UPDATE public.projects SET total = v_project_total WHERE id = v_project_id;
  END IF;

  -- Step 8: return the new version token, the id remap for every newly
  -- inserted section/item, and the totals/ids the caller needs WITHOUT a
  -- re-fetch (project_id + previous_total replace the pre-UPDATE SELECT this
  -- function's transactional guard makes obsolete — the calling action's
  -- post-RPC estimate_updated activity insert has a NOT-NULL project_id and
  -- needs both for its total_delta + revalidatePath).
  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'project_total', v_project_total,
    'project_id', v_project_id,
    'previous_total', v_previous_total,
    'id_map', v_id_map
  );
END;
$$;

-- Caller-facing RPC invoked directly by the authenticated end user via
-- supabase.rpc('save_estimate_atomic', ...) from lib/actions/estimate.ts's
-- saveEstimate. SECURITY INVOKER (see header comment) — RLS enforces tenant
-- isolation exactly as it does for direct table access, so this GRANT does
-- NOT widen any tenant's effective permissions.
GRANT EXECUTE ON FUNCTION public.save_estimate_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_estimate_atomic IS
  'Phase 165 (SAVE-01/02): atomic saveEstimate persistence. Locks the estimate row, re-checks lock (sent_at/client_response/signature) + is_current + the optimistic-concurrency compare-and-set INSIDE the transaction, then persists the already-computed (GUARD-03: computed in TypeScript, never here) header + section/item upserts + orphan deletes + project total as ONE atomic write. Returns {updated_at, project_total, project_id, previous_total, id_map}. SECURITY INVOKER — RLS applies as the calling authenticated user.';
