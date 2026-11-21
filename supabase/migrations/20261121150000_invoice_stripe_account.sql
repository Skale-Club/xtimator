-- supabase/migrations/20261121150000_invoice_stripe_account.sql
-- Invoice rows remember the connected Stripe account they were issued on.
--
-- A Stripe customer exists only inside one connected account. After a company
-- disconnects and connects a different account, reusing the stripe_customer_id
-- of an earlier invoice makes Stripe reject the new invoice. The issue path now
-- reuses a customer only when the earlier row's stripe_account_id equals the
-- account being used. The Connect webhook also uses this column to keep honoring
-- invoice events that come from the account an invoice was issued on, even after
-- the company switched to another account.
--
-- No backfill: rows issued before this column stay NULL (we do not know which
-- account they were issued on). NULL means "do not reuse the customer" and "the
-- event must come from the company's current account".
--
-- APPLY BY HAND to BOTH databases (Supabase dev AND the Coolify production
-- database) BEFORE the deploy that depends on it; the deploy never runs
-- migrations. Additive and idempotent.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

COMMENT ON COLUMN public.invoices.stripe_account_id IS
  'Connected Stripe account (acct_...) this invoice was created on. NULL on rows issued before this column existed. Used to reuse stripe_customer_id only within the same account and to authorize invoice webhook events from a previously connected account. Written by the service role only.';

CREATE INDEX IF NOT EXISTS idx_invoices_stripe_account_id
  ON public.invoices (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
