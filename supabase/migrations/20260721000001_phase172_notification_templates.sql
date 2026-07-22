-- ============================================================================
-- notification_templates (Phase 172, 172-02 — TMPL-01)
--
-- Platform-level, DB-driven registry of notification title/body templates per
-- (scope, event_type, channel). `scope='tenant'` covers the existing owner
-- notification events (currently hardcoded in `lib/notifications/copy.ts`);
-- `scope='customer'` is reserved for future end-customer-facing copy (Phase
-- 177) — no `scope='customer'` rows are seeded here, none exist to preserve.
--
-- There is NO `company_id` column on this table, by design: this is a
-- single, platform-wide, super-admin-managed catalog with NO per-tenant
-- overrides (a locked milestone decision — see research/PITFALLS.md Pitfall
-- 5). The absence of the column makes a future per-tenant override
-- structurally impossible to add by accident, not just discouraged by
-- convention.
--
-- RLS is SERVICE-ROLE-ONLY BY DESIGN (mirrors `whatsapp_notification_templates`,
-- 20260621000003, and the platform-admin posture generally): RLS is ENABLED
-- but no anon / authenticated row-access policies are defined, so tenants can
-- neither read nor write this table directly. The service role bypasses RLS;
-- reads go through plan 172-03's resolver (server-side only) and future
-- admin-panel CRUD goes through the service client behind `requireAdmin`
-- (Phase 173). This is platform data, NOT tenant data.
--
-- Seed content (17 rows, all scope='tenant' channel='in_app') is hand-copied
-- VERBATIM from `lib/notifications/template-seed.ts`'s `EVENT_TEMPLATE_SEED`
-- — that TS module is the single source of truth; a CI test
-- (`tests/unit/notifications/template-seed-completeness.test.ts`) proves the
-- two representations can never silently drift apart, and that every current
-- `EventType` has a seeded row (research/PITFALLS.md Pitfall 1).
--
-- This migration ships INERT: nothing in production reads from this table
-- yet (`copy.ts` remains the only live source of notification copy until
-- plan 172-03's resolver + Phase 174's call-site sweep land). Per project
-- convention, migrations are applied to prod MANUALLY — this file must NOT
-- be assumed applied, and no automated migration-apply step references it.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). NO secrets.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('tenant','customer')),
  event_type  text NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('in_app','email','sms')),
  subject     text,               -- email only
  title       text,               -- in_app only
  body        text NOT NULL,
  variables   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, event_type, channel)
);

-- Partial index matching the resolver's exact query shape (172-03): lookup by
-- (scope, event_type, channel), active rows only.
CREATE INDEX IF NOT EXISTS notification_templates_lookup_idx
  ON public.notification_templates (scope, event_type, channel) WHERE is_active;

-- Service-role-only (mirror whatsapp_notification_templates): NO anon/authenticated
-- policies. Resolver + admin CRUD go through the service client; the service
-- role bypasses RLS. No company_id column exists — see header.
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notification_templates IS
  'Platform notification template registry (Phase 172, TMPL-01). Service-role-only: RLS enabled with no tenant policies, no company_id column (no per-tenant overrides by design). Seeded day-one from lib/notifications/template-seed.ts; ships inert until plan 172-03''s resolver + Phase 174''s call-site sweep read from it.';

-- Day-one seed: 17 rows, one per current EventType, scope='tenant' channel='in_app'.
-- Values copied VERBATIM from lib/notifications/template-seed.ts's EVENT_TEMPLATE_SEED.
INSERT INTO public.notification_templates (scope, event_type, channel, title, body, variables) VALUES
  ('tenant', 'estimate.viewed', 'in_app', 'Estimate viewed', '{{clientName}} opened estimate {{estimateNumber}}.', '["clientName","estimateNumber"]'::jsonb),
  ('tenant', 'estimate.accepted', 'in_app', 'Estimate accepted', '{{clientName}} accepted {{estimateNumber}}.', '["clientName","estimateNumber"]'::jsonb),
  ('tenant', 'estimate.declined', 'in_app', 'Estimate declined', '{{clientName}} declined {{estimateNumber}}.', '["clientName","estimateNumber"]'::jsonb),
  ('tenant', 'estimate.expired', 'in_app', 'Estimate expired', 'Estimate {{estimateNumber}} reached its expiry without a response.', '["estimateNumber"]'::jsonb),
  ('tenant', 'payment.received', 'in_app', 'Payment received', '{{amountUSD}} received for {{projectName}}.', '["amountUSD","projectName"]'::jsonb),
  ('tenant', 'payment.refunded', 'in_app', 'Payment refunded', '{{amountUSD}} refunded for {{projectName}}.', '["amountUSD","projectName"]'::jsonb),
  ('tenant', 'trial.expiring_3d', 'in_app', 'Trial ends soon', 'Your trial ends in {{daysRemaining}} days. Upgrade to keep Pro features.', '["daysRemaining"]'::jsonb),
  ('tenant', 'trial.expired', 'in_app', 'Trial expired', 'Your trial has ended. You have been moved to the free plan.', '[]'::jsonb),
  ('tenant', 'trial.converted', 'in_app', 'Welcome to Pro', 'Your subscription is active. Thanks for upgrading!', '[]'::jsonb),
  ('tenant', 'quota.80pct', 'in_app', 'Approaching monthly limit', 'You have used {{quotaPercent}}% of your monthly AI quota.', '["quotaPercent"]'::jsonb),
  ('tenant', 'quota.exhausted', 'in_app', 'Monthly quota exhausted', 'You have used all included AI credits this month. Upgrade or wait until reset.', '[]'::jsonb),
  ('tenant', 'whatsapp.inbound', 'in_app', 'New WhatsApp message', 'Message from {{whatsappFrom}}.', '["whatsappFrom"]'::jsonb),
  ('tenant', 'ai_job.failed', 'in_app', 'AI job failed', '{{jobType}} did not complete: {{errorMessage}}.', '["jobType","errorMessage"]'::jsonb),
  ('tenant', 'ai_job.completed', 'in_app', 'AI job complete', '{{jobType}} finished successfully.', '["jobType"]'::jsonb),
  ('tenant', 'admin.tier_changed', 'in_app', 'Plan updated by admin', 'Your plan was changed from {{tierFrom}} to {{tierTo}}.', '["tierFrom","tierTo"]'::jsonb),
  -- CREDITUI-04 / Pitfall 5 guard: variables MUST stay '[]' — never add a credits/amount variable here.
  ('tenant', 'admin.bonus_credits_granted', 'in_app', 'Bonus credits granted', 'An admin added bonus credits to your account.', '[]'::jsonb),
  ('tenant', 'system.maintenance', 'in_app', '{{maintenanceTitle}}', '{{maintenanceBody}}', '["maintenanceTitle","maintenanceBody"]'::jsonb)
ON CONFLICT (scope, event_type, channel) DO NOTHING;
