-- supabase/migrations/20260823000005_subscription_interval.sql
-- Deep-audit follow-up: the billing UI cannot tell a monthly subscriber from an
-- annual one, so the tier card renders a disabled "Current plan" on BOTH
-- intervals and the monthly→annual switch — the highest-margin conversion in
-- the product — is unreachable from the UI.
--
-- The interval was already known and thrown away: create-checkout-session
-- stamps `metadata.billing_interval` on the Checkout Session AND on the
-- subscription, and nothing ever read it back (the audit flagged it as dead
-- metadata). This column persists it, written by the same webhook arms that
-- already own the subscription lifecycle:
--   * checkout.session.completed  → session.metadata.billing_interval
--   * customer.subscription.updated → the PLAN item's price.recurring.interval
--     (authoritative after a portal-driven plan change, which never revisits
--     the Checkout metadata)
--   * customer.subscription.deleted → NULL (no live subscription)
--
-- NULL therefore means "unknown / no subscription", and the UI falls back to
-- today's interval-blind behaviour rather than guessing.
--
-- Service-role written only: the guard trigger installed by
-- 20260822000001 (extended in 20260823000004) is updated here to cover it, so
-- a tenant cannot flip their own row to 'year' via PostgREST.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_subscription_interval TEXT;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_stripe_subscription_interval_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_stripe_subscription_interval_check
      CHECK (stripe_subscription_interval IS NULL OR stripe_subscription_interval IN ('month', 'year'));
  END IF;
END $do$;

COMMENT ON COLUMN public.companies.stripe_subscription_interval IS
  'Billing interval of the live Stripe subscription (''month'' | ''year''), written by the platform webhook. NULL = unknown or no subscription; the billing UI then stays interval-blind instead of guessing. Service-role writes only (guarded by protect_company_billing_columns).';

-- Extend the tenant-write guard to the new column (same function the trigger
-- already points at — replacing the body is enough).
CREATE OR REPLACE FUNCTION public.protect_company_billing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.user_id                          IS DISTINCT FROM OLD.user_id
    OR NEW.tier                             IS DISTINCT FROM OLD.tier
    OR NEW.tier_trial_ends_at               IS DISTINCT FROM OLD.tier_trial_ends_at
    OR NEW.tier_renews_at                   IS DISTINCT FROM OLD.tier_renews_at
    OR NEW.tier_cancelled_at                IS DISTINCT FROM OLD.tier_cancelled_at
    OR NEW.credit_balance                   IS DISTINCT FROM OLD.credit_balance
    OR NEW.byok_enabled                     IS DISTINCT FROM OLD.byok_enabled
    OR NEW.byok_openrouter_key              IS DISTINCT FROM OLD.byok_openrouter_key
    OR NEW.byok_key_last4                   IS DISTINCT FROM OLD.byok_key_last4
    OR NEW.stripe_customer_id               IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id           IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.stripe_subscription_status       IS DISTINCT FROM OLD.stripe_subscription_status
    OR NEW.stripe_subscription_interval     IS DISTINCT FROM OLD.stripe_subscription_interval
    OR NEW.stripe_account_id                IS DISTINCT FROM OLD.stripe_account_id
    OR NEW.stripe_connect_status            IS DISTINCT FROM OLD.stripe_connect_status
    OR NEW.stripe_connected_at              IS DISTINCT FROM OLD.stripe_connected_at
    OR NEW.stripe_account_email             IS DISTINCT FROM OLD.stripe_account_email
    OR NEW.stripe_account_display_name      IS DISTINCT FROM OLD.stripe_account_display_name
    OR NEW.stripe_charges_enabled           IS DISTINCT FROM OLD.stripe_charges_enabled
    OR NEW.stripe_connect_disabled_reason   IS DISTINCT FROM OLD.stripe_connect_disabled_reason
    OR NEW.auto_topup_enabled               IS DISTINCT FROM OLD.auto_topup_enabled
    OR NEW.auto_topup_threshold_credits     IS DISTINCT FROM OLD.auto_topup_threshold_credits
    OR NEW.auto_topup_pack_index            IS DISTINCT FROM OLD.auto_topup_pack_index
    OR NEW.auto_topup_pack_price_cents      IS DISTINCT FROM OLD.auto_topup_pack_price_cents
    OR NEW.auto_topup_pack_credits          IS DISTINCT FROM OLD.auto_topup_pack_credits
    OR NEW.auto_topup_in_flight_until       IS DISTINCT FROM OLD.auto_topup_in_flight_until
    OR NEW.auto_topup_last_failed_at        IS DISTINCT FROM OLD.auto_topup_last_failed_at
    OR NEW.auto_topup_last_charge_attempt_at IS DISTINCT FROM OLD.auto_topup_last_charge_attempt_at
    OR NEW.ai_model_override                IS DISTINCT FROM OLD.ai_model_override
    OR NEW.demo_estimate_quota              IS DISTINCT FROM OLD.demo_estimate_quota
    THEN
      RAISE EXCEPTION 'companies: billing/ownership columns are service-role only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
