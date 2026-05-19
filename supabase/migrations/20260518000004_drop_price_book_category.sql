-- 20260518000004_drop_price_book_category.sql
-- QUICK-V0Z: Unify folder + category — folders become sole taxonomy.
-- Steps (idempotent):
--   1) For every distinct (company_id, lower(trim(category))) where category IS NOT NULL/blank
--      AND folder_id IS NULL on at least one item, ensure a price_book_folders row exists
--      with name = original-cased category. Reuse by case-insensitive name match per company.
--   2) Backfill company_price_book.folder_id from those folders for items that had a category
--      but no folder.
--   3) Drop column company_price_book.category.

DO $$
BEGIN
  -- Only run the data migration if the column still exists (idempotent).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_price_book'
      AND column_name = 'category'
  ) THEN
    -- 1) Create missing folders from distinct categories (per company).
    --    Match existing folders case-insensitively to avoid duplicates.
    INSERT INTO public.price_book_folders (company_id, name)
    SELECT DISTINCT
      pb.company_id,
      btrim(pb.category) AS name
    FROM public.company_price_book pb
    WHERE pb.folder_id IS NULL
      AND pb.category IS NOT NULL
      AND btrim(pb.category) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.price_book_folders f
        WHERE f.company_id = pb.company_id
          AND lower(f.name) = lower(btrim(pb.category))
      );

    -- 2) Backfill folder_id on items that had a category but no folder.
    UPDATE public.company_price_book pb
    SET folder_id = f.id
    FROM public.price_book_folders f
    WHERE pb.folder_id IS NULL
      AND pb.category IS NOT NULL
      AND btrim(pb.category) <> ''
      AND f.company_id = pb.company_id
      AND lower(f.name) = lower(btrim(pb.category));

    -- 3) Drop the column. Items with neither category nor folder simply stay folder_id NULL.
    ALTER TABLE public.company_price_book DROP COLUMN category;
  END IF;
END
$$;
