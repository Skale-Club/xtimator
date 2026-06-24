-- Phase 105 (v4.6): widen estimate_items.price_source CHECK to accept 'researched'.
-- Dormant threading — nothing tags an item 'researched' until Phase 108.
-- Idempotent: drops the Phase-19 inline CHECK (autonamed) and re-adds a named, widened one.

ALTER TABLE estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_price_source_check;

ALTER TABLE estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_price_source_researched_check;

ALTER TABLE estimate_items
  ADD CONSTRAINT estimate_items_price_source_researched_check
  CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate', 'researched'));

COMMENT ON COLUMN estimate_items.price_source IS
  'Origin of the unit_price. NULL = pre-v1.3 row (no badge) or owner-edited. price_book = matched company price book entry. ai_estimate = AI-generated market price. researched = regional market price from the v4.6 research agent (Phase 108).';
