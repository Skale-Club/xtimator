-- Organization currency support.
-- Currency is intentionally separate from estimate language.

DO $$
BEGIN
  ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD';

  UPDATE companies
  SET currency_code = 'USD'
  WHERE currency_code IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_currency_code_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_currency_code_check
      CHECK (currency_code IN ('USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'CHF', 'JPY', 'NZD'));
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE estimates
    ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD';

  UPDATE estimates
  SET currency_code = 'USD'
  WHERE currency_code IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimates_currency_code_check'
  ) THEN
    ALTER TABLE estimates
      ADD CONSTRAINT estimates_currency_code_check
      CHECK (currency_code IN ('USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'CHF', 'JPY', 'NZD'));
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE company_price_book
    ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD';

  UPDATE company_price_book
  SET currency_code = 'USD'
  WHERE currency_code IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_price_book_currency_code_check'
  ) THEN
    ALTER TABLE company_price_book
      ADD CONSTRAINT company_price_book_currency_code_check
      CHECK (currency_code IN ('USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'CHF', 'JPY', 'NZD'));
  END IF;
END $$;
