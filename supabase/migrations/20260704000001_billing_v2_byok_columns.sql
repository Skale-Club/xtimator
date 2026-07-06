-- Billing v2: BYOK (bring-your-own-key) support — super-admin gated feature.
-- Additive + nullable, safe for the currently deployed code.
--
-- Model (Billing v2):
--   * Credits are THE customer-facing meter: every op on the PLATFORM AI key
--     debits credits (real cost x markup, Phase 112 ledger).
--   * BYOK companies use their OWN OpenRouter key -> their ops never debit and
--     the credit gate never blocks them. Enabled ONLY by a super-admin
--     ("street-sale" feature: never publicly sold).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS byok_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS byok_openrouter_key TEXT,
  ADD COLUMN IF NOT EXISTS byok_key_last4 TEXT;

COMMENT ON COLUMN companies.byok_enabled IS
  'Billing v2 BYOK: when true, this company''s AI calls use its own OpenRouter key and NEVER debit platform credits. Toggled ONLY by super-admin (hidden street-sale feature). Service-role writes only.';
COMMENT ON COLUMN companies.byok_openrouter_key IS
  'AES-encrypted blob (lib/crypto/aes EncryptedBlob JSON) of the company''s own OpenRouter API key. NEVER store plaintext. Read via service role only.';
COMMENT ON COLUMN companies.byok_key_last4 IS
  'Display hint (last 4 chars of the key) for the super-admin UI. Never the full key.';
