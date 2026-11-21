-- supabase/migrations/20261121130000_estimate_child_rows_stamp_version.sql
-- estimates.updated_at is the estimate's CONTENT version (see 20261121120000):
-- the owner's editor saves against it, the public sign route requires the value
-- the client's page rendered, and the PDF cache is keyed on it.
--
-- It only moved when a column of the estimates row itself changed
-- (trg_estimates_set_updated_at has a WHEN clause since 20260825000002). A change
-- to estimate_sections or estimate_items alone left it untouched:
--
--   * save_estimate_atomic with the same header and an edited item description,
--     section title, item order or unit;
--   * the WhatsApp item edits (lib/whatsapp/confirm-actions.ts), which write
--     estimate_items directly.
--
-- So a client whose page was already open could sign wording they never saw (the
-- route's version check passed and the snapshot was built from the new rows),
-- sign_estimate_atomic's torn-snapshot guard could not see such an edit, and two
-- editor tabs could overwrite each other's line edits without a conflict.
-- Confirmed on the development database on 2026-11-21 (item and section edit
-- inside a rolled-back transaction: updated_at unchanged).
--
-- 1. AFTER triggers on estimate_sections and estimate_items stamp the parent
--    estimate's updated_at whenever a row is inserted, deleted or really changed
--    (an UPDATE that rewrites the same values does not count). This covers every
--    writer, not only save_estimate_atomic. now() is the transaction start, the
--    same value set_updated_at() writes, so one transaction is one version.
-- 2. save_estimate_atomic re-reads updated_at before returning. Everything else
--    is byte-for-byte the 20261121120001 definition (pinned by
--    tests/unit/estimate-child-rows-stamp-version-migration.test.ts).
--
-- change_orders needs nothing: save_change_order_atomic already sets updated_at
-- explicitly on every save (20261117000001).
--
-- No data changes, no DROP of data. Idempotent.
-- Apply by hand to BOTH databases (Supabase dev and Coolify production) BEFORE
-- the deploy that depends on it; the deploy never runs migrations.

CREATE OR REPLACE FUNCTION public.stamp_estimate_version(p_estimate_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The explicit value survives: trg_estimates_set_updated_at ignores a change
  -- to updated_at alone. The IS DISTINCT guard makes the second and later child
  -- rows of one transaction a no-op instead of another row version.
  UPDATE public.estimates
  SET updated_at = now()
  WHERE id = p_estimate_id
    AND updated_at IS DISTINCT FROM now();
$$;

CREATE OR REPLACE FUNCTION public.stamp_estimate_version_from_section()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- An estimate deleted in this statement (ON DELETE CASCADE) is already gone:
  -- the stamp matches no row and does nothing.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.stamp_estimate_version(NEW.estimate_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.stamp_estimate_version(OLD.estimate_id);
  ELSE
    PERFORM public.stamp_estimate_version(OLD.estimate_id);
    IF NEW.estimate_id IS DISTINCT FROM OLD.estimate_id THEN
      PERFORM public.stamp_estimate_version(NEW.estimate_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_estimate_version_from_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estimate_id uuid;
BEGIN
  -- An item reaches its estimate through its section. A section deleted in this
  -- statement (cascade) is already gone: the lookup finds nothing, and the
  -- section's own trigger has stamped the estimate.
  IF TG_OP = 'INSERT' THEN
    SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = NEW.section_id;
    PERFORM public.stamp_estimate_version(v_estimate_id);
  ELSIF TG_OP = 'DELETE' THEN
    SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = OLD.section_id;
    PERFORM public.stamp_estimate_version(v_estimate_id);
  ELSE
    SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = OLD.section_id;
    PERFORM public.stamp_estimate_version(v_estimate_id);
    IF NEW.section_id IS DISTINCT FROM OLD.section_id THEN
      SELECT estimate_id INTO v_estimate_id FROM public.estimate_sections WHERE id = NEW.section_id;
      PERFORM public.stamp_estimate_version(v_estimate_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Not callable through PostgREST: the triggers run them as their owner.
REVOKE EXECUTE ON FUNCTION public.stamp_estimate_version(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_estimate_version_from_section() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_estimate_version_from_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_estimate_sections_stamp_version_ins_del ON public.estimate_sections;
CREATE TRIGGER trg_estimate_sections_stamp_version_ins_del
  AFTER INSERT OR DELETE ON public.estimate_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_estimate_version_from_section();

DROP TRIGGER IF EXISTS trg_estimate_sections_stamp_version_upd ON public.estimate_sections;
CREATE TRIGGER trg_estimate_sections_stamp_version_upd
  AFTER UPDATE ON public.estimate_sections
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.stamp_estimate_version_from_section();

DROP TRIGGER IF EXISTS trg_estimate_items_stamp_version_ins_del ON public.estimate_items;
CREATE TRIGGER trg_estimate_items_stamp_version_ins_del
  AFTER INSERT OR DELETE ON public.estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_estimate_version_from_item();

DROP TRIGGER IF EXISTS trg_estimate_items_stamp_version_upd ON public.estimate_items;
CREATE TRIGGER trg_estimate_items_stamp_version_upd
  AFTER UPDATE ON public.estimate_items
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.stamp_estimate_version_from_item();

COMMENT ON FUNCTION public.stamp_estimate_version(uuid) IS
  'Stamps estimates.updated_at (the content version) with now(). Called by the estimate_sections / estimate_items triggers so a change to a line or a section moves the version the editor saves against and the client signs against.';

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

  -- Step 1b: the company the caller acts for must own this estimate. Every
  -- child row below is written with p_company_id; RLS alone would accept a
  -- member of two companies tagging children with the other company's id.
  IF NOT EXISTS (
    SELECT 1 FROM public.estimates WHERE id = p_estimate_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'estimate_foreign_row' USING ERRCODE = 'P0021';
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

  IF v_has_signature OR v_client_response IS NOT NULL THEN
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
      WHERE id = v_section_id
        AND estimate_id = p_estimate_id;

      -- A section id that exists but belongs to ANOTHER estimate is refused:
      -- without this, a payload carrying a locked or signed estimate's section
      -- ids would rewrite that estimate's rows (the lock guard above only
      -- inspects p_estimate_id) and the orphan-item delete below would empty
      -- its sections. A section id that no longer exists at all keeps the old
      -- behaviour (the UPDATE matches nothing).
      IF NOT FOUND AND EXISTS (
        SELECT 1 FROM public.estimate_sections WHERE id = v_section_id
      ) THEN
        RAISE EXCEPTION 'estimate_foreign_row' USING ERRCODE = 'P0021';
      END IF;
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
        WHERE id = v_item_id
          AND section_id = v_section_id;

        -- Same rule for items: an item id that exists under another section
        -- (of this or any other estimate) is refused; a vanished id keeps the
        -- old no-op behaviour. The editor never moves an item between
        -- sections (REORDER_ITEMS is per section; refine merges per section).
        IF NOT FOUND AND EXISTS (
          SELECT 1 FROM public.estimate_items WHERE id = v_item_id
        ) THEN
          RAISE EXCEPTION 'estimate_foreign_row' USING ERRCODE = 'P0021';
        END IF;
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

  -- Step 7b: re-read the version token. The header UPDATE in step 5 restamps
  -- updated_at only when a header column changed; a save that edits ONLY
  -- sections or items is stamped afterwards by the child-row triggers
  -- (20261121130000), so the value captured in step 5 can already be stale.
  -- Returning the final value keeps the editor's compare-and-set token equal to
  -- the row, so its next save does not see a false conflict.
  SELECT updated_at INTO v_new_updated_at FROM public.estimates WHERE id = p_estimate_id;

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

GRANT EXECUTE ON FUNCTION public.save_estimate_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated;
