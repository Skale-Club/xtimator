-- Quick-260718-t7d: soft-delete (Trash) for price book items.
-- Items with deleted_at set are hidden from the price book, estimate
-- autocomplete, the chat agent, and CSV-import dedup; they surface on /trash
-- where they can be restored or permanently deleted.
alter table company_price_book add column if not exists deleted_at timestamptz;

-- Active-row lookups (the hot path) filter on deleted_at is null.
create index if not exists idx_company_price_book_active
  on company_price_book (company_id)
  where deleted_at is null;
