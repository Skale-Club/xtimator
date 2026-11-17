-- supabase/migrations/20261116000001_lock_at_acceptance.sql
-- Lock-at-acceptance. An estimate used to freeze the moment it was SENT. The
-- new rule: it freezes only when the client ANSWERS it (client_response set) or
-- SIGNS it (estimate_signatures row). A sent estimate stays editable until then.
--
-- 1. save_estimate_atomic: the estimate_locked (P0001) guard drops its sent_at
--    clause; signature OR client_response still lock. Everything else is
--    byte-for-byte the 20260717000004 definition.
-- 2. sign_estimate_atomic: new guard under the row lock. A superseded version
--    (is_current = false) raises 'estimate_not_current' with the NEW SQLSTATE
--    P0009 (P0001-P0004 save_estimate_atomic, P0005 block_signed_estimate_delete,
--    P0006-P0008 sign_estimate_atomic; P0009 was unused). Everything else is
--    byte-for-byte the 20260729000002 definition. Because a sent estimate can now
--    change while the client has the page open, the app also requires the
--    client's content version (updated_at) on sign; that check lives in the
--    route and uses this function's existing P0007 compare-and-set.
--
-- No data changes, no DROP. Idempotent (CREATE OR REPLACE).
-- Apply by hand to BOTH databases (Supabase dev and Coolify production) BEFORE
-- the deploy that depends on it; the deploy never runs migrations.

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

