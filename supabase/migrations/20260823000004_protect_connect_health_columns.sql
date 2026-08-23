-- supabase/migrations/20260823000004_protect_connect_health_columns.sql
-- Follow-up to 20260822000001_protect_billing_columns.sql.
--
-- 20260823000001 added `stripe_charges_enabled` and
-- `stripe_connect_disabled_reason` to `companies`. Both are written ONLY by the
-- Stripe `account.updated` Connect webhook (service role) and both are read by
-- `paymentsEnabled()` — a tenant who could set `stripe_charges_enabled = true`
-- on a restricted account would re-open invoice issuing that Stripe has paused.
-- The BEFORE UPDATE guard must therefore cover them, exactly like every other
-- Stripe-attested column.
--
-- CREATE OR REPLACE of the same function the earlier migration installed: the
-- trigger itself already points at this name, so replacing the body is enough
-- and re-running is a no-op.

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
