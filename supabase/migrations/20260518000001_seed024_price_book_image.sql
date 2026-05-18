-- SEED-024: add optional photo reference to price book items
ALTER TABLE public.company_price_book
  ADD COLUMN image_url TEXT;

COMMENT ON COLUMN public.company_price_book.image_url IS
  'Optional reference photo URL. Stored in the photos bucket at {company_id}/price-book/{item_id}.{ext}. NULL = no photo.';
