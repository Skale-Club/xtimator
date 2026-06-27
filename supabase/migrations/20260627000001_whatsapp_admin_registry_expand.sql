-- Phase 142.1: WhatsApp Admin Registry Expand
-- Normalized company-level WhatsApp configuration and authorized sender identities.
-- Idempotent, authored-only, deployed via CI → GHCR → Coolify.
-- Preserves all legacy company_whatsapp rows (expand-migrate-contract).

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. whatsapp_company_configs — one row per company, platform-managed config
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS whatsapp_company_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'active', 'suspended')),
  delivery_format TEXT NOT NULL DEFAULT 'share_link'
    CHECK (delivery_format IN ('share_link', 'formatted_text', 'pdf_attachment')),
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_company_configs ENABLE ROW LEVEL SECURITY;
-- No tenant policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. whatsapp_authorized_senders — normalized sender identities
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS whatsapp_authorized_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES whatsapp_company_configs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'active', 'suspended')),
  verified_at TIMESTAMPTZ,
  created_by_admin BOOLEAN,
  source_row_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_authorized_senders ENABLE ROW LEVEL SECURITY;
-- No tenant policies: deny-all for anon/authenticated. Service role bypasses RLS.

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- Exactly one active sender phone globally (the routing authority)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_active_sender_phone_unique
  ON whatsapp_authorized_senders (phone_e164)
  WHERE status = 'active';

-- Fast company/status lookup for admin filtering
CREATE INDEX IF NOT EXISTS whatsapp_sender_company_status_idx
  ON whatsapp_authorized_senders (company_id, status);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Backfill — one config per company, one sender per owner_phone
--    Deterministic, idempotent (ON CONFLICT), non-destructive (legacy untouched).
-- ══════════════════════════════════════════════════════════════════════════════

-- 4a. Create one whatsapp_company_config per distinct company_id in company_whatsapp
INSERT INTO whatsapp_company_configs (company_id, status, delivery_format)
SELECT DISTINCT ON (cw.company_id)
  cw.company_id,
  CASE WHEN cw.status = 'active' THEN 'active' ELSE 'pending_review' END,
  COALESCE(cw.delivery_format, 'share_link')
FROM company_whatsapp cw
ORDER BY cw.company_id, cw.created_at ASC NULLS LAST
ON CONFLICT (company_id) DO NOTHING;

-- 4b. Copy non-null owner_phone rows into authorized senders
--     source_row_id preserves the original company_whatsapp row for traceability.
INSERT INTO whatsapp_authorized_senders
  (config_id, company_id, user_id, phone_e164, status, source_row_id, created_by_admin)
SELECT
  cfg.id,
  cw.company_id,
  cw.user_id,
  cw.owner_phone,
  CASE WHEN cw.status = 'active' THEN 'active' ELSE 'pending_review' END,
  cw.id,
  FALSE
FROM company_whatsapp cw
JOIN whatsapp_company_configs cfg ON cfg.company_id = cw.company_id
WHERE cw.owner_phone IS NOT NULL
  AND cw.owner_phone <> ''
ON CONFLICT DO NOTHING;

-- 4c. Mark companies with multiple distinct active owner_phones for admin review.
--     A company with exactly one distinct phone may preserve 'active'.
--     A company with multiple distinct phones must be 'pending_review'.
UPDATE whatsapp_company_configs cfg
SET
  status = 'pending_review',
  review_reason = 'Multiple distinct owner phones detected; requires admin review',
  updated_at = NOW()
WHERE cfg.status = 'active'
  AND (
    SELECT COUNT(DISTINCT cw.owner_phone)
    FROM company_whatsapp cw
    WHERE cw.company_id = cfg.company_id
      AND cw.owner_phone IS NOT NULL
      AND cw.owner_phone <> ''
  ) > 1;

-- Also mark the corresponding senders as pending_review
UPDATE whatsapp_authorized_senders sender
SET
  status = 'pending_review',
  updated_at = NOW()
WHERE sender.status = 'active'
  AND (
    SELECT COUNT(DISTINCT cw.owner_phone)
    FROM company_whatsapp cw
    WHERE cw.company_id = sender.company_id
      AND cw.owner_phone IS NOT NULL
      AND cw.owner_phone <> ''
  ) > 1;
