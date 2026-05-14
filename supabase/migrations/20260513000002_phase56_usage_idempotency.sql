-- supabase/migrations/20260513000002_phase56_usage_idempotency.sql
-- Phase 56: Usage Tracking
-- Adds idempotency_key column to usage_events for deduplication of retried inserts.
-- Applied via: bunx supabase db push --db-url $DATABASE_URL

-- ============================================================
-- 1. USAGE_EVENTS: idempotency_key for deduplication
-- ============================================================

-- Nullable column: existing rows get NULL, pre-Phase-56 inserts without a key still work.
-- Multiple NULLs are allowed (partial unique index below handles this correctly).
ALTER TABLE usage_events
  ADD COLUMN idempotency_key TEXT;

COMMENT ON COLUMN usage_events.idempotency_key IS
  'Deduplication key for retries. ON CONFLICT DO NOTHING when same (company_id, idempotency_key) is re-inserted. NULL = no dedup (legacy rows and one-off inserts).';

-- ============================================================
-- 2. PARTIAL UNIQUE INDEX: (company_id, idempotency_key) WHERE NOT NULL
-- ============================================================

-- Partial index: WHERE idempotency_key IS NOT NULL ensures NULLs never collide
-- with each other — multiple NULLs are allowed (correct Postgres pattern for
-- nullable unique fields). Enables ON CONFLICT DO NOTHING via supabase-js upsert.
CREATE UNIQUE INDEX usage_events_idempotency
  ON usage_events(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
