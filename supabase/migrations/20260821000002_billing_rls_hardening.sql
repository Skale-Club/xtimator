-- supabase/migrations/20260821000002_billing_rls_hardening.sql
-- Billing data access hardening (RLS-HARDEN-01): three independent tightenings
-- of the tenant-facing (authenticated/PostgREST) surface around invoices and
-- the credit ledger. None of this touches service-role access — every
-- existing service-role write path (webhook, generateInvoice action,
-- recordCreditDebit/grantCredits/reconcileBalance, apply_credit_ledger_entry,
-- the auto-top-up cron) is unaffected, because the service role bypasses RLS
-- and column-level grants entirely.
--
-- Idempotent DDL throughout: DROP POLICY IF EXISTS, REVOKE/GRANT (both
-- naturally idempotent — re-running never errors), REVOKE EXECUTE (same).

-- ============================================================
-- 1. INVOICES: writes are now service-role only
-- ============================================================
-- Phase 94 (20260619000001) gave `authenticated` both an INSERT and an UPDATE
-- policy scoped by company_members. That let any tenant with a valid session
-- call PostgREST directly and flip status='paid' (or any other column,
-- including stripe_invoice_id / paid_at) on their own invoice row, bypassing
-- the Stripe webhook entirely — payment state must be Stripe-attested, never
-- client-writable (D-10: payment state lives on invoices, and nothing but the
-- webhook / service role may set it).
--
-- The webhook already writes via requireServiceClient() (bypasses RLS). The
-- one remaining tenant-facing writer, generateInvoice (lib/actions/invoice.ts),
-- is being switched to the service client in a parallel change — once that
-- lands, no code path exists that relied on the tenant INSERT policy either.
-- Dropping both here is safe today: the SELECT policy is untouched, so owners
-- keep read access to their own invoices.
DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update" ON public.invoices;

-- Belt-and-braces: the table-level privileges granted to anon/authenticated
-- by the schema defaults still include INSERT/UPDATE/DELETE. Today writes are
-- blocked only because no PERMISSIVE write policy exists — one accidental
-- policy would reopen tenant writes. Revoke the privileges themselves so a
-- future policy cannot silently re-enable client-side writes to financial rows.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices FROM anon, authenticated;

COMMENT ON TABLE public.invoices IS
  'Immutable invoice snapshot (Phase 94). Tenant-readable via company_members SELECT only — INSERT/UPDATE dropped RLS-HARDEN-01: all writes are service-role only (Stripe webhook + generateInvoice action).';

-- ============================================================
-- 2. CREDIT_LEDGER: hide cost provenance from tenants (column-level grant)
-- ============================================================
-- The credit_ledger_select RLS policy (Phase 112) already scopes rows to the
-- caller's own company_id, but RLS alone does not hide COLUMNS — a tenant
-- reading their own rows via PostgREST/`select('*')` could see
-- real_cost_usd / markup (our internal cost + margin — never for tenant eyes),
-- idempotency_key and ref_id (internal replay/correlation identifiers), and
-- balance_after / id (redundant with the fast-read companies.credit_balance
-- cache and internal PK — no tenant-facing use).
--
-- Repo-wide grep of app/, lib/, components/, hooks/ for any RLS-client
-- (non-service) read of credit_ledger found none: the only two readers are
-- lib/queries/credits.ts (getCreditOverview — requireServiceClient(), and
-- already restricted to the same owner-safe column list applied below) and
-- lib/billing/credit-ledger.ts (reconcileBalance — requireServiceClient(),
-- selects only delta_credits). Both bypass RLS/grants entirely, so this
-- column-level REVOKE/GRANT cannot break either.
--
-- Clean-slate pattern: REVOKE SELECT on the whole table first (idempotent —
-- undoes any prior blanket grant, explicit or via schema default privileges),
-- then GRANT SELECT back on exactly the five tenant-safe columns.
REVOKE SELECT ON public.credit_ledger FROM anon, authenticated;
GRANT SELECT (company_id, delta_credits, reason, operation_type, created_at)
  ON public.credit_ledger TO authenticated;
-- Same belt-and-braces as invoices: the ledger is append-only and service-role
-- written; no client role may ever hold a write privilege on it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_ledger FROM anon, authenticated;

COMMENT ON TABLE public.credit_ledger IS
  'Append-only per-operation credit ledger. Tenant-readable via company_members RLS, column-restricted RLS-HARDEN-01 to (company_id, delta_credits, reason, operation_type, created_at) only — real_cost_usd/markup/idempotency_key/ref_id/balance_after/id are internal provenance, never tenant-visible. Service-role writes only. Phase 112 (CREDIT-01/CREDIT-03).';

-- ============================================================
-- 3. AUTO-TOP-UP LOCK FUNCTIONS: service-role only (same posture as
--    apply_credit_ledger_entry, 20260706000002)
-- ============================================================
-- acquire_autotopup_lock / release_autotopup_lock (Phase 153, 20260705000002)
-- were created without a REVOKE, so — like every plain CREATE FUNCTION in
-- Postgres — they default to PUBLIC EXECUTE, meaning any authenticated (or
-- even anon) caller could invoke them directly via PostgREST's RPC endpoint:
-- acquire the lock to block a real auto-top-up attempt, or release someone
-- else's in-flight lock to reopen a double-charge race window. Neither
-- function does anything useful outside the auto-top-up trigger path
-- (lib/billing/auto-topup.ts), which already runs on requireServiceClient().
REVOKE EXECUTE ON FUNCTION public.acquire_autotopup_lock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_autotopup_lock(UUID) FROM PUBLIC, anon, authenticated;
-- Explicit service_role grant (repo precedent: 20260729000002, fix-pack F2 #8)
-- so the REVOKE FROM PUBLIC above never strands the one legitimate caller in
-- an environment whose function ACL lacks the implicit service_role entry.
GRANT EXECUTE ON FUNCTION public.acquire_autotopup_lock(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_autotopup_lock(UUID) TO service_role;
