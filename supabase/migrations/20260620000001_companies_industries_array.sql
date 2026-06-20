-- Multi-service support: a company can serve several trades (e.g. a carpet
-- cleaner that also does house cleaning and window cleaning).
--
-- The existing singular `companies.industry` column is KEPT and stays in sync
-- as the PRIMARY industry (= industries[0]). It is still read by tax-rate
-- defaults (lib/tax-rates.ts), estimate generation (lib/services/generate-estimate.ts)
-- and the AI prompt builder (lib/ai/prompt-builder.ts). Application code writes
-- both columns; this migration just adds the array and backfills it.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS industries text[] NOT NULL DEFAULT '{}';

-- Backfill the array from the existing single industry value.
-- NULL / empty industry stays as an empty array.
UPDATE public.companies
SET industries = ARRAY[industry]
WHERE industry IS NOT NULL
  AND industry <> ''
  AND (industries IS NULL OR cardinality(industries) = 0);
