-- SEED-056 Phase A: progressive estimate sections.
--
-- companies.document_blocks  nullable JSONB, per-company defaults for which
--   optional document blocks a NEW estimate carries. NULL = system defaults
--   (payment/warranty/timeline/notes/valid_until off, summary on). Keys:
--   summary, payment_terms, warranty_terms, timeline, notes, photos,
--   estimate_terms, valid_until (all optional booleans).
-- estimates.valid_until      DATE, "Valid until" header line (D4). Set at
--   creation from estimate_date (or today) + companies.default_validity_days.
--
-- Idempotent: safe to re-run. The backfill only touches rows still NULL.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS document_blocks JSONB;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS valid_until DATE;

-- Existing companies keep today's behaviour for timeline/notes (D3); the
-- literal seeds 'Net 30' / '1 year' count as "never configured" (D2): the text
-- stays in the column, only the block flag is off.
UPDATE companies SET document_blocks = jsonb_build_object(
  'summary', true,
  'payment_terms', (default_payment_terms IS NOT NULL
                    AND btrim(default_payment_terms) <> ''
                    AND default_payment_terms <> 'Net 30'),
  'warranty_terms', (default_warranty_terms IS NOT NULL
                     AND btrim(default_warranty_terms) <> ''
                     AND default_warranty_terms <> '1 year'),
  'timeline', true,
  'notes', true,
  'photos', true,
  'estimate_terms', COALESCE(estimate_terms_enabled, false),
  'valid_until', false
) WHERE document_blocks IS NULL;
