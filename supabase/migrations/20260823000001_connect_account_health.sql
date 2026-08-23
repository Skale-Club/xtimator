-- supabase/migrations/20260823000001_connect_account_health.sql
-- CONNECT-HEALTH-01: track the connected account's actual charge-ability.
--
-- Phase 70's `handleAccountUpdated` webhook handler only ever synced display
-- name / email, so `stripe_connect_status` never left 'active' once a company
-- connected — even after Stripe restricted the account (failed verification,
-- a rejected review, a paused capability, ...). `paymentsEnabled()` stayed
-- green the whole time, so tenants kept issuing invoices nobody could
-- actually pay. This migration adds the two columns the fixed webhook handler
-- needs to persist the account's real state, and widens the status CHECK to
-- carry a new 'restricted' value alongside the existing
-- pending/active/disconnected set.
--
-- Idempotent throughout: ADD COLUMN IF NOT EXISTS, and a DO block that finds
-- and drops whatever the existing (originally unnamed / auto-generated) CHECK
-- constraint on companies.stripe_connect_status is actually called before
-- recreating it under a stable, explicit name — safe to rerun.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled       BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_connect_disabled_reason TEXT;

COMMENT ON COLUMN public.companies.stripe_charges_enabled IS
  'Mirrors Stripe Account.charges_enabled for the connected account (CONNECT-HEALTH-01). NULL = never synced (legacy row, pre-fix); false = Stripe has paused charges on this account. Written only by the account.updated Connect webhook handler.';
COMMENT ON COLUMN public.companies.stripe_connect_disabled_reason IS
  'Mirrors Stripe Account.requirements.disabled_reason for the connected account (CONNECT-HEALTH-01) — e.g. requirements.past_due, rejected.fraud. NULL when charges are enabled or the account was never restricted. Written only by the account.updated Connect webhook handler.';

-- Drop whatever the existing CHECK constraint on stripe_connect_status is
-- actually named (it was added inline via ALTER TABLE ... ADD COLUMN in
-- 20260517000001_phase70_stripe_connect_columns.sql, so Postgres assigned it
-- an auto-generated name) before recreating it with the widened value set
-- under a stable, explicit name. Re-running this block is a no-op once the
-- stable name is in place — it just drops and recreates the same constraint.
DO $$
DECLARE
  existing_constraint TEXT;
BEGIN
  SELECT con.conname INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'companies'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%stripe_connect_status%'
  LIMIT 1;

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.companies DROP CONSTRAINT %I', existing_constraint);
  END IF;
END $$;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_stripe_connect_status_check
  CHECK (stripe_connect_status IS NULL OR stripe_connect_status IN ('pending','active','disconnected','restricted'));
