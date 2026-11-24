-- Pin newly queued receipts to the client captured in the signed document.
-- Keep already-applied receipt outbox migration and trigger registrations intact.

CREATE OR REPLACE FUNCTION public.queue_signature_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_document_id uuid;
  v_project_id uuid;
  v_share_token text;
  v_business_name text;
  v_language text;
  v_client_id uuid;
  v_client_email text;
  v_signer_email text := nullif(lower(btrim(NEW.signer_email)), '');
  v_can_email boolean;
BEGIN
  IF NEW.signed_content IS NULL OR NEW.snapshot_sha256 IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'estimate_signatures' THEN
    v_kind := 'estimate';
    v_document_id := NEW.estimate_id;
    SELECT e.project_id, e.share_token::text, e.language, c.name
      INTO v_project_id, v_share_token, v_language, v_business_name
      FROM public.estimates e
      JOIN public.companies c ON c.id = e.company_id
      WHERE e.id = v_document_id AND e.company_id = NEW.company_id;
  ELSE
    v_kind := 'change_order';
    v_document_id := NEW.change_order_id;
    SELECT o.project_id, o.share_token::text, e.language, c.name
      INTO v_project_id, v_share_token, v_language, v_business_name
      FROM public.change_orders o
      JOIN public.estimates e ON e.id = o.estimate_id AND e.company_id = o.company_id
      JOIN public.companies c ON c.id = o.company_id
      WHERE o.id = v_document_id AND o.company_id = NEW.company_id;
  END IF;

  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id, nullif(lower(btrim(c.email)), '')
    INTO v_client_id, v_client_email
    FROM public.projects p
    JOIN public.clients c ON c.id = p.client_id AND c.company_id = p.company_id
    WHERE p.id = v_project_id AND p.company_id = NEW.company_id;

  v_can_email := v_share_token IS NOT NULL AND v_client_email IS NOT NULL
    AND (v_signer_email IS NULL OR v_signer_email = v_client_email);
  -- A frozen client remains the only eligible recipient for this signature.
  -- A project reassignment or email edit during signing must leave no email work.
  IF NEW.signed_content ? 'identity' THEN
    v_can_email := v_can_email
      AND (v_client_id::text IS NOT DISTINCT FROM (NEW.signed_content #>> '{identity,client,id}'))
      AND (v_client_email IS NOT DISTINCT FROM nullif(lower(btrim(
        NEW.signed_content #>> '{identity,client,email}'
      )), ''));
  END IF;

  v_language := coalesce(NEW.signed_content #>> '{identity,language}', v_language);
  v_business_name := coalesce(nullif(btrim(NEW.signed_content #>> '{identity,company,name}'), ''), v_business_name);

  INSERT INTO public.signature_receipt_outbox (
    kind, document_id, company_id, client_id, recipient_sha256, share_token_sha256,
    business_name, language, state, finished_at, last_issue
  ) VALUES (
    v_kind, v_document_id, NEW.company_id, CASE WHEN v_can_email THEN v_client_id END,
    CASE WHEN v_can_email THEN encode(sha256(convert_to(v_client_email, 'UTF8')), 'hex') END,
    CASE WHEN v_can_email THEN encode(sha256(convert_to(v_share_token, 'UTF8')), 'hex') END,
    v_business_name, CASE WHEN v_language IN ('pt', 'es') THEN v_language ELSE 'en' END,
    CASE WHEN v_can_email THEN 'pending' ELSE 'skipped' END,
    CASE WHEN NOT v_can_email THEN now() END,
    CASE WHEN NOT v_can_email THEN 'no_safe_recipient' END
  ) ON CONFLICT (kind, document_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_signature_receipt() FROM PUBLIC, anon, authenticated, service_role;
