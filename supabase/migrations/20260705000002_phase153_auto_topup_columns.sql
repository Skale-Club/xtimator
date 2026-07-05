-- Phase 153 (CREDITUI-07): auto-top-up per-company settings + concurrency lock.
-- All columns default to fully-off (false/null) so every existing company is
-- unaffected — same retrocompat posture as every prior billing phase.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_threshold_credits INTEGER DEFAULT NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_pack_index SMALLINT DEFAULT NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_in_flight_until TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS auto_topup_last_failed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN companies.auto_topup_enabled IS
  'Tenant opt-in for auto-top-up. Only takes effect when billing_config.autoTopupEnabled (platform kill switch) is also true.';
COMMENT ON COLUMN companies.auto_topup_threshold_credits IS
  'Balance below which auto-top-up fires. NULL = not configured.';
COMMENT ON COLUMN companies.auto_topup_pack_index IS
  'Index into billing_config.topUpPacks purchased automatically. NULL = not configured.';
COMMENT ON COLUMN companies.auto_topup_in_flight_until IS
  'Concurrency guard: non-null + future timestamp means a charge attempt is in flight for this company. Self-healing TTL backstop against a crashed serverless function.';
COMMENT ON COLUMN companies.auto_topup_last_failed_at IS
  'Set when the most recent off-session auto-top-up charge failed (declined, no payment method, etc). Cleared on the next successful charge. Drives the tenant-facing failure banner.';

-- Atomic acquire: succeeds (returns true) iff no other process holds the lock
-- or the previous lock has expired. Fails CLOSED — ambiguity favors NOT
-- charging twice, never favors charging twice (research: correctness > latency).
CREATE OR REPLACE FUNCTION public.acquire_autotopup_lock(p_company_id UUID, p_ttl_seconds INTEGER DEFAULT 60)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.companies
  SET auto_topup_in_flight_until = now() + (p_ttl_seconds || ' seconds')::interval
  WHERE id = p_company_id
    AND (auto_topup_in_flight_until IS NULL OR auto_topup_in_flight_until < now());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_autotopup_lock(p_company_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.companies SET auto_topup_in_flight_until = NULL WHERE id = p_company_id;
$$;
