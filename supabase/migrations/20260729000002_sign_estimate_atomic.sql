-- supabase/migrations/20260729000002_sign_estimate_atomic.sql
-- Security-hardening S2 (audit finding b): the public sign endpoint
-- (app/api/estimates/[id]/sign/route.ts) previously ran a sequence of
-- separate check-then-write PostgREST calls with no row lock, creating THREE
-- distinct races: (1) sign vs decline — a decline landing between the
-- route's client_response read and its signature INSERT produces a DECLINED
-- estimate that still renders a "Signed by" block; (2) double-sign — two
-- concurrent POSTs both pass the same stale client_response/signature-exists
-- check and both insert a signature row; (3) torn snapshot — the route reads
-- the estimate header and the sections in two separate queries with no lock,
-- so an owner save landing in between produces an internally inconsistent
-- "immutable" signed_content snapshot (new header + old sections, or vice
-- versa).
--
-- This function collapses the ENTIRE state transition — the torn-snapshot
-- compare-and-set, the sign-vs-decline/double-sign guard, the signature
-- INSERT, the client_response/project-status flip, and both activity-log
-- rows — into ONE atomic Postgres transaction, mirroring
-- 20260717000004_phase165_save_estimate_atomic.sql's pattern: FOR UPDATE row
-- lock taken first, every guard re-checked INSIDE the lock, RAISE EXCEPTION
-- on each failure (any RAISE rolls back the whole transaction — nothing
-- partially applies).
--
-- ERRCODE registry: P0001-P0004 are claimed by save_estimate_atomic
-- (20260717000004); P0005 is claimed by block_signed_estimate_delete
-- (20260729000001). This function claims P0006-P0008 (estimate_not_found,
-- estimate_conflict, estimate_already_responded respectively) — unused
-- elsewhere, so the route's rpcError.code mapping is unambiguous.
--
-- SECURITY DEFINER (a deliberate DEPARTURE from save_estimate_atomic's
-- SECURITY INVOKER): save_estimate_atomic is invoked by an authenticated
-- Supabase Auth end user, so INVOKER + ordinary RLS is what enforces tenant
-- isolation there. This function's ONLY caller is the service-role client in
-- app/api/estimates/[id]/sign/route.ts — a PUBLIC, UNAUTHENTICATED share-link
-- endpoint with no Supabase Auth session to run this AS. There is no
-- authenticated-user role for INVOKER semantics to fall back to, so this
-- function instead follows the credit-ledger template's posture
-- (20260706000002 — SECURITY DEFINER, REVOKE from PUBLIC/anon/authenticated):
-- tenant/record isolation is enforced by the p_estimate_id + p_share_token
-- match in the FOR UPDATE SELECT below, not by RLS.
--
-- Idempotent: CREATE OR REPLACE. Authored-only — committed and carried by
-- CI -> GHCR -> Coolify; NOT applied here (never `supabase db push` from this
-- repo, and never migrated against any remote project directly).

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
  SELECT company_id, project_id, client_response, updated_at, estimate_number
    INTO v_company_id, v_project_id, v_client_response, v_locked_updated_at, v_estimate_number
    FROM public.estimates
    WHERE id = p_estimate_id
      AND share_token = p_share_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = 'P0006';
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

-- Service-role only (see header comment: no Supabase Auth session exists on
-- this public share-link endpoint). REVOKE first — Postgres grants EXECUTE
-- to PUBLIC by default on every new function.
REVOKE EXECUTE ON FUNCTION public.sign_estimate_atomic(
  uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text
) FROM PUBLIC, anon, authenticated;

-- Fix-pack F2, finding #8: default privileges usually already grant
-- service_role EXECUTE on newly created functions, but that depends on
-- whatever ALTER DEFAULT PRIVILEGES is in effect for the role that runs this
-- migration at apply time. An explicit, idempotent GRANT removes that
-- environment dependency entirely — if defaults ever differ, every sign
-- would otherwise 500 with 42501 (insufficient_privilege) instead of working.
GRANT EXECUTE ON FUNCTION public.sign_estimate_atomic(
  uuid, uuid, timestamptz, text, text, text, inet, text, jsonb, numeric, text
) TO service_role;

COMMENT ON FUNCTION public.sign_estimate_atomic IS
  'Security-hardening S2: atomic public-sign persistence. Locks the estimates row by (id, share_token), re-checks the torn-snapshot compare-and-set (ERRCODE P0007) and the sign-vs-decline/double-sign guard (ERRCODE P0008) INSIDE the transaction (P0006 = not found), then inserts the estimate_signatures row + flips client_response/project status + logs both estimate_signed (with a snapshot_sha256 tamper-evidence hash in its metadata) and estimate_accepted activity rows as ONE atomic write. Returns {project_id, company_id, estimate_number, client_name} for the caller''s post-RPC notification. SECURITY DEFINER, service-role-only — the caller has no Supabase Auth session (public share link).';
