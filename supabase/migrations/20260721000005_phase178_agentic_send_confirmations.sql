-- supabase/migrations/20260721000005_phase178_agentic_send_confirmations.sql
-- Phase 178 Plan 01 (AGENT-01/02/03): confirmation state-machine table for
-- agentic end-customer sends (WhatsApp assistant + MCP tool pair). A row is
-- the durable, server-authoritative binding of (client_id, channel, body)
-- pending owner confirmation — sendCustomerMessage() is only ever reached by
-- resolving a pending, unexpired row back, never by an LLM re-supplying a
-- fresh recipient/body at confirm time.
--
-- Idempotent: safe to re-run (CREATE TABLE/CREATE INDEX IF NOT EXISTS
-- throughout). NOT applied to remote directly — migrations are applied
-- manually per project convention (see supabase/migrations/20260721000004_...).

BEGIN;

CREATE TABLE IF NOT EXISTS public.agentic_send_confirmations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('email','sms')),
  subject         text,
  body            text NOT NULL,
  body_hash       text NOT NULL,
  trigger_source  text NOT NULL CHECK (trigger_source IN ('agentic-whatsapp','agentic-mcp')),
  owner_phone     text,
  token           text UNIQUE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','cancelled','expired','refused')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  confirmed_at    timestamptz,
  CONSTRAINT agentic_send_confirmations_channel_binding CHECK (
    (trigger_source = 'agentic-whatsapp' AND owner_phone IS NOT NULL AND token IS NULL) OR
    (trigger_source = 'agentic-mcp' AND token IS NOT NULL AND owner_phone IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agentic_send_confirmations_pending_owner
  ON public.agentic_send_confirmations(company_id, owner_phone, status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agentic_send_confirmations_token
  ON public.agentic_send_confirmations(token) WHERE token IS NOT NULL;

ALTER TABLE public.agentic_send_confirmations ENABLE ROW LEVEL SECURITY;
-- Service-role only — this is an internal agent state machine, not
-- tenant-visible data (unlike customer_messages/client_message_events,
-- which ARE audit tables tenants can see). No SELECT/INSERT/UPDATE policy
-- for `authenticated` — mirrors notification_templates' "service-role-only,
-- zero anon/authenticated policies" posture.

COMMENT ON TABLE public.agentic_send_confirmations IS
  'Phase 178 (AGENT-01/02/03): confirmation state-machine for agentic end-customer sends (WhatsApp assistant + MCP). A row is the durable server-side binding of (client_id, channel, body) pending owner confirmation. sendCustomerMessage() is only ever reached by resolving a pending, unexpired row back — never by re-accepting recipient/body from the LLM at confirm time. owner_phone identifies a WhatsApp-originated draft (looked up by (company_id, owner_phone, status=pending) on the owner''s NEXT inbound message); token identifies an MCP-originated draft (looked up by token alone, company-scoped). The CHECK constraint makes "exactly one binding kind per trigger_source" a schema guarantee, not a convention.';

COMMIT;
