-- Phase 53: Add pdf_attachment as a third delivery_format option
-- Postgres does not support ALTER CONSTRAINT — must DROP and re-ADD.
-- Existing rows with 'share_link' (the DEFAULT) are unaffected.
--
-- Constraint name follows Postgres auto-naming convention: {table}_{column}_check
-- i.e. company_whatsapp_delivery_format_check
ALTER TABLE company_whatsapp
  DROP CONSTRAINT IF EXISTS company_whatsapp_delivery_format_check;

ALTER TABLE company_whatsapp
  ADD CONSTRAINT company_whatsapp_delivery_format_check
  CHECK (delivery_format IN ('share_link', 'formatted_text', 'pdf_attachment'));
