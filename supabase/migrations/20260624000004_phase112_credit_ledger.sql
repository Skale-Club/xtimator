-- supabase/migrations/20260624000004_phase112_credit_ledger.sql
-- Phase 112 (CREDIT-01/CREDIT-03): tenant-scoped append-only credit ledger
--   + fast-read companies.credit_balance. RLS mirrors phase94 invoices
--   (company_members SELECT — owner reads own balance/history). Service role
--   writes (bypasses RLS). NOT applied to remote — carried by CI->GHCR->Coolify
--   alongside 20260624000003.
--
-- Append-only: ONLY a SELECT policy. No INSERT/UPDATE/DELETE policy and no
--   DELETE — the ledger is immutable history; corrections land as new rows
--   (reason='adjust'). credit_balance on companies is the O(1) read for CREDIT-03.
--
-- null vs 0 discipline: real_cost_usd / markup are NULLABLE provenance of a
--   debit only (NULL for grant/topup/adjust). operation_type is NULL except on
--   a chargeable debit. Credits are whole units — delta_credits / balance_after
--   are INTEGER.
--
-- Idempotency: a retried debit re-presents the same (company_id, idempotency_key)
--   and the partial-unique index makes the second INSERT fail / no-op, so a debit
--   can never double-insert.
--
-- Idempotent DDL: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.

-- ============================================================
-- 1. CREDIT_LEDGER: append-only per-operation credit movements
-- ============================================================
-- operation_type lists exactly the FOUR chargeable user-facing ops
--   (estimate, photo_batch, audio_minutes, price_research) — NOT 'vision' or
--   'translation' (those are sub-calls rolled into photo_batch / estimate).
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delta_credits   INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('grant','debit','topup','adjust')),
  operation_type  TEXT CHECK (operation_type IN ('estimate','photo_batch','audio_minutes','price_research')),
  ref_id          TEXT,
  real_cost_usd   NUMERIC(12,6),
  markup          NUMERIC(6,3),
  balance_after   INTEGER NOT NULL,
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. COMPANIES.CREDIT_BALANCE: fast-read cached balance (CREDIT-03)
-- ============================================================
-- NOT NULL DEFAULT 0 backfills every existing company atomically to a 0 balance.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 3. INDEXES
-- ============================================================
-- History read: most-recent-first ledger for a company.
CREATE INDEX IF NOT EXISTS idx_credit_ledger_company_created
  ON public.credit_ledger(company_id, created_at DESC);

-- Idempotency: partial-unique on (company_id, idempotency_key) WHERE NOT NULL so
-- multiple NULL keys (grants/topups/adjusts without a key) never collide, but a
-- retried debit carrying the same key cannot double-insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_idempotency
  ON public.credit_ledger(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 4. RLS: TENANT-READABLE (mirror phase94 invoices)
-- ============================================================
-- Match the Phase 82 company_members subquery pattern (NEVER the legacy
-- companies owner column — the Phase 82 assertion fails the build if any policy
-- references it).
-- Append-only: ONLY a SELECT policy. No INSERT/UPDATE/DELETE — the service role
-- bypasses RLS for all writes.
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_ledger_select" ON public.credit_ledger FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));

COMMENT ON TABLE public.credit_ledger IS
  'Append-only per-operation credit ledger. Tenant-readable via company_members (owner reads own balance/history); service-role writes only. Phase 112 (CREDIT-01/CREDIT-03).';
