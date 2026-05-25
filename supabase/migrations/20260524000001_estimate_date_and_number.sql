-- Allow overriding the displayed date and estimate number on a document
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS estimate_date DATE,
  ADD COLUMN IF NOT EXISTS estimate_number TEXT;
