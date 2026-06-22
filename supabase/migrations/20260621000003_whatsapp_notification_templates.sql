-- ============================================================================
-- whatsapp_notification_templates (Phase 104, 104.3 — NOTIF-03)
--
-- Platform-level registry of the WhatsApp notification templates the super-admin
-- panel manages: which Meta-approved HSM template + language backs each owner
-- notification event, plus the Meta template id + approval status synced from the
-- `message_template_status_update` webhook.
--
-- RLS is SERVICE-ROLE-ONLY BY DESIGN (mirrors the `notifications` insert/update
-- path + the platform-admin posture): RLS is ENABLED but no anon / authenticated
-- row-access grants are defined, so tenants can neither read nor write. The
-- service role bypasses RLS, and the admin panel goes through the service client
-- behind `requireAdmin`. This is platform data, NOT tenant data.
--
-- Idempotent (IF NOT EXISTS). NO secrets — template names + language codes only;
-- the Meta access token lives only in platform_integrations / env.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_notification_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_category    text,                              -- 'estimate'|'billing'|'system' (nullable)
  event_type        text,                              -- optional specific EventType mapping
  template_name     text NOT NULL,
  language_code     text NOT NULL DEFAULT 'en_US',
  meta_template_id  text,                              -- null until created/registered in Meta
  status            text NOT NULL DEFAULT 'draft',     -- draft|pending|approved|rejected
  rejection_reason  text,
  variables_schema  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_notification_templates_meta_id_idx
  ON public.whatsapp_notification_templates (meta_template_id);
CREATE INDEX IF NOT EXISTS whatsapp_notification_templates_event_idx
  ON public.whatsapp_notification_templates (event_category, event_type, status);

-- Service-role-only (mirror notifications): NO anon/authenticated policies.
-- Admin writes go through the service client; the service role bypasses RLS.
ALTER TABLE public.whatsapp_notification_templates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.whatsapp_notification_templates IS
  'Platform WhatsApp notification template registry (Phase 104.3). Service-role-only: RLS enabled with no tenant policies; admin CRUD via the service client behind requireAdmin. NEVER store Meta tokens here.';
