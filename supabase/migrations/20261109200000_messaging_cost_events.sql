-- supabase/migrations/20261109200000_messaging_cost_events.sql
-- Phase 2b: per-message cost of WhatsApp / SMS / email, recorded and passed to the
-- customer's credits.
--
-- Append-mostly, one row per message we send. Modeled on ai_cost_events (20260624000003):
--   * service-role writes only (the service role bypasses RLS), deny-all for clients;
--   * super-admin SELECT only. Tenants get NO direct access: credits are the only
--     user-facing unit, so a tenant never reads a per-message cost.
--   * cost_usd is NULLABLE. NULL = not known yet (a WhatsApp message is only priced when
--     Meta's "delivered" status webhook arrives). It is never coerced to 0: 0 means
--     "known to be free" (failed, free service window, non-billable by Meta).
--
-- Billing: an hourly job sums cost_usd per company over billable, unclaimed rows and
-- debits credits ONCE per company per run (operation 'messaging'). Claim columns:
--   debit_batch_id  set first by a conditional UPDATE (so two concurrent runs cannot
--                   take the same rows), debited_at set after the debit is recorded.
-- billable = false rows (welcome sequence, unknown-sender reply, OTP, ops alerts) are
-- platform costs: recorded for cost tracking, never debited.
--
-- credit_ledger.operation_type gains 'messaging' (guarded constraint swap, same shape
-- as 20261106000001_credit_lots.sql). Apply to BOTH databases before the push that
-- depends on it (migrations are applied by hand; the deploy ships code only).
--
-- Idempotent DDL: CREATE TABLE/INDEX IF NOT EXISTS, guarded policy + constraint swap.

CREATE TABLE IF NOT EXISTS public.messaging_cost_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL, -- NULL = platform send (no tenant)
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
  provider            TEXT NOT NULL CHECK (provider IN ('meta', 'twilio', 'resend')),
  provider_message_id TEXT,            -- wamid / Twilio SID / Resend id
  purpose             TEXT NOT NULL,   -- bot_reply, owner_notification, estimate_delivery, welcome, unknown_sender, otp, ops, ...
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  category            TEXT,            -- Meta pricing category (utility, marketing, authentication, service)
  market              TEXT,            -- destination country code (US, CA, BR, ...) or 'default'
  units               INTEGER NOT NULL DEFAULT 1 CHECK (units >= 0), -- SMS segments
  cost_usd            NUMERIC(12,6),   -- NULL = not priced yet; 0 = known free
  status              TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  debited_at          TIMESTAMPTZ,
  debit_batch_id      UUID
);

ALTER TABLE public.messaging_cost_events ENABLE ROW LEVEL SECURITY;

-- Super-admins only (no client INSERT/UPDATE/DELETE policies; service role bypasses RLS).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messaging_cost_events'
      AND policyname = 'messaging_cost_events_select_super_admin'
  ) THEN
    CREATE POLICY "messaging_cost_events_select_super_admin"
      ON public.messaging_cost_events
      FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())));
  END IF;
END $do$;

-- One row per provider message: a repeated status webhook / retried send is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS messaging_cost_events_provider_msg
  ON public.messaging_cost_events(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- The hourly debit job: unclaimed billable rows per company.
CREATE INDEX IF NOT EXISTS messaging_cost_events_debit
  ON public.messaging_cost_events(company_id, billable, debited_at)
  WHERE billable AND debited_at IS NULL;

-- Stale-claim recovery (claimed but not yet marked debited).
CREATE INDEX IF NOT EXISTS messaging_cost_events_batch
  ON public.messaging_cost_events(debit_batch_id)
  WHERE debit_batch_id IS NOT NULL AND debited_at IS NULL;

-- Admin debug rollups (channel x last 30 days).
CREATE INDEX IF NOT EXISTS messaging_cost_events_company_created
  ON public.messaging_cost_events(company_id, created_at DESC);

COMMENT ON TABLE public.messaging_cost_events IS
  'Per-message real-cost log for WhatsApp/SMS/email. Service-role writes only; super-admin read only. Billable rows are debited in credits by the hourly messaging debit job.';

-- credit_ledger.operation_type: allow 'messaging'.
DO $do$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_ledger'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
      AND pg_get_constraintdef(oid) ILIKE '%messaging%'
  ) THEN
    FOR v_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.credit_ledger'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.credit_ledger DROP CONSTRAINT %I', v_name);
    END LOOP;
    ALTER TABLE public.credit_ledger
      ADD CONSTRAINT credit_ledger_operation_type_check
      CHECK (operation_type IS NULL OR operation_type IN
        ('estimate','photo_batch','audio_minutes','price_research','chat','messaging'));
  END IF;
END $do$;
