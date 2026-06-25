-- supabase/migrations/20260628000001_phase135_team_seats_schema.sql
-- Phase 135 (SEAT-01): land the v4.12 Team Seats data foundation.
-- Widens company_members.role from ('owner') to ('owner','admin','member')
-- and creates the company_invites store with owner/admin-scoped RLS.
-- Authored-only — committed and carried by CI->GHCR->Coolify; NOT applied on
-- the VPS (never `supabase db push`).
-- Idempotent: DROP/ADD named CHECK + CREATE TABLE/INDEX IF NOT EXISTS +
-- DROP-then-CREATE policies. No secrets — placeholders only.

-- ============================================================
-- 1. WIDEN THE ROLE CHECK (SEAT-01)
-- ============================================================
-- Phase 79 declared role as an INLINE column CHECK with no explicit name, so
-- Postgres auto-named it `company_members_role_check`. Drop it by that name and
-- re-add the widened 3-role matrix. The DEFAULT stays 'owner'; the column type,
-- the PK, and all existing rows are untouched.

ALTER TABLE public.company_members DROP CONSTRAINT IF EXISTS company_members_role_check;
ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

-- ============================================================
-- 2. company_invites TABLE (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'member')),
  token       text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by  uuid REFERENCES auth.users(id),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_invites IS
  'Phase 135 (SEAT-01): pending/accepted team-seat invites for a company. An invite never grants ''owner''. The token-based accept path (Phase 137) runs via the service role, which bypasses RLS — there is intentionally no anon/public/token SELECT policy here.';

-- ============================================================
-- 3. INDEXES (idempotent)
-- ============================================================

CREATE INDEX IF NOT EXISTS company_invites_company_id ON public.company_invites(company_id);
CREATE INDEX IF NOT EXISTS company_invites_token ON public.company_invites(token);

-- ============================================================
-- 4. ROW LEVEL SECURITY (mirrors Phase-79 posture)
-- ============================================================
-- Manage-policies are scoped via a subquery proving the caller is an owner/admin
-- MEMBER of the invite's company. Token-based accept (Phase 137) runs via the
-- service role, which bypasses RLS — no public/anon policy here.

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invites_select" ON public.company_invites;
CREATE POLICY "company_invites_select" ON public.company_invites
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "company_invites_insert" ON public.company_invites;
CREATE POLICY "company_invites_insert" ON public.company_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "company_invites_update" ON public.company_invites;
CREATE POLICY "company_invites_update" ON public.company_invites
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')
    )
  );
