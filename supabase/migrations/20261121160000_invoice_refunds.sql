-- supabase/migrations/20261121160000_invoice_refunds.sql
-- Invoice rows record refunds of the client's payment.
--
-- Until now a refund (Stripe charge.refunded) only sent the owner a
-- notification: the invoices row stayed `paid` with no trace of the refund, so
-- the owner and the client kept seeing "Paid" on money that was returned.
--
-- refunded_cents mirrors Stripe's charge.amount_refunded, which is cumulative,
-- so the Connect webhook can write it idempotently. refunded_at is the time of
-- the last refund event we recorded. `status` is deliberately NOT changed: Stripe
-- itself keeps a refunded invoice `paid`, and the contract math keeps counting
-- it as billed.
--
-- ADD COLUMN IF NOT EXISTS skips the whole clause (CHECK included) when the
-- column already exists, so this is safe to re-run.
--
-- APPLY BY HAND to BOTH databases (Supabase dev AND the Coolify production
-- database) BEFORE the deploy that depends on it; the deploy never runs
-- migrations. Additive and idempotent.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0);
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.invoices.refunded_cents IS
  'Cumulative amount refunded to the client, in minor units. Mirrors Stripe charge.amount_refunded. Written only by the Connect webhook (service role). The status stays paid.';
COMMENT ON COLUMN public.invoices.refunded_at IS
  'When the last refund was recorded by the Connect webhook. NULL when never refunded. Written only by the Connect webhook (service role).';

NOTIFY pgrst, 'reload schema';
