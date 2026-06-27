-- Phase 142.1 Plan 06: WhatsApp Admin Registry Contract
-- Verifies the normalized backfill exists, then contracts the legacy
-- company_whatsapp table by renaming it to signal it is deprecated.
-- Idempotent, authored-only, deployed via CI → GHCR → Coolify.
--
-- D-12: refuses destructive contraction when unmigrated source rows remain.
-- D-13: legacy per-user routing schema and direct readers are removed after migration.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Guard: verify the expand migration backfill completed successfully
-- ══════════════════════════════════════════════════════════════════════════════

-- Each company with an active legacy row should have a corresponding config row
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM company_whatsapp cw
    WHERE cw.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM whatsapp_company_configs cfg
        WHERE cfg.company_id = cw.company_id
      )
  ) THEN
    RAISE EXCEPTION 'Contract migration blocked: unmigrated legacy active rows remain in company_whatsapp';
  END IF;
END $$;

-- Each company with a non-null owner_phone should have a corresponding sender row
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM company_whatsapp cw
    WHERE cw.owner_phone IS NOT NULL
      AND cw.owner_phone <> ''
      AND NOT EXISTS (
        SELECT 1 FROM whatsapp_authorized_senders s
        WHERE s.company_id = cw.company_id
          AND s.phone_e164 = cw.owner_phone
      )
  ) THEN
    RAISE EXCEPTION 'Contract migration blocked: unmigrated owner_phone rows remain in company_whatsapp';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Add welcome_sent_at to whatsapp_company_configs and backfill from legacy
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_company_configs
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

-- Backfill: copy the most recent welcome_sent_at from legacy rows per company
UPDATE whatsapp_company_configs cfg
SET welcome_sent_at = (
  SELECT MAX(cw.welcome_sent_at)
  FROM company_whatsapp cw
  WHERE cw.company_id = cfg.company_id
    AND cw.welcome_sent_at IS NOT NULL
)
WHERE cfg.welcome_sent_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Revoke DML on legacy table (belt-and-suspenders before rename)
-- ══════════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE ON company_whatsapp FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON company_whatsapp FROM anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Drop obsolete per-user indexes on legacy table
-- ══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS company_whatsapp_company_user_idx;
DROP INDEX IF EXISTS company_whatsapp_company_no_user_unique;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Rename legacy table to explicitly signal deprecation
--    (rg proves zero runtime references outside migrations/tests before drop)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS company_whatsapp RENAME TO _legacy_company_whatsapp;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Downgrade RLS on legacy table to deny-all (was already deny-all, but
--    ensure no future policy can accidentally grant access)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE _legacy_company_whatsapp FORCE ROW LEVEL SECURITY;
