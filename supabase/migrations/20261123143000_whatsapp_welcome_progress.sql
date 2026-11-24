-- Keep first-contact progress across retries and reserve only a renewable send lease.
ALTER TABLE public.whatsapp_company_configs
  ADD COLUMN IF NOT EXISTS welcome_next_step smallint NOT NULL DEFAULT 0
    CHECK (welcome_next_step BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS welcome_sending_step smallint CHECK (welcome_sending_step BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS welcome_recipient_phone text,
  ADD COLUMN IF NOT EXISTS welcome_claim_token uuid,
  ADD COLUMN IF NOT EXISTS welcome_claim_until timestamptz;

ALTER TABLE public.whatsapp_authorized_senders
  ADD COLUMN IF NOT EXISTS welcome_template_claim_until timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_template_needs_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_notification_templates
  ADD COLUMN IF NOT EXISTS quick_reply_count smallint NOT NULL DEFAULT 0
    CHECK (quick_reply_count BETWEEN 0 AND 10);

CREATE OR REPLACE FUNCTION public.claim_whatsapp_welcome(
  p_company_id uuid,
  p_recipient text,
  p_token uuid
)
RETURNS TABLE (next_step smallint)
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.whatsapp_company_configs AS config
    SET welcome_claim_token = p_token,
        welcome_claim_until = pg_catalog.now() + interval '5 minutes',
        welcome_recipient_phone = p_recipient
    WHERE config.company_id = p_company_id
      AND config.status = 'active'
      AND config.welcome_sent_at IS NULL
      AND config.welcome_sending_step IS NULL
      AND (config.welcome_claim_until IS NULL OR config.welcome_claim_until < pg_catalog.now())
      AND (config.welcome_next_step = 0 OR config.welcome_recipient_phone = p_recipient)
    RETURNING config.welcome_next_step;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_welcome(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_welcome(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
