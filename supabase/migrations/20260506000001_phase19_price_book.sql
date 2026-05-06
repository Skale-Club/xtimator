-- Phase 19: Price Book DB Foundation
-- Creates company_price_book table with RLS and adds price_source to estimate_items
-- D-07: UUID PKs. D-08: Hard-delete only (no deleted_at). No Postgres enums (TEXT + CHECK).

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.company_price_book (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  name         TEXT NOT NULL,
  unit         TEXT,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.company_price_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_price_book_select" ON company_price_book FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_price_book_insert" ON company_price_book FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_price_book_update" ON company_price_book FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_price_book_delete" ON company_price_book FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ============================================================
-- ALTER estimate_items: add nullable price_source column
-- ============================================================

ALTER TABLE estimate_items
  ADD COLUMN price_source TEXT
  CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate'));

COMMENT ON COLUMN estimate_items.price_source IS
  'Origin of the unit_price. NULL = pre-v1.3 row (no badge). price_book = matched company price book entry. ai_estimate = AI-generated market price.';
