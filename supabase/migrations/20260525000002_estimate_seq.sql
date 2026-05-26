-- Per-company sequential estimate identifier, auto-assigned on insert.
-- The existing `estimate_number TEXT` column remains a user-editable override;
-- this `estimate_seq` is the system-generated unique fallback displayed when
-- no override is set.

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_seq INT;

-- Backfill: assign sequential numbers per company ordered by created_at then id.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id) AS seq
  FROM estimates
)
UPDATE estimates e
SET estimate_seq = numbered.seq
FROM numbered
WHERE e.id = numbered.id
  AND e.estimate_seq IS NULL;

-- Trigger: assign next per-company sequence on insert when not provided.
CREATE OR REPLACE FUNCTION set_estimate_seq()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estimate_seq IS NULL THEN
    SELECT COALESCE(MAX(estimate_seq), 0) + 1
      INTO NEW.estimate_seq
      FROM estimates
     WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_estimate_seq ON estimates;
CREATE TRIGGER trg_set_estimate_seq
BEFORE INSERT ON estimates
FOR EACH ROW
EXECUTE FUNCTION set_estimate_seq();

ALTER TABLE estimates
  DROP CONSTRAINT IF EXISTS estimates_company_seq_unique;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_company_seq_unique UNIQUE (company_id, estimate_seq);

ALTER TABLE estimates ALTER COLUMN estimate_seq SET NOT NULL;
