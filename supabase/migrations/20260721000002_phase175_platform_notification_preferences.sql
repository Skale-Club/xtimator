-- ============================================================================
-- platform_notification_preferences (Phase 175 — PLAT-02)
--
-- Per-platform-event Telegram delivery toggle, admin-managed via
-- /admin/integrations (Plan 03). One row per PlatformEventKind
-- (lib/notifications/platform-events.ts), keyed by the kind's string value.
--
-- Locked/critical kinds (pipeline_stuck, cron_failed) ALWAYS deliver
-- regardless of this table (PLAT-03) — enforced in code (isLockedPlatformEvent)
-- BEFORE any read of this table, not by a DB constraint.
--
-- RLS is SERVICE-ROLE-ONLY BY DESIGN (mirrors whatsapp_notification_templates,
-- 20260621000003): RLS is ENABLED but no anon/authenticated policies are
-- defined, so tenants can neither read nor write. Admin writes go through the
-- service client behind requireAdmin (Plan 03); notifyOps()'s gate reads via
-- createServiceClient() (nullable, non-throwing) to preserve its never-throw
-- contract (lib/observability/platform-preferences.ts).
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). NO secrets.
--
-- NOTE: per project convention, migrations are applied to prod MANUALLY (not
-- via CI/deploy). This migration ships inert — it must be applied by hand
-- (`supabase db push` or run directly against prod) before Plan 02/03 code
-- that depends on this table goes live.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_notification_preferences (
  event_kind        text PRIMARY KEY,
  telegram_enabled  boolean NOT NULL DEFAULT true,
  updated_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_notification_preferences ENABLE ROW LEVEL SECURITY;
-- Service-role-only (mirrors whatsapp_notification_templates / 20260621000003):
-- RLS enabled, NO anon/authenticated policies. Admin writes go through the
-- service client behind requireAdmin (Plan 03); notifyOps()'s gate reads via
-- createServiceClient() (nullable, non-throwing) to preserve its never-throw
-- contract.

INSERT INTO public.platform_notification_preferences (event_kind, telegram_enabled) VALUES
  ('tenant_signup', true),
  ('tenant_payment_received', true),
  ('subscription_payment_received', true),
  ('tenant_quota_exhausted', true),
  ('estimate_generation_failed', true),
  ('transcription_failed', true),
  ('vision_failed', true),
  ('ai_fallback', true),
  ('pipeline_stuck', true),
  ('cron_failed', true)
ON CONFLICT (event_kind) DO NOTHING;

COMMENT ON TABLE public.platform_notification_preferences IS
  'Phase 175 (PLAT-02) — per-platform-event Telegram delivery toggle, admin-managed via /admin/integrations. Service-role-only RLS. Locked/critical kinds (lib/notifications/platform-events.ts) always deliver regardless of this table (PLAT-03), enforced in code (isLockedPlatformEvent) before any read of this table.';
