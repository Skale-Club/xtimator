-- Add owner_phone to company_whatsapp for platform-managed inbound routing.
-- The platform has ONE WhatsApp Business number (Xtimator's).
-- When an owner sends a message to that number, we route by their sender phone
-- to identify the company. owner_phone stores that E.164 number.

ALTER TABLE company_whatsapp
  ADD COLUMN IF NOT EXISTS owner_phone TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Backfill platform-managed inbound routing for companies that existed before
-- owner_phone was introduced. The webhook resolves first-message senders via
-- company_whatsapp.owner_phone; without this, existing owners are silently
-- ignored until they save company settings again.
WITH normalized_companies AS (
  SELECT
    id AS company_id,
    CASE
      WHEN regexp_replace(phone, '[^\d+]', '', 'g') LIKE '+%' THEN regexp_replace(phone, '[^\d+]', '', 'g')
      ELSE '+' || regexp_replace(phone, '[^\d+]', '', 'g')
    END AS owner_phone
  FROM companies
  WHERE phone IS NOT NULL
    AND regexp_replace(phone, '[^\d+]', '', 'g') <> ''
),
valid_owner_phones AS (
  SELECT company_id, owner_phone
  FROM (
    SELECT
      company_id,
      owner_phone,
      row_number() OVER (PARTITION BY owner_phone ORDER BY company_id) AS rn
    FROM normalized_companies
    WHERE length(substr(owner_phone, 2)) BETWEEN 7 AND 15
  ) ranked
  WHERE rn = 1
)
INSERT INTO company_whatsapp (company_id, owner_phone, status)
SELECT company_id, owner_phone, 'active'
FROM valid_owner_phones
WHERE NOT EXISTS (
  SELECT 1
  FROM company_whatsapp existing
  WHERE existing.owner_phone = valid_owner_phones.owner_phone
    AND existing.company_id <> valid_owner_phones.company_id
)
ON CONFLICT (company_id) DO UPDATE
SET owner_phone = COALESCE(company_whatsapp.owner_phone, EXCLUDED.owner_phone),
    status = COALESCE(company_whatsapp.status, 'active')
WHERE company_whatsapp.owner_phone IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM company_whatsapp existing
    WHERE existing.owner_phone = EXCLUDED.owner_phone
      AND existing.company_id <> company_whatsapp.company_id
  );

-- Unique index so one phone can only belong to one company.
CREATE UNIQUE INDEX IF NOT EXISTS company_whatsapp_owner_phone_unique
  ON company_whatsapp (owner_phone)
  WHERE owner_phone IS NOT NULL;
