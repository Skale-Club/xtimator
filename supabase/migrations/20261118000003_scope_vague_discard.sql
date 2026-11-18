-- Require the server-trusted tenant on every discard, including adapter finalization.
CREATE OR REPLACE FUNCTION public.discard_vague_estimate(
  p_company_id uuid,
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
  SELECT company_id INTO v_company_id FROM public.projects
    WHERE id = p_project_id AND company_id = p_company_id;
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
REVOKE ALL ON FUNCTION public.discard_vague_estimate(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_vague_estimate(uuid, uuid, uuid, text) TO service_role;

-- Retire the scope-less overload before any application rollout.
DROP FUNCTION IF EXISTS public.discard_vague_estimate(uuid, uuid, text);
NOTIFY pgrst, 'reload schema';
