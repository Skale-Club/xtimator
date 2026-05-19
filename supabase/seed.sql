-- ============================================================
-- Xtimator — local development seed
-- Run via: bunx supabase db reset  (applies all migrations then this seed)
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- ============================================================

-- Seed a placeholder Twilio entry in platform_integrations so the admin UI
-- renders the card even before credentials are configured.
-- ciphertext/iv/auth_tag are nullable (migration 20260517000002); metadata
-- stores the outbound phone number set by the admin.
INSERT INTO platform_integrations (provider, metadata, updated_at)
VALUES (
  'twilio',
  '{"from_phone": ""}',
  NOW()
)
ON CONFLICT (provider) DO NOTHING;

-- ── Demo company seed (runs only when a demo/dev company exists) ──────────
-- Enables digital signature + estimate terms on whatever company was created
-- during local onboarding so the features are visible without manual toggling.
DO $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Pick the earliest company (the dev/demo account created during onboarding).
  SELECT id INTO v_company_id FROM companies ORDER BY created_at ASC LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    UPDATE companies SET
      digital_signature_enabled = true,
      estimate_terms_enabled     = true,
      estimate_terms_text        = 'All work is performed in accordance with local building codes. A 50% deposit is required before work begins. Final payment is due upon completion. This estimate is valid for 30 days from the date above.',
      email_delivery_enabled     = true,
      sms_delivery_enabled       = false
    WHERE id = v_company_id;
  END IF;
END $$;
