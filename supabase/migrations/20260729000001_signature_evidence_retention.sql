-- supabase/migrations/20260729000001_signature_evidence_retention.sql
-- Security-hardening work package S3 — audit finding A: evidence destructible.
-- estimates_delete/projects_delete RLS (20260526000001_phase82_rls_company_members.sql:123-126,201-204)
-- lets ANY company member DELETE an estimates or projects row, and
-- estimate_signatures.estimate_id REFERENCES estimates ON DELETE CASCADE
-- (20260519000002) means that delete SILENTLY destroys the signature row --
-- including signed_content/signed_total, the immutable snapshot of what was
-- actually agreed to (Phase 164, 20260717000001_phase164_signature_snapshot.sql)
-- -- with no trace left behind. The system already blocks post-sign EDITS
-- rigorously (save_estimate_atomic's freeze-on-send/sign guard, ERRCODE
-- P0001, 20260717000004_phase165_save_estimate_atomic.sql:80-93) but nothing
-- previously blocked DELETION of the signed row itself.
--
-- This migration closes that gap with a BEFORE DELETE trigger on
-- public.estimates: if an estimate_signatures row exists for OLD.id, the
-- delete is refused (RAISE EXCEPTION), UNLESS the session has explicitly
-- opted in via the `app.allow_signed_estimate_delete` GUC (see escape hatch
-- below). ERRCODE 'P0005' is used -- P0001/P0002/P0003 are already claimed by
-- save_estimate_atomic (estimate_locked / estimate_conflict /
-- estimate_not_current) and P0004 by its estimate_not_found, so P0005 is the
-- next free code in that same family and cannot collide with any existing
-- caller's error-code switch.
--
-- BY DESIGN, this ALSO blocks cascaded deletes reaching public.estimates from
-- a parent projects (or companies, transitively) DELETE -- a Postgres
-- row-level trigger fires for every row removed by a statement regardless of
-- whether that statement targeted estimates directly or arrived via
-- ON DELETE CASCADE from projects/companies. That is intentional: evidence
-- retention wins over the convenience of deleting a whole project/company in
-- one statement. A caller that hits this on a project delete must first deal
-- with (e.g. export, then use the escape hatch for) every signed estimate
-- under that project.
--
-- Escape hatch: deliberate admin / account-deletion flows that must be able
-- to remove a signed estimate (e.g. GDPR/CCPA erasure, support-driven cleanup
-- after the evidence has been exported/archived elsewhere) can
-- `SET LOCAL app.allow_signed_estimate_delete = 'on'` inside their
-- transaction immediately before the DELETE. `current_setting(..., true)`
-- (missing_ok = true) returns NULL rather than raising when the GUC was
-- never set, so ordinary sessions that never touch this setting are
-- unaffected -- the check degrades safely to "blocked".
--
-- GDPR/CCPA erasure runbook (fix-pack F2, finding #2) -- READ BEFORE HARD-
-- DELETING A USER: companies.user_id REFERENCES auth.users ON DELETE CASCADE
-- (20260409000001:12) means `auth.admin.deleteUser` cascades into
-- public.companies -> public.projects -> public.estimates INSIDE GoTrue's OWN
-- transaction, where the calling application never gets a chance to
-- `SET LOCAL app.allow_signed_estimate_delete` -- that GUC can only be set in
-- a transaction the application itself controls, and GoTrue's internal
-- delete-user transaction is not one of those. Concretely:
--
--   Calling `auth.admin.deleteUser` FIRST on a user who owns ANY company with
--   a signed estimate WILL FAIL, BY DESIGN: this trigger raises P0005 partway
--   through GoTrue's own cascade, and the whole deleteUser call rolls back.
--   There is no session-side workaround for this ordering -- it is
--   deliberate, not a bug.
--
--   The ONLY sanctioned two-step order is:
--     1. For EACH company owned by the user (companies.user_id = the auth
--        user's id), using the service role, call:
--          SELECT public.erase_company_for_compliance('<company_id>');
--        This SECURITY DEFINER wrapper (defined below) sets the escape-hatch
--        GUC tx-locally and then deletes the company row itself in the SAME
--        transaction, so the DELETE cascading through
--        projects/estimates/estimate_signatures never hits this trigger's
--        block.
--     2. ONLY THEN call `auth.admin.deleteUser('<user_id>')`. With every
--        company the user owned already erased, GoTrue's own cascade has
--        nothing left under public.estimates to reach, so the trigger never
--        fires and the delete succeeds normally.
--
--   lib/actions/settings.ts's deleteAccount() implements exactly this order:
--   list the companies the user owns, call
--   erase_company_for_compliance for each, THEN call auth.admin.deleteUser.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS/CREATE
-- TRIGGER, matching the 20260717000005_phase165_estimates_updated_at_trigger.sql
-- convention. Authored-only -- committed and carried by CI->GHCR->Coolify;
-- NOT applied here (never `supabase db push` from this repo).

CREATE OR REPLACE FUNCTION public.block_signed_estimate_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_signature boolean;
BEGIN
  -- Escape hatch: `SET LOCAL app.allow_signed_estimate_delete = 'on'` inside
  -- the deleting transaction bypasses this guard entirely. missing_ok=true
  -- means an unset GUC reads back as NULL (never raises), so this compares
  -- safely against 'on' without needing a prior initialization step.
  IF current_setting('app.allow_signed_estimate_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.estimate_signatures WHERE estimate_id = OLD.id
  ) INTO v_has_signature;

  IF v_has_signature THEN
    RAISE EXCEPTION 'estimate_signed_undeletable' USING ERRCODE = 'P0005';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimates_block_signed_delete ON public.estimates;

CREATE TRIGGER trg_estimates_block_signed_delete
  BEFORE DELETE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.block_signed_estimate_delete();

COMMENT ON FUNCTION public.block_signed_estimate_delete IS
  'Security-hardening S3 (audit finding A): refuses to DELETE an estimates row that has any estimate_signatures row, including when the DELETE arrives via ON DELETE CASCADE from projects/companies. Bypass with SET LOCAL app.allow_signed_estimate_delete = ''on'' inside the transaction for deliberate admin/account-deletion flows. Raises ERRCODE P0005 (estimate_signed_undeletable); P0001-P0004 are already used by save_estimate_atomic (20260717000004).';

-- Fix-pack F2, finding #2 -- GDPR/CCPA erasure escape hatch. See the erasure
-- runbook in this file's header comment for the full two-step account-
-- deletion order. This function is the ONLY sanctioned way to remove a
-- company (and everything under it -- projects, estimates,
-- estimate_signatures) that carries a signed estimate: it opts the DELETE
-- into the same tx-local escape hatch the trigger above already recognizes,
-- scoped to a single service-role-initiated transaction, rather than asking
-- every future admin/compliance code path to know about
-- app.allow_signed_estimate_delete directly.
CREATE OR REPLACE FUNCTION public.erase_company_for_compliance(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- true (third arg) = tx-local, i.e. SET LOCAL semantics: scoped to THIS
  -- function's own transaction only, exactly like the escape hatch's
  -- documented `SET LOCAL app.allow_signed_estimate_delete = 'on'` contract.
  -- It cannot leak into, or be left set for, any other session or statement.
  PERFORM set_config('app.allow_signed_estimate_delete', 'on', true);

  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

-- Service-role only -- this function deliberately bypasses the evidence-
-- retention guard, so it must never be reachable from an authenticated
-- tenant session or the public/anon role. REVOKE first (Postgres grants
-- EXECUTE to PUBLIC by default on every new function), then GRANT back to
-- service_role explicitly rather than relying on default privileges (see
-- fix-pack F2 finding #8 / sign_estimate_atomic's identical posture in
-- 20260729000002).
REVOKE EXECUTE ON FUNCTION public.erase_company_for_compliance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_company_for_compliance(uuid) TO service_role;

COMMENT ON FUNCTION public.erase_company_for_compliance IS
  'GDPR/CCPA erasure escape hatch (fix-pack F2, finding #2) -- the ONLY sanctioned path to delete a company (and its projects/estimates/estimate_signatures) that carries a signed estimate. Sets app.allow_signed_estimate_delete tx-locally via set_config(..., true) then deletes the company row, so trg_estimates_block_signed_delete does not block the cascade. Service-role only -- call once per company the user owns BEFORE auth.admin.deleteUser (see the erasure runbook in this file''s header comment); calling deleteUser first will fail by design.';
