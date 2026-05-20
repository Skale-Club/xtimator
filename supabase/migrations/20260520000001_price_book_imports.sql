-- Phase 76 PB-CSV-07: Undo tracking for CSV imports
-- 5-minute undo window enforced server-side via created_at gate
CREATE TABLE IF NOT EXISTS public.price_book_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  inserted_item_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  updated_item_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  inserted_folder_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  prev_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_price_book_imports_company_created
  ON public.price_book_imports (company_id, created_at DESC);

ALTER TABLE public.price_book_imports ENABLE ROW LEVEL SECURITY;

-- Owner-only read/write — company members can see their own imports
CREATE POLICY "Members can read company imports"
  ON public.price_book_imports
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert imports for their company"
  ON public.price_book_imports
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete imports for their company"
  ON public.price_book_imports
  FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.price_book_imports IS
  'Phase 76: tracks each CSV import batch for 5-min undo. prev_state stores pre-update snapshots keyed by item id.';
