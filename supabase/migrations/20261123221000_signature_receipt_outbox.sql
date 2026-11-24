-- Commit receipt work in the same transaction as the signature. A queue outage
-- or a lost response from the signing route cannot lose the receipt.
CREATE TABLE IF NOT EXISTS public.signature_receipt_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('estimate', 'change_order')),
  document_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_sha256 text,
  share_token_sha256 text,
  business_name text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'pt', 'es')),
  state text NOT NULL CHECK (state IN ('pending', 'sent', 'skipped', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  provider_message_id text,
  last_issue text,
  UNIQUE (kind, document_id)
);

CREATE INDEX IF NOT EXISTS signature_receipt_outbox_pending_idx
  ON public.signature_receipt_outbox (available_at, id) WHERE state = 'pending';

ALTER TABLE public.signature_receipt_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signature_receipt_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.signature_receipt_outbox TO service_role;

ALTER TABLE public.customer_messages
  DROP CONSTRAINT IF EXISTS customer_messages_trigger_source_check;
ALTER TABLE public.customer_messages
  ADD CONSTRAINT customer_messages_trigger_source_check
  CHECK (trigger_source IN ('manual', 'agentic-whatsapp', 'agentic-mcp', 'signature-receipt'));

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

DROP TRIGGER IF EXISTS queue_estimate_signature_receipt ON public.estimate_signatures;
CREATE TRIGGER queue_estimate_signature_receipt
  AFTER INSERT ON public.estimate_signatures
  FOR EACH ROW EXECUTE FUNCTION public.queue_signature_receipt();

DROP TRIGGER IF EXISTS queue_change_order_signature_receipt ON public.change_order_signatures;
CREATE TRIGGER queue_change_order_signature_receipt
  AFTER INSERT ON public.change_order_signatures
  FOR EACH ROW EXECUTE FUNCTION public.queue_signature_receipt();