GRANT EXECUTE ON FUNCTION public.save_estimate_atomic(uuid, uuid, timestamptz, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sign_estimate_atomic(
  p_estimate_id uuid,
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
  v_client_response    text;
  v_locked_updated_at  timestamptz;
  v_has_signature      boolean;
  v_estimate_number    text;
  v_client_name        text;
  v_is_current         boolean;
BEGIN
  -- Step 1: row lock + snapshot, matched by id AND share_token together —
  -- mirrors the route's existing lookup contract exactly (a share_token
  -- mismatch must behave identically to a nonexistent estimate, never leak
  -- whether the id alone exists). FOR UPDATE serializes every concurrent
  -- sign/decline attempt on this row: the second caller to reach this SELECT
  -- blocks until the first's transaction commits or rolls back, then
  -- re-reads the LATEST committed row via EvalPlanQual — so every check
  -- below observes a value that cannot already be stale by the time it's
  -- tested.
  SELECT company_id, project_id, client_response, updated_at, estimate_number, is_current
    INTO v_company_id, v_project_id, v_client_response, v_locked_updated_at, v_estimate_number, v_is_current
    FROM public.estimates
    WHERE id = p_estimate_id
      AND share_token = p_share_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = 'P0006';
  END IF;

  -- Lock-at-acceptance: a superseded version (is_current = false) must not be
  -- signable through its old public link. Raised under the row lock, before the
  -- compare-and-set, so a stale link never reaches the content checks.
  IF v_is_current IS NOT TRUE THEN
    RAISE EXCEPTION 'estimate_not_current' USING ERRCODE = 'P0009';
  END IF;

  -- The client name is NOT a column on estimates (this function originally
  -- selected a non-existent `estimates.client_name`, which made every call fail
  -- with 42703 — the error went unnoticed because the migration had never been
  -- applied to any environment). It lives on clients.name, reached through
  -- projects.client_id, exactly the way every other read in the codebase gets it
  -- (see lib/queries/estimate.ts's `client:clients(name, ...)` embed).
  --
  -- LEFT JOIN and a separate statement, deliberately: projects.client_id is
  -- NULLABLE, so an estimate on a project with no client attached must still
  -- sign successfully with a NULL name. The caller's consumer
  -- (lib/estimate/notify-response.ts) already types client_name as optional and
  -- coalesces it away, so NULL degrades to "no client name in the notification"
  -- rather than failing the signature.
  SELECT c.name
    INTO v_client_name
    FROM public.projects p
    LEFT JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = v_project_id;

  -- Step 2: torn-snapshot guard (closes race 3). p_expected_updated_at is the
  -- updated_at the ROUTE observed on the SAME read whose header fields were
  -- baked into p_signed_content. If the row has moved since (an owner save
  -- landed in the window between the route's read and this call), that
  -- snapshot may already mix a stale header with fresh sections or vice
  -- versa — it must NOT be persisted as if it were consistent. The route's
  -- contract on this error is to re-read the estimate, rebuild the ENTIRE
  -- snapshot from scratch, and retry this call ONCE.
  IF v_locked_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'estimate_conflict' USING ERRCODE = 'P0007';
  END IF;

  -- Step 3: sign-vs-decline + double-sign guard (closes races 1 and 2).
  -- Every signer/decliner serializes on the FOR UPDATE lock taken in step 1,
  -- so whichever request reaches this point SECOND always observes either
  -- client_response already set (a decline — or another accept — won the
  -- race) or a signature row already inserted (another sign request won the
  -- race) here, inside the same transaction that is about to write. No
  -- separate UNIQUE index on estimate_signatures.estimate_id is needed: the
  -- row lock on estimates IS the serialization point every writer funnels
  -- through, because both the decline path (respondToEstimate's conditional
  -- UPDATE) and this function ultimately contend for the same estimates row.
  SELECT EXISTS(
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = p_estimate_id
  ) INTO v_has_signature;

  IF v_client_response IS NOT NULL OR v_has_signature THEN
    RAISE EXCEPTION 'estimate_already_responded' USING ERRCODE = 'P0008';
  END IF;

  -- Step 4: insert the signature row. signed_content/signed_total are
  -- captured in the SAME insert as the signature itself (TRUST-01
  -- discipline preserved: never an update-after). The tamper-evidence hash
  -- (p_snapshot_sha256) is NOT a new column here — per the audit fix's own
  -- framing it is recorded in the activity log (step 6 below), not on the
  -- signature row itself, so no estimate_signatures schema change is needed.
  INSERT INTO public.estimate_signatures (
    estimate_id, company_id, signer_name, signer_email, signature_data,
    ip_address, user_agent, signed_content, signed_total
  ) VALUES (
    p_estimate_id, v_company_id, p_signer_name, p_signer_email, p_signature_data,
    p_ip_address, p_user_agent, p_signed_content, p_signed_total
  );

  -- Step 5: a signature IS acceptance — flip client_response/responded_at and
  -- the project status exactly the way the public "Accept" button's path
  -- (app/estimate/[token]/actions.ts respondToEstimate) does, so a signed
  -- estimate is never left in a state without a client_response.
  UPDATE public.estimates
  SET client_response = 'accepted', responded_at = now()
  WHERE id = p_estimate_id;

  UPDATE public.projects SET status = 'accepted' WHERE id = v_project_id;

  -- Step 6: activity log — TWO rows, matching today's behavior exactly.
  -- 'estimate_signed' carries the snapshot hash as tamper-evidence (audit
  -- finding f: proof the persisted signed_content has not been altered since
  -- signing). 'estimate_accepted' mirrors respondToEstimate's existing
  -- accepted-path activity row ('{}' metadata) so the activity timeline
  -- reads identically to a plain client Accept.
  INSERT INTO public.estimate_activity (project_id, company_id, estimate_id, event_type, metadata)
  VALUES (
    v_project_id, v_company_id, p_estimate_id, 'estimate_signed',
    jsonb_build_object('signer_name', p_signer_name, 'snapshot_sha256', p_snapshot_sha256)
  );

  INSERT INTO public.estimate_activity (project_id, company_id, estimate_id, event_type, metadata)
  VALUES (v_project_id, v_company_id, p_estimate_id, 'estimate_accepted', '{}'::jsonb);

  -- Step 7: return exactly what the route needs to fire its post-RPC
  -- notification (in-app + email) WITHOUT a re-fetch.
  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'company_id', v_company_id,
    'estimate_number', v_estimate_number,
    'client_name', v_client_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sign_estimate_atomic(
  uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sign_estimate_atomic(
  uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text
) TO service_role;
