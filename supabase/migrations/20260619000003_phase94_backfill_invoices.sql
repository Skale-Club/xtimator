-- Phase 94 (INVOICE-07 / D-22): preserve payment history by creating one
-- invoices row (kind='full', status='paid') per already-paid estimate.
--
-- Why: Phase 94 moves payment state off `estimates` and onto the new `invoices`
-- snapshot entity. Estimates that were already paid via the old Checkout flow
-- (Phase 70) carry their money on `estimates.payment_*`. This migration mirrors
-- that history forward so the new model is the single source of truth without
-- losing any record of a completed payment.
--
-- Idempotent: skips estimates that already have a paid full invoice, so the
-- migration is safe to re-run (NOT EXISTS guard below). The partial unique index
-- idx_invoices_stripe_invoice_id only indexes non-null stripe_invoice_id values,
-- so the NULL stripe_invoice_id on every backfilled row never collides.
--
-- Only backfills rows with a positive amount: the invoices.amount_cents CHECK
-- requires amount_cents > 0, so estimates with a NULL/zero payment_amount_cents
-- are skipped rather than violating the constraint.
INSERT INTO public.invoices (
  estimate_id, company_id, kind, amount_cents, currency_code,
  project_name, status, stripe_invoice_id, paid_at, created_at
)
SELECT
  e.id,
  e.company_id,
  'full',
  e.payment_amount_cents,
  COALESCE(e.currency_code, 'USD'),
  p.name,
  'paid',
  NULL,
  COALESCE(e.paid_at, e.updated_at, now()),
  COALESCE(e.paid_at, e.updated_at, now())
FROM estimates e
LEFT JOIN projects p ON p.id = e.project_id
WHERE e.payment_status = 'paid'
  AND e.payment_amount_cents IS NOT NULL
  AND e.payment_amount_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.estimate_id = e.id AND i.kind = 'full' AND i.status = 'paid'
  );
