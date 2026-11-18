-- Activate generated versions and restore drafts in one transaction.
-- Apply manually before deploying the callers; there is no unsafe fallback.
-- SQLSTATE P0017: generation scope/not found; P0018: stale current version;
-- P0019: answered/signed version; P0020: invalid activation input.
-- No legacy rows are rewritten and no uniqueness constraint is added blindly.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS generation_staged boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.activate_estimate_version(
  p_company_id uuid,
  p_project_id uuid,
  p_estimate_id uuid,
  p_previous_estimate_id uuid DEFAULT NULL,
  p_project_update jsonb DEFAULT '{}'::jsonb,
  p_discard_estimate_id uuid DEFAULT NULL,
  p_restore boolean DEFAULT false,
  p_keep_existing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.estimates%ROWTYPE;
  v_current public.estimates%ROWTYPE;
  v_current_count integer;
  v_blank_id uuid;
  v_version integer;
  v_status text;
  v_client_id uuid;
  v_project_client_id uuid;
  v_detected_name text;
BEGIN
  IF p_company_id IS NULL OR p_project_id IS NULL OR p_estimate_id IS NULL
     OR jsonb_typeof(p_project_update) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_estimate_activation' USING ERRCODE = 'P0020';
  END IF;
  -- Serialize activation/recovery without taking the project row first:
  -- save_estimate_atomic/sign_estimate_atomic lock estimate, THEN project.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.projects
                 WHERE id = p_project_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'generation_project_not_found' USING ERRCODE = 'P0017';
  END IF;
  PERFORM id FROM public.estimates
    WHERE project_id = p_project_id AND company_id = p_company_id
    ORDER BY id FOR UPDATE;

  SELECT * INTO v_target FROM public.estimates
    WHERE id = p_estimate_id AND project_id = p_project_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_estimate_not_found' USING ERRCODE = 'P0017';
  END IF;
  SELECT count(*) INTO v_current_count FROM public.estimates
    WHERE project_id = p_project_id AND company_id = p_company_id AND is_current;
  IF v_current_count > 1 THEN
    RAISE EXCEPTION 'generation_current_conflict' USING ERRCODE = 'P0018';
  END IF;
  SELECT * INTO v_current FROM public.estimates
    WHERE project_id = p_project_id AND company_id = p_company_id AND is_current;

  -- Lost responses can be retried safely. Never overwrite project changes or
  -- acceptance that happened after a committed activation.
  IF v_target.is_current THEN
    RETURN jsonb_build_object('estimate_id', v_target.id, 'version', v_target.version,
      'client_id', (SELECT client_id FROM public.projects WHERE id = p_project_id));
  END IF;
  -- Manual blank creation is a create-if-absent operation, including a race
  -- against generation or another blank creator.
  IF p_keep_existing AND v_current.id IS NOT NULL THEN
    RETURN jsonb_build_object('estimate_id', v_current.id, 'version', v_current.version,
      'client_id', (SELECT client_id FROM public.projects WHERE id = p_project_id));
  END IF;
  IF v_current.id IS DISTINCT FROM p_previous_estimate_id THEN
    RAISE EXCEPTION 'generation_current_conflict' USING ERRCODE = 'P0018';
  END IF;
  IF v_target.client_response IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = v_target.id
  ) OR (v_current.id IS NOT NULL AND (v_current.client_response IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = v_current.id
  ))) THEN
    RAISE EXCEPTION 'generation_estimate_locked' USING ERRCODE = 'P0019';
  END IF;
  IF p_discard_estimate_id IS NOT NULL AND
     (NOT p_restore OR p_discard_estimate_id = p_estimate_id OR
      p_discard_estimate_id IS DISTINCT FROM v_current.id) THEN
    RAISE EXCEPTION 'invalid_discard_estimate' USING ERRCODE = 'P0020';
  END IF;
  IF NOT p_restore AND v_current.id IS NOT NULL AND v_current.summary IS NULL
     AND v_current.total = 0 AND v_current.workflow_status = 'draft'
     AND v_current.sent_at IS NULL
     AND coalesce(v_current.notes, '') = '' AND coalesce(v_current.timeline, '') = ''
     AND (SELECT count(*) FROM public.estimate_sections WHERE estimate_id = v_current.id) = 1
     AND (SELECT count(*) FROM public.estimate_items i JOIN public.estimate_sections s ON s.id = i.section_id
          WHERE s.estimate_id = v_current.id) = 1
     AND EXISTS (SELECT 1 FROM public.estimate_sections s JOIN public.estimate_items i ON i.section_id = s.id
          WHERE s.estimate_id = v_current.id AND s.title = 'General'
            AND btrim(i.description) = '' AND i.quantity = 1 AND i.unit = 'each'
            AND i.unit_price = 0 AND coalesce(i.discount, 0) = 0) THEN
    v_blank_id := v_current.id;
  END IF;

  IF NOT p_restore THEN
    SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.estimates
      WHERE project_id = p_project_id AND company_id = p_company_id
        AND id <> p_estimate_id AND id IS DISTINCT FROM v_blank_id AND NOT generation_staged;
    UPDATE public.estimates SET version = v_version WHERE id = p_estimate_id;
    -- Photo links commit together with the pointer and the project snapshot.
    INSERT INTO public.estimate_photos (estimate_id, photo_id, company_id, sort_order)
      SELECT p_estimate_id, ep.photo_id, p_company_id, ep.sort_order
      FROM public.estimate_photos ep
      JOIN public.photos ph ON ph.id = ep.photo_id AND ph.company_id = p_company_id
      WHERE ep.estimate_id = v_current.id AND ep.company_id = p_company_id
      ON CONFLICT (estimate_id, photo_id) DO NOTHING;
  ELSE
    v_version := v_target.version;
  END IF;

  UPDATE public.estimates SET is_current = false
    WHERE project_id = p_project_id AND company_id = p_company_id AND is_current;
  UPDATE public.estimates SET is_current = true, generation_staged = false
    WHERE id = p_estimate_id AND company_id = p_company_id AND project_id = p_project_id;

  v_status := coalesce(p_project_update->>'status', 'estimate_ready');
  IF v_status NOT IN ('estimate_ready', 'awaiting_details', 'draft') THEN
    RAISE EXCEPTION 'invalid_generation_status' USING ERRCODE = 'P0020';
  END IF;
  -- A partial client-list read in the application cannot establish uniqueness.
  -- Recheck the complete tenant's exact normalized matches before linking.
  IF NOT p_restore AND p_project_update ? 'client_id' THEN
    v_detected_name := lower(regexp_replace(btrim(translate(
      p_project_update->>'detected_client_name', '.,', '')), '[[:space:]]+', ' ', 'g'));
    IF length(v_detected_name) > 0 THEN
      WITH matches AS (
        SELECT id FROM public.clients WHERE company_id = p_company_id
          AND lower(regexp_replace(btrim(translate(name, '.,', '')), '[[:space:]]+', ' ', 'g')) = v_detected_name
      )
      SELECT id INTO v_client_id FROM matches
        WHERE id = (p_project_update->>'client_id')::uuid AND (SELECT count(*) FROM matches) = 1;
    END IF;
  END IF;
  UPDATE public.projects SET
    total = v_target.total,
    status = v_status,
    name = CASE WHEN p_project_update ? 'name' AND name = p_project_update->>'expected_name'
                THEN p_project_update->>'name' ELSE name END,
    project_type = CASE WHEN p_project_update ? 'project_type'
                        THEN p_project_update->>'project_type' ELSE project_type END,
    client_id = coalesce(client_id, v_client_id)
    WHERE id = p_project_id AND company_id = p_company_id
    RETURNING client_id INTO v_project_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_project_not_found' USING ERRCODE = 'P0017';
  END IF;

  -- Discard and pristine-blank replacement are covered by the same rollback.
  DELETE FROM public.estimates
    WHERE id IN (p_discard_estimate_id, v_blank_id)
      AND company_id = p_company_id AND project_id = p_project_id AND NOT is_current;
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'version', v_version, 'client_id', v_project_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_estimate_version(uuid, uuid, uuid, uuid, jsonb, uuid, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_estimate_version(uuid, uuid, uuid, uuid, jsonb, uuid, boolean, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.discard_vague_estimate(
  p_project_id uuid,
  p_estimate_id uuid,
  p_status text DEFAULT 'draft'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_target public.estimates%ROWTYPE;
  v_previous public.estimates%ROWTYPE;
BEGIN
  IF p_status NOT IN ('draft', 'awaiting_details') OR p_status IS NULL THEN
    RAISE EXCEPTION 'invalid_generation_status' USING ERRCODE = 'P0020';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));
  SELECT company_id INTO v_company_id FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_project_not_found' USING ERRCODE = 'P0017';
  END IF;
  PERFORM id FROM public.estimates
    WHERE project_id = p_project_id AND company_id = v_company_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_target FROM public.estimates
    WHERE id = p_estimate_id AND project_id = p_project_id AND company_id = v_company_id;
  IF NOT FOUND THEN RETURN; END IF; -- replay after a committed discard
  IF NOT v_target.is_current OR EXISTS (
    SELECT 1 FROM public.estimates WHERE project_id = p_project_id
      AND company_id = v_company_id AND is_current AND id <> p_estimate_id
  ) THEN
    RAISE EXCEPTION 'generation_current_conflict' USING ERRCODE = 'P0018';
  END IF;
  IF v_target.client_response IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = p_estimate_id
  ) THEN
    RAISE EXCEPTION 'generation_estimate_locked' USING ERRCODE = 'P0019';
  END IF;
  IF v_target.total > 0 AND EXISTS (
    SELECT 1 FROM public.estimate_sections s
      JOIN public.estimate_items i ON i.section_id = s.id
      WHERE s.estimate_id = p_estimate_id
  ) THEN
    RAISE EXCEPTION 'estimate_is_not_vague' USING ERRCODE = 'P0020';
  END IF;
  SELECT e.* INTO v_previous FROM public.estimates e
    WHERE e.project_id = p_project_id AND e.company_id = v_company_id
      AND e.id <> p_estimate_id AND e.version < v_target.version
      AND NOT e.generation_staged AND e.total > 0
      AND e.client_response IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.estimate_signatures sig WHERE sig.estimate_id = e.id)
      AND EXISTS (SELECT 1 FROM public.estimate_sections s
        JOIN public.estimate_items i ON i.section_id = s.id WHERE s.estimate_id = e.id)
    ORDER BY e.version DESC, e.id LIMIT 1;
  DELETE FROM public.estimates WHERE id = p_estimate_id AND company_id = v_company_id;
  IF v_previous.id IS NOT NULL THEN
    UPDATE public.estimates SET is_current = true WHERE id = v_previous.id;
  END IF;
  UPDATE public.projects SET total = coalesce(v_previous.total, 0), status = p_status
    WHERE id = p_project_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_project_not_found' USING ERRCODE = 'P0017';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.discard_vague_estimate(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_vague_estimate(uuid, uuid, text) TO service_role;
NOTIFY pgrst, 'reload schema';
