-- supabase/migrations/20260821000001_stripe_subscription_status.sql
-- Stripe platform webhook fix — subscription status column.
--
-- companies.tier + companies.stripe_subscription_id together used to be the
-- only signal for "is this company an active paying subscriber" (see the
-- monthly-credit-grant cron's `tier IN ('pro','business') AND
-- stripe_subscription_id IS NOT NULL` filter). That conflates tier with
-- subscription lifecycle state: a subscription mid-dunning, past_due, or
-- incomplete still reads as "active paying" by that filter alone. This column
-- adds the actual Stripe subscription.status string as a second, independent
-- signal, written directly from the webhook events that carry it.
--
-- ADD COLUMN IF NOT EXISTS — idempotent re-run safe (repo convention; this
-- repo applies migrations to production BY HAND, never via the deploy
-- pipeline — see docs/STORAGE-MIGRATION.md for the general reminder).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;

COMMENT ON COLUMN companies.stripe_subscription_status IS
  'Raw Stripe Subscription.status (e.g. active, trialing, past_due, canceled, unpaid). Written by the platform webhook: checkout.session.completed mirrors the retrieved subscription.status (writes nothing when the retrieve fails), customer.subscription.updated mirrors subscription.status, customer.subscription.deleted sets ''canceled''. NULL for rows written before this column existed or never touched by these events — treat NULL as unknown, not inactive (see monthly-credit-grant.ts''s backward-compatible OR filter).';
