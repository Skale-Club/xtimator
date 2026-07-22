-- supabase/migrations/20260721000004_phase177_customer_messages.sql
-- Phase 177 (CUST-05): append-only audit trail for every end-customer
-- email/SMS send attempt (success or provider-level failure), modeled on
-- estimate_deliveries's dual-recipient-column convention
-- (recipient_email/recipient_phone, exactly one populated depending on
-- channel). Pure schema — ships INERT. No code reads or writes this table
-- until 177-06's sendCustomerMessage() wires it in; 177-01 (gate
-- hardening) and 177-03/04 (send primitives) land in parallel with this
-- plan without depending on it.
--
-- Idempotent: safe to re-run (CREATE TABLE/CREATE INDEX IF NOT EXISTS
-- throughout). NOT applied to remote directly — deploy is
-- CI->GHCR->Coolify; migrations are applied manually per project
-- convention (see supabase/migrations/20260718000001_phase171_...). This
-- migration must be applied by hand before 177-06's code path can write
-- real rows.
--
-- company_id/client_id are nullable with ON DELETE SET NULL, NOT CASCADE
-- (identical rationale to 20260721000003's Part 2 / client_message_events):
-- this is an audit/compliance trail, so deleting a company or client must
-- never silently erase its message history.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  client_id             uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  channel               text NOT NULL CHECK (channel IN ('email','sms')),
  recipient_email       text,
  recipient_phone       text,
  provider              text NOT NULL CHECK (provider IN ('resend','twilio')),
  provider_message_id   text,
  is_template           boolean NOT NULL DEFAULT false,
  template_event_type   text,
  trigger_source        text NOT NULL CHECK (trigger_source IN ('manual','agentic-whatsapp','agentic-mcp')),
  subject               text,
  body                  text NOT NULL,
  status                text NOT NULL CHECK (status IN ('sent','failed')),
  error_message         text,
  sent_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_messages_recipient_matches_channel CHECK (
    (channel = 'email' AND recipient_email IS NOT NULL) OR
    (channel = 'sms' AND recipient_phone IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_customer_messages_company_id ON public.customer_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_messages_client_id ON public.customer_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_messages_created_at ON public.customer_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_messages_status ON public.customer_messages(status);

ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;

-- Writes happen ONLY via service-role send paths (177-06's sendCustomerMessage);
-- service role bypasses RLS. Mirrors client_message_events / estimate_deliveries:
-- only a SELECT policy for tenant users is needed.
CREATE POLICY "customer_messages_select" ON public.customer_messages FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));

COMMENT ON TABLE public.customer_messages IS
  'Phase 177 (CUST-05): append-only audit trail for every end-customer email/SMS send attempt, success or failure. Modeled on estimate_deliveries. company_id/client_id nullable with ON DELETE SET NULL (audit trail survives deletion, mirrors client_message_events). Ships inert until 177-06''s sendCustomerMessage() wires it.';

COMMIT;
