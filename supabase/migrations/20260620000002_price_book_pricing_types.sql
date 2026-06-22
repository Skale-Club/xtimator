-- Add pricing type support to company_price_book
ALTER TABLE company_price_book
  ADD COLUMN pricing_type  TEXT NOT NULL DEFAULT 'fixed'
    CHECK (pricing_type IN ('fixed', 'area_based', 'base_plus_addons')),
  ADD COLUMN base_price    NUMERIC(12,2),   -- base_plus_addons: base cost before options
  ADD COLUMN price_per_unit NUMERIC(12,2),  -- area_based: cost per sqft/unit
  ADD COLUMN minimum_price  NUMERIC(12,2),  -- area_based: floor price
  ADD COLUMN area_sizes    JSONB;           -- area_based: [{name, sqft, price}]

-- Add-on options for base_plus_addons pricing type
CREATE TABLE price_book_item_options (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id      UUID NOT NULL REFERENCES company_price_book(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_quantity INT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE price_book_item_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage their item options"
  ON price_book_item_options
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );
