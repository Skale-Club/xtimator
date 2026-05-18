-- SEED-010: make price book category optional
ALTER TABLE company_price_book ALTER COLUMN category DROP NOT NULL;
