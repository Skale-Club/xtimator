-- supabase/migrations/20261121140000_signature_snapshot_hash.sql
-- Signature evidence that survives on its own.
--
-- The SHA-256 of a signed snapshot (canonical serialization, see
-- lib/estimate/signed-snapshot.ts canonicalJsonStringify) was recorded ONLY in
-- estimate_activity.metadata ('estimate_signed' / 'change_order_signed'). Any
-- company member can delete activity rows (estimate_activity_delete policy), so
-- the one value that proves a stored snapshot was not altered could disappear.
-- Nothing stopped a service-role or maintenance UPDATE of a signature row either.
--
-- 1. estimate_signatures / change_order_signatures gain snapshot_sha256, filled
--    from the activity log for existing signatures (latest matching event; a
--    signature with no event, e.g. signed before the hash existed, stays NULL).
-- 2. sign_estimate_atomic / sign_change_order_atomic write it in the same INSERT
--    as the signature. Everything else in both functions is byte for byte their
--    latest definitions (20261116000001 and 20261117000001; pinned by
--    tests/unit/signature-snapshot-hash-migration.test.ts).
-- 3. Signature rows become immutable: a BEFORE UPDATE trigger refuses every
--    update, and a BEFORE DELETE trigger refuses a direct delete. A cascade from
--    the parent's deletion still passes (the parent row is already gone; signed
--    parents are themselves undeletable, 20260729000001 and 20261117000001), and
--    so does the existing compliance escape hatch
--    (SET LOCAL app.allow_signed_estimate_delete = 'on', used by
--    erase_company_for_compliance). SQLSTATE P0023 'signature_immutable'
--    (P0001-P0022 are taken).
--
-- The backfill only fills the new, empty column. No existing value changes.
-- Idempotent. Apply by hand to BOTH databases (Supabase dev and Coolify
-- production) BEFORE the deploy that depends on it; the deploy never runs
-- migrations.

ALTER TABLE public.estimate_signatures ADD COLUMN IF NOT EXISTS snapshot_sha256 text;
ALTER TABLE public.change_order_signatures ADD COLUMN IF NOT EXISTS snapshot_sha256 text;

COMMENT ON COLUMN public.estimate_signatures.snapshot_sha256 IS
  'SHA-256 (hex) of canonicalJsonStringify(signed_content) computed at signing time. Recomputing it from signed_content proves the snapshot was not altered.';
COMMENT ON COLUMN public.change_order_signatures.snapshot_sha256 IS
  'SHA-256 (hex) of canonicalJsonStringify(signed_content) computed at signing time. Recomputing it from signed_content proves the snapshot was not altered.';

-- Backfill BEFORE the immutability trigger exists.
UPDATE public.estimate_signatures s
SET snapshot_sha256 = a.sha
FROM (
  SELECT DISTINCT ON (estimate_id) estimate_id, metadata->>'snapshot_sha256' AS sha
  FROM public.estimate_activity
  WHERE event_type = 'estimate_signed'
    AND metadata ? 'snapshot_sha256'
  ORDER BY estimate_id, created_at DESC
) a
WHERE s.estimate_id = a.estimate_id
  AND s.snapshot_sha256 IS NULL
  AND a.sha ~ '^[0-9a-f]{64}$';

UPDATE public.change_order_signatures s
SET snapshot_sha256 = a.sha
FROM (
  SELECT DISTINCT ON ((metadata->>'change_order_id'))
         (metadata->>'change_order_id') AS change_order_id,
         metadata->>'snapshot_sha256' AS sha
  FROM public.estimate_activity
  WHERE event_type = 'change_order_signed'
    AND metadata ? 'snapshot_sha256'
    AND metadata ? 'change_order_id'
  ORDER BY (metadata->>'change_order_id'), created_at DESC
) a
WHERE s.change_order_id::text = a.change_order_id
  AND s.snapshot_sha256 IS NULL
  AND a.sha ~ '^[0-9a-f]{64}$';

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
    ip_address, user_agent, signed_content, signed_total, snapshot_sha256
  ) VALUES (
    p_estimate_id, v_company_id, p_signer_name, p_signer_email, p_signature_data,
    p_ip_address, p_user_agent, p_signed_content, p_signed_total, p_snapshot_sha256
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
    ip_address, user_agent, signed_content, signed_total, snapshot_sha256
  ) VALUES (
    p_change_order_id, v_company_id, p_signer_name, p_signer_email, p_signature_data,
    p_ip_address, p_user_agent, p_signed_content, p_signed_total, p_snapshot_sha256
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

CREATE OR REPLACE FUNCTION public.block_signature_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.allow_signed_estimate_delete', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'signature_immutable' USING ERRCODE = 'P0023';
  END IF;

  -- DELETE: allowed only as a cascade, once the parent row is already gone.
  IF TG_TABLE_NAME = 'estimate_signatures' THEN
    IF EXISTS (SELECT 1 FROM public.estimates WHERE id = OLD.estimate_id) THEN
      RAISE EXCEPTION 'signature_immutable' USING ERRCODE = 'P0023';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.change_orders WHERE id = OLD.change_order_id) THEN
      RAISE EXCEPTION 'signature_immutable' USING ERRCODE = 'P0023';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_signature_rewrite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_estimate_signatures_immutable ON public.estimate_signatures;
CREATE TRIGGER trg_estimate_signatures_immutable
  BEFORE UPDATE OR DELETE ON public.estimate_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.block_signature_rewrite();

DROP TRIGGER IF EXISTS trg_change_order_signatures_immutable ON public.change_order_signatures;
CREATE TRIGGER trg_change_order_signatures_immutable
  BEFORE UPDATE OR DELETE ON public.change_order_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.block_signature_rewrite();

COMMENT ON FUNCTION public.block_signature_rewrite() IS
  'Signature rows are evidence: refuses any UPDATE and a direct DELETE (P0023). A cascade from the deleted parent and the compliance escape hatch (app.allow_signed_estimate_delete) still pass.';
