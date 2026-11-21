-- supabase/migrations/20261121140000_company_feature_switches.sql
-- Per-company feature switches (owner decision XTM-D-20261121-feature-switches).
--
-- Two client-facing features become switchable per company:
--   * online payments   (Stripe Connect hosted invoices)
--   * digital signature (online approve-and-sign on the public link)
-- Each works only when the platform switch (`*_allowed`, super admin, service
-- role) AND the tenant switch (`*_enabled`, company owner) are on, plus Stripe
-- readiness for payments. `digital_signature_enabled` already exists. The
-- single resolver is lib/features/company-features.ts.
--
-- Defaults: payments is off until a super admin allows it; signature is
-- allowed by default so existing behaviour does not change (its tenant switch
-- keeps its current value). The backfill keeps every company that already has
-- a Stripe account linked on the feature, so nobody connected loses it.
--
-- The two `*_allowed` columns are added to protect_company_billing_columns so a
-- tenant JWT cannot flip its own platform switch through PostgREST. The tenant
-- switches stay writable by the tenant.
--
-- APPLY BY HAND to BOTH databases (Supabase dev AND the Coolify production
-- database) BEFORE the deploy that depends on it; the deploy never runs
-- migrations. Additive and idempotent.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS online_payments_allowed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS online_payments_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS digital_signature_allowed BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.online_payments_allowed IS
  'Platform switch: the company may use online payments (Stripe Connect invoices). Written by the service role / super admin only (guarded by protect_company_billing_columns). See lib/features/company-features.ts.';
COMMENT ON COLUMN public.companies.online_payments_enabled IS
  'Tenant switch: the company owner turned online payments on. Effective only while online_payments_allowed is true. Written by the company owner. See lib/features/company-features.ts.';
COMMENT ON COLUMN public.companies.digital_signature_allowed IS
  'Platform switch: the company may offer online approve-and-sign to clients. Written by the service role / super admin only (guarded by protect_company_billing_columns). See lib/features/company-features.ts.';

-- Backfill (idempotent): companies already linked to Stripe keep the feature.
UPDATE public.companies
   SET online_payments_allowed = true,
       online_payments_enabled = true
 WHERE stripe_account_id IS NOT NULL
   AND (online_payments_allowed = false OR online_payments_enabled = false);

-- Extend the tenant-write guard (same function the trigger already points at).
-- Starts from the 20260823000005 definition; every column it listed is kept.
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
    OR NEW.online_payments_allowed          IS DISTINCT FROM OLD.online_payments_allowed
    OR NEW.digital_signature_allowed        IS DISTINCT FROM OLD.digital_signature_allowed
    THEN
      RAISE EXCEPTION 'companies: billing/ownership columns are service-role only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The guard above is BEFORE UPDATE only, and `companies_insert` lets an
-- authenticated user INSERT a company row they own (adding a second company).
-- Without this, a tenant could create a company with
-- online_payments_allowed = true straight through PostgREST. On INSERT from a
-- client role the platform switches are therefore forced back to their
-- defaults; the service role (super admin, backfills) is untouched.
CREATE OR REPLACE FUNCTION public.companies_platform_switch_insert_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.online_payments_allowed   := false;
    NEW.digital_signature_allowed := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_platform_switch_insert_defaults ON public.companies;
CREATE TRIGGER companies_platform_switch_insert_defaults
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_platform_switch_insert_defaults();

COMMENT ON FUNCTION public.companies_platform_switch_insert_defaults() IS
  'BEFORE INSERT guard: a company created by a client role (anon/authenticated) always starts with the platform switches at their defaults (payments not allowed, signature allowed). Service role is unaffected. XTM-D-20261121-feature-switches.';

NOTIFY pgrst, 'reload schema';
