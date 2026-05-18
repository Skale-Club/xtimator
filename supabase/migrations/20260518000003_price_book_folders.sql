-- SEED-025: Price book category hierarchy (folders)
-- Adds price_book_folders table and folder_id FK to company_price_book.
-- Exactly 2 levels: folder → category. No self-referential FK — separate table.

-- ============================================================
-- TABLE: price_book_folders
-- ============================================================
CREATE TABLE public.price_book_folders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY: price_book_folders
-- ============================================================
ALTER TABLE public.price_book_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_book_folders_select" ON price_book_folders FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "price_book_folders_insert" ON price_book_folders FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "price_book_folders_update" ON price_book_folders FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "price_book_folders_delete" ON price_book_folders FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ============================================================
-- ALTER company_price_book: add nullable folder_id FK
-- ============================================================
ALTER TABLE public.company_price_book
  ADD COLUMN folder_id UUID REFERENCES price_book_folders(id) ON DELETE SET NULL;

COMMENT ON COLUMN company_price_book.folder_id IS
  'Optional folder grouping (level 1). NULL = uncategorized at folder level. category TEXT is level 2.';
