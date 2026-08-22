-- supabase/migrations/20260822000001_protect_billing_columns.sql
-- Deep-audit hotfix (SEC-C2 / SEC-H1): billing columns are tenant-writable.
--
-- The `companies_update` RLS policy scopes UPDATE by ROW (owner or member) but
-- `authenticated` holds a TABLE-LEVEL UPDATE grant, so any member can PATCH
-- /rest/v1/companies with the browser anon key + their JWT and set
-- byok_enabled=true (unmetered AI on the platform key), tier='business',
-- credit_balance, stripe_account_id (issue invoices on another Stripe
-- account), the auto-top-up pack snapshot (10M credits for $0.50), or
-- user_id (take ownership). `estimates` has the same shape for the
-- Stripe-attested payment columns (payment_status / paid_at / ...), which the
-- RLS-hardening pass closed for `invoices` only.
--
-- Every legitimate writer of these columns runs on the service role
-- (webhook, billing routes, auto-top-up, admin actions, Xphere sync). The
-- tenant-facing RLS client only ever updates profile/settings columns
-- (lib/actions/settings.ts, company.ts, theme.ts, estimate-template.ts,
-- custom-domain.ts) and estimate content/deposit terms — none of the
-- columns below. A BEFORE UPDATE trigger is therefore safe and precise: it
-- denies a change to a protected column ONLY when the request runs as a
-- client role (PostgREST does SET ROLE anon|authenticated; the service role
-- and postgres are untouched).
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

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
    OR NEW.stripe_account_id                IS DISTINCT FROM OLD.stripe_account_id
    OR NEW.stripe_connect_status            IS DISTINCT FROM OLD.stripe_connect_status
    OR NEW.stripe_connected_at              IS DISTINCT FROM OLD.stripe_connected_at
    OR NEW.stripe_account_email             IS DISTINCT FROM OLD.stripe_account_email
    OR NEW.stripe_account_display_name      IS DISTINCT FROM OLD.stripe_account_display_name
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

DROP TRIGGER IF EXISTS companies_protect_billing_columns ON public.companies;
CREATE TRIGGER companies_protect_billing_columns
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_billing_columns();

-- estimates: payment state must be Stripe-attested (D-10). deposit_type /
-- deposit_value stay tenant-editable on purpose (they are the owner's terms,
-- not payment state).
CREATE OR REPLACE FUNCTION public.protect_estimate_payment_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.payment_status             IS DISTINCT FROM OLD.payment_status
    OR NEW.paid_at                    IS DISTINCT FROM OLD.paid_at
    OR NEW.payment_amount_cents       IS DISTINCT FROM OLD.payment_amount_cents
    OR NEW.stripe_payment_intent_id   IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
    THEN
      RAISE EXCEPTION 'estimates: payment columns are service-role only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_protect_payment_columns ON public.estimates;
CREATE TRIGGER estimates_protect_payment_columns
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.protect_estimate_payment_columns();

COMMENT ON FUNCTION public.protect_company_billing_columns IS
  'BEFORE UPDATE guard: denies changes to companies billing/ownership columns when the request runs as anon/authenticated (PostgREST). Service role and postgres are unaffected. Deep-audit hotfix 2026-08-22.';
COMMENT ON FUNCTION public.protect_estimate_payment_columns IS
  'BEFORE UPDATE guard: denies changes to estimates Stripe-attested payment columns when the request runs as anon/authenticated. Service role and postgres are unaffected. Deep-audit hotfix 2026-08-22.';
