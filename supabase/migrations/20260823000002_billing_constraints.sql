-- supabase/migrations/20260823000002_billing_constraints.sql
-- BILL-CONSTRAINT-01: DB-level guards backing the deposit_value zod/engine
-- fixes landed in the same phase, plus dedup protection for the Stripe
-- mapping columns.
--
-- (1) estimates.deposit_value: CHECK non-negative, and CHECK the percent-type
--     upper bound (<=100). Without these, a direct PostgREST write (bypassing
--     the app's zod validation) could still persist deposit_type='percent' +
--     deposit_value=150 on a $1,000 estimate (editor: "Deposit −$1,500 /
--     Balance $0"; share doc: "$1,000 / $0"; invoice charges $1,000 — three
--     surfaces disagreeing), or deposit_type='amount' + deposit_value=-500
--     (balance_due persisted as $1,500 on a $1,000 estimate).
--     Prod verified 0 out-of-range deposit_value rows at authoring time, so
--     both CHECKs are added VALIDATED (no NOT VALID / VALIDATE two-step
--     needed).
--
-- (2) companies.stripe_customer_id / stripe_subscription_id / stripe_account_id:
--     partial UNIQUE indexes. readMappedCompanyId() (app/api/webhooks/stripe/
--     route.ts) resolves the owning company via .maybeSingle(), which THROWS
--     on more than one matching row — a duplicate mapping 500s the webhook
--     resolve step, and Stripe retries the event forever. Prod verified 0
--     duplicate rows across all three columns at authoring time, so all three
--     indexes CREATE cleanly with no dedup/backfill step.
--
-- Idempotent throughout: DO blocks guarded by a pg_constraint lookup for the
-- CHECKs (ALTER TABLE ... ADD CONSTRAINT has no native IF NOT EXISTS — same
-- pattern as 20260529000001_whatsapp_company_id_unique.sql), and
-- CREATE/DROP INDEX IF EXISTS for the indexes.

-- ============================================================
-- 1. estimates.deposit_value CHECKs
-- ============================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimates_deposit_value_nonneg'
  ) THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_deposit_value_nonneg
      CHECK (deposit_value IS NULL OR deposit_value >= 0);
  END IF;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimates_deposit_value_percent_cap'
  ) THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_deposit_value_percent_cap
      CHECK (deposit_type <> 'percent' OR deposit_value IS NULL OR deposit_value <= 100);
  END IF;
END $do$;

-- ============================================================
-- 2. companies Stripe mapping columns: partial UNIQUE indexes
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_customer_id_unique
  ON public.companies(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_subscription_id_unique
  ON public.companies(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Replaces the existing NON-unique idx_companies_stripe_account_id
-- (20260517000001_phase70_stripe_connect_columns.sql). A unique partial index
-- on the same column/WHERE clause serves every lookup the old index served,
-- while ALSO enforcing the invariant Stripe already guarantees (one Connect
-- account maps to at most one company) — keeping the old non-unique index
-- around would only add write overhead for no additional benefit, so it is
-- dropped here rather than kept alongside the new one.
DROP INDEX IF EXISTS idx_companies_stripe_account_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_account_id_unique
  ON public.companies(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
