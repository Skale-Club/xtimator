-- Phase 44: add delivery_format column to company_whatsapp
-- 'share_link' (default): send xtimator.com/estimate/{token}
-- 'formatted_text': send full estimate text body — no Meta template approval needed
ALTER TABLE company_whatsapp
  ADD COLUMN IF NOT EXISTS delivery_format TEXT NOT NULL DEFAULT 'share_link'
    CHECK (delivery_format IN ('share_link', 'formatted_text'));
