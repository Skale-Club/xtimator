-- supabase/migrations/20261121170000_protect_company_billing_columns_on_insert.sql
-- Close the INSERT half of the companies billing/ownership guard.
--
-- THE GAP. public.protect_company_billing_columns() (20260822000001, last
-- extended in 20260823000005) is a BEFORE UPDATE trigger: a client role
-- (anon / authenticated) cannot change tier, credit_balance, byok_*, stripe_*,
-- auto_topup_*, ai_model_override, demo_estimate_quota ... on a company row.
-- But the RLS policy `companies_insert` (20260526000002) lets an authenticated
-- user INSERT a company they own (user_id = auth.uid()), and nothing guarded
-- INSERT. A tenant could therefore create a company straight through PostgREST
-- with tier = 'business', credit_balance = 1000000, byok_enabled = true and the
-- values stuck, while the same values as an UPDATE are rejected (42501).
-- Confirmed on a local replay of the whole migration history.
--
-- THE FIX. A BEFORE INSERT trigger that, only when current_user is a client
-- role, resets every protected column to the value it would have had if the
-- client had not mentioned it: the column DEFAULT, or NULL when it has none.
-- The service role, the table owner and SECURITY DEFINER functions owned by
-- them are untouched (current_user is not a client role there), so the
-- webhooks, the admin panel and backfills keep writing these columns.
--
-- FORCE, NOT REJECT. The values are silently reset instead of raising
-- insufficient_privilege, on purpose. Until now the add-company flow
-- (lib/actions/company.ts, mode 'add') sent `tier` in the client insert to
-- inherit the first company's plan. The code that stops sending it ships with
-- this migration, but older deployed code keeps running during the rollout
-- window, and rejecting would break "add company" for every paid account until
-- the new build is live. Forcing is also what the migration 20261121140000
-- already does for the two platform switches. A tenant gains nothing from the
-- reset: the row ends up exactly as if the columns had been left out.
--
-- `user_id` is NOT in the list: the client must set it, and RLS checks that it
-- equals auth.uid().
--
-- COLUMN LIST. Exactly the columns of the BEFORE UPDATE guard as defined in
-- 20260823000005 (the latest definition without the feature switches), minus
-- user_id. This migration is INDEPENDENT of 20261121140000: it does not touch
-- or mention any of its feature-switch columns (that migration has its own
-- small BEFORE INSERT trigger for its two platform switches). It applies, with the same result,
-- on a database that has the feature-switch migrations and on one that does not,
-- in either order. Every column below existed before this migration.
--
-- DEFAULTS ARE HARD-CODED, and mirror the real column defaults (read from a
-- replay): tier 'free', credit_balance 0, byok_enabled false,
-- auto_topup_enabled false; every other protected column has no default, so
-- NULL. If one of these defaults ever changes, this function must change with
-- it; tests/unit/billing/protect-company-columns-on-insert-migration.test.ts
-- lists the columns and literals so the drift is visible in review.
-- A static list was chosen over reading pg_attrdef at insert time because it
-- is auditable at a glance, has no dynamic SQL, and company inserts are rare.
--
-- APPLY BY HAND to BOTH databases (Supabase dev AND the Coolify production
-- database); the deploy never runs migrations. It can ship on its own, before
-- or after the feature-switch migrations, and should be applied as soon as the
-- owner approves. Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

CREATE OR REPLACE FUNCTION public.protect_company_billing_columns_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.tier                              := 'free';
    NEW.tier_trial_ends_at                := NULL;
    NEW.tier_renews_at                    := NULL;
    NEW.tier_cancelled_at                 := NULL;
    NEW.credit_balance                    := 0;
    NEW.byok_enabled                      := false;
    NEW.byok_openrouter_key               := NULL;
    NEW.byok_key_last4                    := NULL;
    NEW.stripe_customer_id                := NULL;
    NEW.stripe_subscription_id            := NULL;
    NEW.stripe_subscription_status        := NULL;
    NEW.stripe_subscription_interval      := NULL;
    NEW.stripe_account_id                 := NULL;
    NEW.stripe_connect_status             := NULL;
    NEW.stripe_connected_at               := NULL;
    NEW.stripe_account_email              := NULL;
    NEW.stripe_account_display_name       := NULL;
    NEW.stripe_charges_enabled            := NULL;
    NEW.stripe_connect_disabled_reason    := NULL;
    NEW.auto_topup_enabled                := false;
    NEW.auto_topup_threshold_credits      := NULL;
    NEW.auto_topup_pack_index             := NULL;
    NEW.auto_topup_pack_price_cents       := NULL;
    NEW.auto_topup_pack_credits           := NULL;
    NEW.auto_topup_in_flight_until        := NULL;
    NEW.auto_topup_last_failed_at         := NULL;
    NEW.auto_topup_last_charge_attempt_at := NULL;
    NEW.ai_model_override                 := NULL;
    NEW.demo_estimate_quota               := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_protect_billing_columns_on_insert ON public.companies;
CREATE TRIGGER companies_protect_billing_columns_on_insert
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_billing_columns_on_insert();

COMMENT ON FUNCTION public.protect_company_billing_columns_on_insert() IS
  'BEFORE INSERT guard on companies: a company created by a client role (anon/authenticated) always starts with every billing/ownership column at its default (the same columns protect_company_billing_columns guards on UPDATE, except user_id). Values are forced, not rejected, so older deployed code keeps working. Service role and table owner are unaffected.';

NOTIFY pgrst, 'reload schema';
