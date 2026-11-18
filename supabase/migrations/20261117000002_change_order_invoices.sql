-- supabase/migrations/20261117000002_change_order_invoices.sql
-- Change order invoicing (XTM-CONTRACT-CO-01, delivery 3).
--
-- An approved change order can be billed on its own: an `invoices` row of the
-- new kind 'change_order' that points at it. The row keeps estimate_id = the
-- accepted parent estimate, so the Connect webhook (routes by
-- metadata.invoice_id), the estimate's issued-invoices list and the estimate's
-- public page keep working unchanged. Change orders that are not billed on
-- their own (credits always) are folded into the balance invoice by the server
-- action (lib/change-orders/invoicing.ts); the database only stores the rows.
--
-- APPLY BY HAND to BOTH databases (Supabase dev AND the Coolify production
-- database) BEFORE the deploy that depends on it; the deploy never runs
-- migrations. Additive only: one nullable column, a widened CHECK, a pairing
-- CHECK and two indexes. Existing rows (kinds deposit/balance/full) are valid
-- under every new constraint.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS change_order_id uuid
  REFERENCES public.change_orders(id);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_kind_check
  CHECK (kind IN ('deposit', 'balance', 'full', 'change_order'));

-- A change_order invoice always names its change order, and only that kind does.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_change_order_pairing;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_change_order_pairing
  CHECK ((kind = 'change_order') = (change_order_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_invoices_change_order_id
  ON public.invoices(change_order_id)
  WHERE change_order_id IS NOT NULL;

-- At most one live (draft / open / paid) invoice per change order. A void or
-- uncollectible one does not count, so the owner can void and issue again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_live_per_change_order
  ON public.invoices(change_order_id)
  WHERE change_order_id IS NOT NULL AND status IN ('draft', 'open', 'paid');

COMMENT ON COLUMN public.invoices.change_order_id IS
  'Set only for kind = change_order: the approved change order billed by this invoice. estimate_id stays the accepted parent estimate.';

-- The new column and the invoices -> change_orders relationship (used by the
-- change_order:change_orders(number) embed) must reach the PostgREST cache.
NOTIFY pgrst, 'reload schema';
