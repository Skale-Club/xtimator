-- Credit recalibration (2026-11-19): AI edits ("Edit with AI", the refine route
-- and a needs-details generation) are debited under their own operation,
-- 'refine', so they can carry a lower markup than a full estimate generation.
-- Widens credit_ledger.operation_type to accept it. Idempotent: does nothing
-- when the constraint already lists 'refine'.
DO $do$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_ledger'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
      AND pg_get_constraintdef(oid) ILIKE '%refine%'
  ) THEN
    FOR v_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.credit_ledger'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.credit_ledger DROP CONSTRAINT %I', v_name);
    END LOOP;
    ALTER TABLE public.credit_ledger
      ADD CONSTRAINT credit_ledger_operation_type_check
      CHECK (operation_type IS NULL OR operation_type IN
        ('estimate','photo_batch','audio_minutes','price_research','chat','messaging','refine'));
  END IF;
END $do$;
