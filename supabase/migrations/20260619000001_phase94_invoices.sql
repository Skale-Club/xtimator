-- Phase 94 (INVOICE-02): immutable invoice snapshot entity. One estimate -> many invoices.
-- Issues real Stripe Invoices on the connected account. Payment state lives HERE, not on estimates (D-10).
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id         UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('deposit','balance','full')),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  currency_code       TEXT NOT NULL,
  project_name        TEXT,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','open','paid','void','uncollectible')),
  stripe_invoice_id   TEXT,
  stripe_customer_id  TEXT,
  hosted_invoice_url  TEXT,
  invoice_pdf_url     TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id
  ON public.invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_id ON public.invoices(estimate_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id  ON public.invoices(company_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS: MATCH the Phase 82 company_members subquery pattern (NOT companies.user_id).
-- Phase 82 migration 20260526000001 rewrote every tenant table to gate by company_members
-- and ends with an assertion that fails the build if any policy references companies.user_id.
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));
-- No DELETE policy (financial records -- prefer void). Webhook writes via service role (bypasses RLS).
