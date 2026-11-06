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
-- stays in the column, only the block flag is turned off.
--
-- payment_terms / warranty_terms are written ONLY when the text is a literal
-- seed (false). A blank text omits the key, and so does any real text: an absent
-- key already resolves to "on iff the company has the text", so owners who typed
-- their own terms keep them. estimate_terms is omitted entirely for the same
-- reason (absent follows estimate_terms_enabled AND text).
UPDATE companies SET document_blocks =
  jsonb_build_object(
    'summary', true,
    'timeline', true,
    'notes', true,
    'photos', true,
    'valid_until', false
  )
  || CASE WHEN btrim(COALESCE(default_payment_terms, '')) = 'Net 30'
          THEN jsonb_build_object('payment_terms', false)
          ELSE '{}'::jsonb END
  || CASE WHEN btrim(COALESCE(default_warranty_terms, '')) = '1 year'
          THEN jsonb_build_object('warranty_terms', false)
          ELSE '{}'::jsonb END
WHERE document_blocks IS NULL;
