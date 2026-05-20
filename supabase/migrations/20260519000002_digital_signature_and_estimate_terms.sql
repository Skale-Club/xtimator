-- Digital Signature + Estimate Terms
-- Both features are optional toggles per company.

-- 1. Companies: opt-in flags and terms text
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS digital_signature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimate_terms_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimate_terms_text       TEXT;

-- 2. estimate_signatures: one row per signed estimate
--    Anon role can INSERT (client signs via public share link).
--    Authenticated role can SELECT (company owner views signatures).
CREATE TABLE IF NOT EXISTS estimate_signatures (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id    UUID        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  company_id     UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  signer_name    TEXT        NOT NULL,
  signer_email   TEXT,
  signature_data TEXT        NOT NULL,  -- base64 PNG of drawn signature
  ip_address     INET,
  user_agent     TEXT,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE estimate_signatures ENABLE ROW LEVEL SECURITY;

-- Company owner reads their signatures
CREATE POLICY "estimate_signatures_select" ON estimate_signatures FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- Client (anon) inserts via public share link — only when estimate exists and signature is enabled
CREATE POLICY "estimate_signatures_anon_insert" ON estimate_signatures FOR INSERT TO anon
  WITH CHECK (
    estimate_id IN (
      SELECT e.id FROM estimates e
      JOIN companies c ON c.id = e.company_id
      WHERE e.share_token IS NOT NULL
        AND c.digital_signature_enabled = TRUE
    )
  );
